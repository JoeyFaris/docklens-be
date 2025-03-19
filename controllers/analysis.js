const util = require('util');
const execAsync = util.promisify(require('child_process').exec);
const Docker = require('dockerode');
const env = require('../config/env');
const User = require('../models/User');
const ScanResult = require('../models/ScanResult');

// Configure Docker client based on environment settings
const dockerOptions = {};

if (env.DOCKER_HOST) {
  // Remote Docker host
  const [protocol, hostPort] = env.DOCKER_HOST.split('://');
  if (protocol === 'tcp') {
    const [host, port] = hostPort.split(':');
    dockerOptions.host = host;
    dockerOptions.port = port || 2375;
  }
} else {
  // Socket path
  dockerOptions.socketPath = env.DOCKER_SOCKET_PATH;
}

const docker = new Docker(dockerOptions);

// Store ongoing scans for non-authenticated access
const ongoingScans = new Map();

// Track active scans for limiting concurrency
let activeScans = 0;

// Initialize Trivy DB
async function initTrivyDB() {
  try {
    console.log('Initializing Trivy DB...');
    const cacheDir = env.TRIVY_CACHE_DIR;
    console.log(`Using cache directory: ${cacheDir}`);
    
    // Try to initialize DB with more verbose output
    const { stdout, stderr } = await execAsync(
      `trivy image --cache-dir ${cacheDir} --download-db-only --debug`, 
      { timeout: 60000 } // 60 seconds timeout
    );
    
    if (stderr) console.log('Trivy DB initialization warnings:', stderr);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize Trivy DB:', error.message);
    if (error.stdout) console.log('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
    return false;
  }
}

// @desc    Start a security scan on a Docker image
// @route   POST /api/analysis/security-scan/:imageId
// @access  Private
exports.startSecurityScan = async (req, res, next) => {
  console.log('Received security scan request for image:', req.params.imageId);
  
  try {
    const { imageId } = req.params;
    
    // Check if we've reached maximum concurrent scans
    if (activeScans >= env.MAX_PARALLEL_SCANS) {
      return res.status(429).json({
        success: false,
        error: 'Too many concurrent scans',
        message: `Maximum of ${env.MAX_PARALLEL_SCANS} concurrent scans allowed. Please try again later.`
      });
    }
    
    // Verify image exists first
    try {
      console.log('Verifying image exists...');
      const image = await docker.getImage(imageId).inspect();
      console.log('Image found:', image.Id);
    } catch (imageError) {
      console.error('Image verification failed:', imageError.message);
      return res.status(404).json({
        success: false,
        error: 'Image not found',
        message: `The image '${imageId}' was not found locally. Please ensure it exists.`
      });
    }
    
    const scanId = `${imageId}_${Date.now()}`;
    console.log('Generated scan ID:', scanId);
    
    // Check if scan is already running for this image
    const existingScan = await ScanResult.findOne({
      imageId,
      status: { $in: ['pending', 'running'] }
    });
    
    if (existingScan) {
      console.log('Scan already in progress for image:', imageId);
      return res.status(409).json({
        success: false,
        error: 'Scan already in progress',
        message: 'A scan is already running for this image. Please wait for it to complete.',
        scanId: existingScan.scanId
      });
    }

    // For authenticated users, increment scan count for free tier users
    if (req.user && req.user.subscriptionTier === 'free') {
      req.user.scanCount += 1;
      await req.user.save();
    }

    // Create a scan result record
    const scanResult = await ScanResult.create({
      scanId,
      imageId,
      status: 'pending',
      user: req.user ? req.user._id : null,
      startTime: new Date()
    });
    
    // Also store in memory for non-authenticated access
    ongoingScans.set(scanId, {
      imageId,
      status: 'pending',
      startTime: new Date(),
      progress: 'Initializing scan...'
    });

    // Increment active scans counter
    activeScans++;

    // Start scan in background
    console.log('Starting background scan...');
    performScan(scanId, imageId, req.user ? req.user._id : null).catch(error => {
      console.error('Background scan error:', error);
      // Always decrement the counter on error
      activeScans = Math.max(0, activeScans - 1);
    });

    // Return immediate response with scan ID
    console.log('Sending initial response...');
    return res.status(202).json({
      success: true,
      scanId,
      status: 'started',
      message: 'Security scan started. Use GET /api/analysis/security-scan/status/:scanId to check progress.'
    });

  } catch (error) {
    console.error('Security scan request error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to start security scan',
      details: error.message
    });
  }
};

// @desc    Get security scan status
// @route   GET /api/analysis/security-scan/status/:scanId
// @access  Private
exports.getSecurityScanStatus = async (req, res, next) => {
  try {
    const { scanId } = req.params;
    
    // First try to get from database
    const scanResult = await ScanResult.findOne({ scanId });
    
    if (scanResult) {
      // Check if the user has access to this scan
      if (req.user && scanResult.user && scanResult.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to access this scan'
        });
      }
      
      // If completed or failed, return the full result
      if (['completed', 'failed'].includes(scanResult.status)) {
        return res.status(200).json({
          success: true,
          data: scanResult
        });
      }
      
      // Otherwise, return the in-progress status
      const inMemoryScan = ongoingScans.get(scanId);
      
      return res.status(200).json({
        success: true,
        data: {
          scanId: scanResult.scanId,
          imageId: scanResult.imageId,
          status: scanResult.status,
          startTime: scanResult.startTime,
          progress: inMemoryScan ? inMemoryScan.progress : 'Scan in progress'
        }
      });
    }
    
    // If not in database, try to get from in-memory map
    const inMemoryScan = ongoingScans.get(scanId);
    
    if (inMemoryScan) {
      return res.status(200).json({
        success: true,
        data: inMemoryScan
      });
    }
    
    // Scan not found
    return res.status(404).json({
      success: false,
      error: 'Scan not found',
      message: 'No scan found with the provided ID'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's scan history
// @route   GET /api/analysis/security-scan/history
// @access  Private
exports.getScanHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    
    const scans = await ScanResult.find({ user: req.user._id })
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await ScanResult.countDocuments({ user: req.user._id });
    
    res.status(200).json({
      success: true,
      data: {
        scans,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Background scan function
async function performScan(scanId, imageId, userId) {
  const cacheDir = env.TRIVY_CACHE_DIR;
  console.log(`[Scan ${scanId}] Starting scan process...`);
  
  try {
    // Update status to show DB initialization
    console.log(`[Scan ${scanId}] Updating status for DB initialization...`);
    
    // Update in-memory status
    ongoingScans.set(scanId, {
      imageId,
      scanId,
      status: 'running',
      startTime: new Date(),
      progress: 'Initializing vulnerability database...'
    });
    
    // Update database status
    await ScanResult.findOneAndUpdate(
      { scanId },
      { 
        status: 'running',
        progress: 'Initializing vulnerability database...'
      }
    );

    const dbInitialized = await initTrivyDB();
    console.log(`[Scan ${scanId}] DB initialization result:`, dbInitialized);
    
    if (!dbInitialized) {
      console.log(`[Scan ${scanId}] DB initialization failed`);
      
      // Update in-memory status
      ongoingScans.set(scanId, {
        imageId,
        scanId,
        status: 'failed',
        error: 'Failed to initialize vulnerability database'
      });
      
      // Update database status
      await ScanResult.findOneAndUpdate(
        { scanId },
        { 
          status: 'failed',
          error: 'Failed to initialize vulnerability database',
          completedAt: new Date()
        }
      );
      
      activeScans = Math.max(0, activeScans - 1);
      return;
    }

    // Update status to show scanning
    console.log(`[Scan ${scanId}] Starting actual scan...`);
    
    // Update in-memory status
    ongoingScans.set(scanId, {
      ...ongoingScans.get(scanId),
      progress: 'Scanning image...'
    });
    
    // Update database status
    await ScanResult.findOneAndUpdate(
      { scanId },
      { progress: 'Scanning image...' }
    );

    // Get the image ID for fallback
    const image = await docker.getImage(imageId).inspect();
    const fullImageId = image.Id.replace('sha256:', '');

    // First try with original image name
    console.log(`[Scan ${scanId}] Attempting scan with image name: ${imageId}`);
    try {
      const trivyCommand = `trivy image --cache-dir ${cacheDir} --format json --timeout ${env.SCAN_TIMEOUT}s ${imageId}`;
      console.log(`[Scan ${scanId}] Command:`, trivyCommand);
      
      const { stdout, stderr } = await execAsync(
        trivyCommand,
        { 
          timeout: (env.SCAN_TIMEOUT * 1000) + 10000, // Add 10 seconds buffer
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
        }
      );
      
      await processResults(stdout, stderr, scanId, imageId, userId);
    } catch (nameError) {
      console.log(`[Scan ${scanId}] Failed with image name, trying with ID:`, nameError.message);
      
      // Try again with the full image ID
      console.log(`[Scan ${scanId}] Attempting scan with image ID: ${fullImageId}`);
      const trivyCommand = `trivy image --cache-dir ${cacheDir} --format json --timeout ${env.SCAN_TIMEOUT}s ${fullImageId}`;
      console.log(`[Scan ${scanId}] Fallback command:`, trivyCommand);
      
      try {
        const { stdout, stderr } = await execAsync(
          trivyCommand,
          { 
            timeout: (env.SCAN_TIMEOUT * 1000) + 10000,
            maxBuffer: 10 * 1024 * 1024
          }
        );
        
        await processResults(stdout, stderr, scanId, imageId, userId);
      } catch (idError) {
        console.error(`[Scan ${scanId}] Both scan attempts failed:`, idError);
        
        // Update in-memory status
        ongoingScans.set(scanId, {
          imageId,
          scanId,
          status: 'failed',
          error: `Scan failed: ${idError.message}`,
          completedAt: new Date()
        });
        
        // Update database status
        await ScanResult.findOneAndUpdate(
          { scanId },
          { 
            status: 'failed',
            error: `Scan failed: ${idError.message}`,
            completedAt: new Date()
          }
        );
        
        throw new Error(`Scan failed with both image name and ID: ${idError.message}`);
      }
    }

    // Clean up old scans from memory after 1 hour
    setTimeout(() => {
      console.log(`[Scan ${scanId}] Cleaning up in-memory scan results`);
      ongoingScans.delete(scanId);
    }, 3600000);

  } catch (error) {
    console.error(`[Scan ${scanId}] Scan error:`, error.message);
    
    // Update in-memory status
    ongoingScans.set(scanId, {
      imageId,
      scanId,
      status: 'failed',
      error: error.message,
      timestamp: new Date()
    });
    
    // Update database status
    await ScanResult.findOneAndUpdate(
      { scanId },
      { 
        status: 'failed',
        error: error.message,
        completedAt: new Date()
      }
    );
    
  } finally {
    // Always decrement active scans counter
    activeScans = Math.max(0, activeScans - 1);
  }
}

// Helper function to process scan results
async function processResults(stdout, stderr, scanId, imageId, userId) {
  console.log(`[Scan ${scanId}] Raw scan output length:`, stdout.length);
  console.log(`[Scan ${scanId}] Scan completed, processing results...`);
  
  let warnings = null;
  if (stderr) {
    console.log(`[Scan ${scanId}] Stderr output:`, stderr);
    warnings = stderr;
  }

  let scanResults;
  try {
    scanResults = JSON.parse(stdout);
    console.log(`[Scan ${scanId}] Successfully parsed JSON results`);
  } catch (parseError) {
    console.error(`[Scan ${scanId}] JSON parse error:`, parseError.message);
    
    // Update in-memory status
    ongoingScans.set(scanId, {
      imageId,
      scanId,
      status: 'failed',
      error: 'Failed to parse scan results',
      completedAt: new Date()
    });
    
    // Update database status
    await ScanResult.findOneAndUpdate(
      { scanId },
      { 
        status: 'failed',
        error: 'Failed to parse scan results',
        completedAt: new Date()
      }
    );
    
    throw new Error('Failed to parse scan results');
  }

  const vulnerabilityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  if (scanResults.Results) {
    console.log(`[Scan ${scanId}] Processing vulnerability counts...`);
    scanResults.Results.forEach(result => {
      if (result.Vulnerabilities) {
        result.Vulnerabilities.forEach(vuln => {
          switch (vuln.Severity.toLowerCase()) {
            case 'critical':
              vulnerabilityCounts.critical++;
              break;
            case 'high':
              vulnerabilityCounts.high++;
              break;
            case 'medium':
              vulnerabilityCounts.medium++;
              break;
            case 'low':
              vulnerabilityCounts.low++;
              break;
          }
        });
      }
    });
    console.log(`[Scan ${scanId}] Vulnerability counts:`, vulnerabilityCounts);
  } else {
    console.log(`[Scan ${scanId}] No vulnerabilities found in results`);
  }

  // Update final results
  console.log(`[Scan ${scanId}] Updating final results...`);
  
  // Update in-memory status
  ongoingScans.set(scanId, {
    imageId,
    scanId,
    status: 'completed',
    completedAt: new Date(),
    vulnerabilities: vulnerabilityCounts,
    warnings
  });
  
  // Update database status
  await ScanResult.findOneAndUpdate(
    { scanId },
    { 
      status: 'completed',
      vulnerabilities: vulnerabilityCounts,
      fullResults: scanResults,
      warnings,
      completedAt: new Date()
    }
  );
  
  console.log(`[Scan ${scanId}] Scan completed successfully`);
}

// @desc    Get a summary of security stats across all scans for the user
// @route   GET /api/analysis/security-scan/summary
// @access  Private
exports.getScanSummary = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Get all completed scans for the user
    const scans = await ScanResult.find({ 
      user: userId,
      status: 'completed'
    });
    
    // Calculate summary stats
    const summary = {
      totalScans: scans.length,
      scansThisMonth: 0,
      totalImages: new Set(),
      vulnerabilityCounts: {
        critical: 0,
        high: 0,
        medium: 0, 
        low: 0
      },
      mostVulnerableImages: [],
      recentScans: []
    };
    
    // Current month boundaries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Process each scan
    scans.forEach(scan => {
      // Count scans this month
      if (new Date(scan.startTime) >= startOfMonth) {
        summary.scansThisMonth++;
      }
      
      // Add to unique images
      summary.totalImages.add(scan.imageId);
      
      // Sum vulnerability counts
      if (scan.vulnerabilities) {
        summary.vulnerabilityCounts.critical += scan.vulnerabilities.critical || 0;
        summary.vulnerabilityCounts.high += scan.vulnerabilities.high || 0;
        summary.vulnerabilityCounts.medium += scan.vulnerabilities.medium || 0;
        summary.vulnerabilityCounts.low += scan.vulnerabilities.low || 0;
      }
    });
    
    // Set total unique images count
    summary.totalImages = summary.totalImages.size;
    
    // Get most vulnerable images (top 5)
    const imageStats = {};
    scans.forEach(scan => {
      if (!imageStats[scan.imageId]) {
        imageStats[scan.imageId] = {
          imageId: scan.imageId,
          totalVulnerabilities: 0,
          critical: 0,
          high: 0,
          lastScan: scan.completedAt
        };
      }
      
      if (scan.vulnerabilities) {
        imageStats[scan.imageId].totalVulnerabilities += 
          (scan.vulnerabilities.critical || 0) + 
          (scan.vulnerabilities.high || 0) + 
          (scan.vulnerabilities.medium || 0) + 
          (scan.vulnerabilities.low || 0);
        
        imageStats[scan.imageId].critical += scan.vulnerabilities.critical || 0;
        imageStats[scan.imageId].high += scan.vulnerabilities.high || 0;
      }
      
      // Update last scan date if newer
      if (new Date(scan.completedAt) > new Date(imageStats[scan.imageId].lastScan)) {
        imageStats[scan.imageId].lastScan = scan.completedAt;
      }
    });
    
    // Convert to array and sort by total vulnerabilities
    summary.mostVulnerableImages = Object.values(imageStats)
      .sort((a, b) => b.totalVulnerabilities - a.totalVulnerabilities)
      .slice(0, 5);
    
    // Get 5 most recent scans
    summary.recentScans = await ScanResult.find({ user: userId })
      .sort({ startTime: -1 })
      .limit(5)
      .select('scanId imageId status startTime completedAt vulnerabilities');
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
}; 