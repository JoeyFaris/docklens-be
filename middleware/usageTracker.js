const Usage = require('../models/Usage');
const ApiLog = require('../models/ApiLog');

/**
 * Middleware to track API usage for analytics and rate limiting purposes
 * Tracks by user when authenticated and by IP when not
 */
module.exports = async (req, res, next) => {
  // Start timer to measure response time
  const startTime = process.hrtime();
  
  // Store the original end method
  const originalEnd = res.end;
  
  // Override the end method to capture response details
  res.end = function(chunk, encoding) {
    // Calculate response time
    const elapsedTime = process.hrtime(startTime);
    const responseTimeMs = (elapsedTime[0] * 1000) + (elapsedTime[1] / 1000000);
    
    // Restore the original end method and apply it
    res.end = originalEnd;
    res.end(chunk, encoding);
    
    // Don't block the response while we log usage
    process.nextTick(async () => {
      try {
        // Determine identifier (user or IP)
        const userId = req.user ? req.user._id : null;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        
        // Record API usage in the database
        await ApiLog.create({
          endpoint: req.originalUrl,
          method: req.method,
          userId,
          ip,
          statusCode: res.statusCode,
          responseTime: responseTimeMs,
          userAgent: req.headers['user-agent'],
          timestamp: new Date()
        });
        
        // Update daily usage counter
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        
        // Build the filter for finding the right usage record
        const usageFilter = {
          type: 'api',
          period: 'daily',
          periodStart: startOfDay,
          periodEnd: endOfDay,
        };
        
        // Add identifier (user or IP)
        if (userId) {
          usageFilter.user = userId;
        } else {
          usageFilter.ip = ip;
        }
        
        // Find or create the usage record
        const usage = await Usage.findOneAndUpdate(
          usageFilter,
          { 
            $inc: { count: 1 },
            $setOnInsert: {
              user: userId,
              ip: userId ? undefined : ip,
              type: 'api',
              period: 'daily',
              periodStart: startOfDay,
              periodEnd: endOfDay
            }
          },
          { upsert: true, new: true }
        );
        
      } catch (error) {
        console.error('Error tracking API usage:', error);
      }
    });
  };
  
  next();
}; 