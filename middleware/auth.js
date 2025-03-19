const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');

/**
 * Middleware to authenticate users based on JWT token
 * Rejects requests without a valid token
 */
exports.auth = async (req, res, next) => {
  try {
    // Get token from Authorization header (format: "Bearer TOKEN")
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      
      // Find user by ID from token
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'User not found'
        });
      }
      
      // Add user to request object
      req.user = user;
      next();
    } catch (tokenError) {
      console.error('Token verification error:', tokenError.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Please log in again'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Authentication service unavailable'
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid
 * Continues without error if no token or invalid token
 */
exports.authOptional = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    // If no token is provided, continue without authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    // Try to verify token, but don't reject if invalid
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      
      // Find user by ID from token
      const user = await User.findById(decoded.id);
      
      if (user) {
        // Add user to request object if found
        req.user = user;
      }
    } catch (tokenError) {
      // Just log the error but don't block the request
      console.log('Optional auth token invalid:', tokenError.message);
    }
    
    // Always continue to the next middleware
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Don't block the request on auth errors
    next();
  }
};

// Check if user is premium
exports.isPremium = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }
  
  if (req.user.subscriptionTier === 'free') {
    return res.status(403).json({
      success: false,
      error: 'This feature requires a premium subscription'
    });
  }
  
  // Check if subscription is active
  if (!req.user.hasActiveSubscription()) {
    return res.status(403).json({
      success: false,
      error: 'Your premium subscription has expired'
    });
  }
  
  next();
};

// Check if user is admin
exports.isAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  
  next();
};

// Check if user has free scans available or is premium
exports.hasScanAccess = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }
  
  // Premium users always have access
  if (req.user.subscriptionTier !== 'free') {
    return next();
  }
  
  // Check if free user has scans remaining
  if (!req.user.hasFreeScanAvailable()) {
    return res.status(403).json({
      success: false,
      error: `You've reached your limit of ${env.FREE_SCAN_LIMIT} free scans this month. Upgrade to premium for unlimited scans.`
    });
  }
  
  next();
}; 