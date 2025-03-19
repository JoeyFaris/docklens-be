const env = require('../config/env');
const Usage = require('../models/Usage');

/**
 * Middleware to enforce scan limits based on user subscription
 * Free tier users are limited to a certain number of scans per month
 * Premium users have unlimited scans
 */
module.exports = async (req, res, next) => {
  try {
    // Skip limit check for premium users or if no user is authenticated
    if (!req.user || req.user.subscriptionTier === 'premium') {
      return next();
    }

    // For free tier users, check and enforce limits
    if (req.user.subscriptionTier === 'free') {
      // Get current month's scan count
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      // Find or create usage record for current month
      let usage = await Usage.findOne({
        user: req.user._id,
        type: 'scan',
        period: 'monthly',
        periodStart: startOfMonth,
        periodEnd: endOfMonth
      });
      
      if (!usage) {
        usage = new Usage({
          user: req.user._id,
          type: 'scan',
          period: 'monthly',
          count: 0,
          periodStart: startOfMonth,
          periodEnd: endOfMonth
        });
      }
      
      // Check if limit has been reached
      if (usage.count >= env.FREE_SCAN_LIMIT) {
        return res.status(403).json({
          success: false,
          error: 'Scan limit reached',
          message: `Free tier is limited to ${env.FREE_SCAN_LIMIT} scans per month. Please upgrade to premium for unlimited scans.`,
          currentUsage: usage.count,
          limit: env.FREE_SCAN_LIMIT
        });
      }
      
      // Increment the usage count and save
      usage.count += 1;
      await usage.save();
      
      // Store updated count in the request for controllers
      req.scanUsage = usage.count;
    }
    
    next();
  } catch (error) {
    console.error('Scan limiter error:', error);
    // Don't block the request on limiter errors
    next();
  }
}; 