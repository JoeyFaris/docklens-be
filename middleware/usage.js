const UsageStatistic = require('../models/UsageStatistic');

/**
 * Middleware to track user activity
 * @param {string} action - The action being performed
 * @param {Function} getResource - Function to extract resource identifier from request
 * @param {Function} getDetails - Function to extract additional details from request
 */
exports.trackUsage = (action, getResource = null, getDetails = null) => {
  return async (req, res, next) => {
    // Skip tracking for unauthenticated requests
    if (!req.user) {
      return next();
    }

    try {
      const resource = getResource ? getResource(req) : null;
      const details = getDetails ? getDetails(req) : null;
      
      // Create usage record asynchronously without blocking the request
      UsageStatistic.create({
        user: req.user._id,
        action,
        resource,
        details,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }).catch(err => {
        // Log error but don't fail the request
        console.error('Error tracking usage:', err);
      });
      
      // Continue with the request
      next();
    } catch (error) {
      // Errors in tracking should not block the main request
      console.error('Error in usage tracking middleware:', error);
      next();
    }
  };
};

// Common usage trackers
exports.trackLogin = exports.trackUsage('login', 
  null, 
  (req) => ({ email: req.body.email, success: true })
);

exports.trackLoginFailure = exports.trackUsage('login', 
  null, 
  (req) => ({ email: req.body.email, success: false })
);

exports.trackContainerList = exports.trackUsage('container_list');

exports.trackContainerInspect = exports.trackUsage('container_inspect',
  (req) => req.params.id
);

exports.trackImageList = exports.trackUsage('image_list');

exports.trackImageInspect = exports.trackUsage('image_inspect',
  (req) => req.params.id
);

exports.trackSecurityScanStart = exports.trackUsage('security_scan_start',
  (req) => req.params.imageId,
  (req) => ({ scanId: req.body.scanId || `${req.params.imageId}_${Date.now()}` })
);

exports.trackSecurityScanCheck = exports.trackUsage('security_scan_check',
  (req) => req.params.scanId
); 