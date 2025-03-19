const express = require('express');
const router = express.Router();
const Docker = require('dockerode');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);
const os = require('os');
const path = require('path');
const fs = require('fs');
const { auth, authOptional } = require('../middleware/auth');
const usageTracker = require('../middleware/usageTracker');
const scanLimiter = require('../middleware/scanLimiter');
const analysisController = require('../controllers/analysis');

// Import environment configuration
const env = require('../config/env');

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

// Add TLS configuration if enabled
if (env.DOCKER_TLS_VERIFY && env.DOCKER_CERT_PATH) {
  dockerOptions.ca = fs.readFileSync(path.join(env.DOCKER_CERT_PATH, 'ca.pem'));
  dockerOptions.cert = fs.readFileSync(path.join(env.DOCKER_CERT_PATH, 'cert.pem'));
  dockerOptions.key = fs.readFileSync(path.join(env.DOCKER_CERT_PATH, 'key.pem'));
}

const docker = new Docker(dockerOptions);

// Store ongoing scans
const ongoingScans = new Map();

// Track active scans for limiting concurrency
let activeScans = 0;

// Initialize Trivy DB
async function initTrivyDB() {
  try {
    console.log('Initializing Trivy DB...');
    const cacheDir = env.TRIVY_CACHE_DIR;
    console.log(`Using cache directory: ${cacheDir}`);
    
    // Ensure cache directory exists
    const { execSync } = require('child_process');
    execSync(`mkdir -p ${cacheDir}`);
    
    // Try to initialize DB with more verbose output
    const { stdout, stderr } = await execAsync(
      `trivy image --cache-dir ${cacheDir} --download-db-only --debug`, 
      { timeout: 60000 } // 60 seconds timeout
    );
    console.log('Trivy DB initialization stdout:', stdout);
    if (stderr) console.error('Trivy DB initialization stderr:', stderr);
    return true;
  } catch (error) {
    console.error('Failed to initialize Trivy DB:', error);
    if (error.stdout) console.log('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
    return false;
  }
}

// Security scan routes
router.post(
  '/security-scan/:imageId',
  authOptional,  // Allow anonymous access but track if authenticated
  usageTracker, // Track API usage
  scanLimiter,  // Limit scans based on subscription
  analysisController.startSecurityScan
);

router.get(
  '/security-scan/status/:scanId',
  authOptional,
  analysisController.getSecurityScanStatus
);

router.get(
  '/security-scan/history',
  auth,
  analysisController.getScanHistory
);

router.get(
  '/security-scan/summary',
  auth,
  analysisController.getScanSummary
);

// Background scan function
async function performScan(scanId, imageId) {
  const cacheDir = env.TRIVY_CACHE_DIR;
  console.log(`[Scan ${scanId}] Starting scan process...`);
  
  try {
    // Update status to show DB initialization
    console.log(`[Scan ${scanId}] Updating status for DB initialization...`);
    ongoingScans.set(scanId, {
      ...ongoingScans.get(scanId),
      progress: 'Initializing vulnerability database...'
    });

    const dbInitialized = await initTrivyDB();
    console.log(`[Scan ${scanId}] DB initialization result:`, dbInitialized);
    
    if (!dbInitialized) {
      console.log(`[Scan ${scanId}] DB initialization failed`);
      ongoingScans.set(scanId, {
        imageId,
        status: 'failed',
        error: 'Failed to initialize vulnerability database'
      });
      activeScans = Math.max(0, activeScans - 1);
      return;
    }

    // Update status to show scanning
    console.log(`[Scan ${scanId}] Starting actual scan...`);
    ongoingScans.set(scanId, {
      ...ongoingScans.get(scanId),
      progress: 'Scanning image...'
    });

    // Get the image ID for fallback
    const image = await docker.getImage(imageId).inspect();
    const fullImageId = image.Id.replace('sha256:', '');

    // First try with original image name
    console.log(`[Scan ${scanId}] Attempting scan with image name: ${imageId}`);
    try {
      const trivyCommand = `trivy image --cache-dir ${cacheDir} --format json --debug --timeout ${env.SCAN_TIMEOUT}s ${imageId}`;
      console.log(`[Scan ${scanId}] Command:`, trivyCommand);
      
      const { stdout, stderr } = await execAsync(
        trivyCommand,
        { 
          timeout: (env.SCAN_TIMEOUT * 1000) + 10000, // Add 10 seconds buffer
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
        }
      );
      
      await processResults(stdout, stderr, scanId, imageId);
    } catch (nameError) {
      console.log(`[Scan ${scanId}] Failed with image name, trying with ID:`, nameError.message);
      
      // Try again with the full image ID
      console.log(`[Scan ${scanId}] Attempting scan with image ID: ${fullImageId}`);
      const trivyCommand = `trivy image --cache-dir ${cacheDir} --format json --debug --timeout ${env.SCAN_TIMEOUT}s ${fullImageId}`;
      console.log(`[Scan ${scanId}] Fallback command:`, trivyCommand);
      
      try {
        const { stdout, stderr } = await execAsync(
          trivyCommand,
          { 
            timeout: (env.SCAN_TIMEOUT * 1000) + 10000,
            maxBuffer: 10 * 1024 * 1024
          }
        );
        
        await processResults(stdout, stderr, scanId, imageId);
      } catch (idError) {
        console.error(`[Scan ${scanId}] Both scan attempts failed:`, idError);
        throw new Error(`Scan failed with both image name and ID: ${idError.message}`);
      }
    }

    // Clean up old scans after 1 hour
    setTimeout(() => {
      console.log(`[Scan ${scanId}] Cleaning up scan results`);
      ongoingScans.delete(scanId);
    }, 3600000);

  } catch (error) {
    console.error(`[Scan ${scanId}] Scan error:`, error);
    console.error(`[Scan ${scanId}] Error stack:`, error.stack);
    if (error.stdout) console.log(`[Scan ${scanId}] Error stdout:`, error.stdout);
    if (error.stderr) console.error(`[Scan ${scanId}] Error stderr:`, error.stderr);
    
    ongoingScans.set(scanId, {
      imageId,
      status: 'failed',
      error: error.message,
      details: error.stderr || 'No additional error details available',
      timestamp: new Date()
    });
  } finally {
    // Always decrement active scans counter
    activeScans = Math.max(0, activeScans - 1);
  }
}

// Helper function to process scan results
async function processResults(stdout, stderr, scanId, imageId) {
  console.log(`[Scan ${scanId}] Raw scan output length:`, stdout.length);
  console.log(`[Scan ${scanId}] Scan completed, processing results...`);
  
  if (stderr) {
    console.log(`[Scan ${scanId}] Stderr output:`, stderr);
    ongoingScans.set(scanId, {
      ...ongoingScans.get(scanId),
      progress: 'Processing results with warnings...',
      warnings: stderr
    });
  }

  let scanResults;
  try {
    scanResults = JSON.parse(stdout);
    console.log(`[Scan ${scanId}] Successfully parsed JSON results`);
  } catch (parseError) {
    console.error(`[Scan ${scanId}] JSON parse error:`, parseError);
    console.log(`[Scan ${scanId}] Raw output:`, stdout);
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
  ongoingScans.set(scanId, {
    imageId,
    scanId,
    status: 'completed',
    completedAt: new Date(),
    vulnerabilities: vulnerabilityCounts,
    fullResults: scanResults,
    warnings: stderr || undefined
  });
  console.log(`[Scan ${scanId}] Scan completed successfully`);
}

// Performance Analysis endpoint
router.get('/performance/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const container = await docker.createContainer({
      Image: imageId,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ['/bin/sh', '-c', 'stress --cpu 1 --timeout 10s'],
      HostConfig: {
        AutoRemove: true
      }
    });

    await container.start();
    
    const stats = await container.stats({ stream: false });
    
    res.json({
      imageId,
      performance: {
        cpuUsage: calculateCPUPercentage(stats),
        memoryUsage: {
          used: stats.memory_stats.usage,
          limit: stats.memory_stats.limit,
          percentage: (stats.memory_stats.usage / stats.memory_stats.limit) * 100
        },
        networkIO: {
          rx_bytes: stats.networks?.eth0?.rx_bytes || 0,
          tx_bytes: stats.networks?.eth0?.tx_bytes || 0
        },
        blockIO: stats.blkio_stats
      },
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resource Monitoring endpoint
router.get('/resources/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const image = await docker.getImage(imageId);
    const imageInfo = await image.inspect();

    res.json({
      imageId,
      resources: {
        size: imageInfo.Size,
        virtualSize: imageInfo.VirtualSize,
        layers: imageInfo.RootFS.Layers.length,
        created: imageInfo.Created,
        architecture: imageInfo.Architecture,
        os: imageInfo.Os,
        author: imageInfo.Author,
        exposedPorts: imageInfo.Config.ExposedPorts,
        volumes: imageInfo.Config.Volumes,
        labels: imageInfo.Config.Labels
      },
      recommendations: {
        // Add basic recommendations based on image analysis
        multiStage: imageInfo.Size > 500000000 ? "Consider using multi-stage builds to reduce image size" : null,
        baseImage: imageInfo.Config.Labels['maintainer'] ? "Base image is properly labeled" : "Add maintainer label",
        layerCount: imageInfo.RootFS.Layers.length > 10 ? "Consider reducing number of layers" : "Layer count is optimal"
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate CPU percentage
function calculateCPUPercentage(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  
  return (cpuDelta / systemDelta) * cpuCount * 100;
}

module.exports = router; 