const User = require('../models/User');

// @desc    Get user's subscription details
// @route   GET /api/subscription
// @access  Private
exports.getSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      data: {
        tier: user.subscriptionTier,
        status: user.subscriptionStatus,
        expiresAt: user.subscriptionExpiresAt,
        scanCount: user.subscriptionTier === 'free' ? user.scanCount : 'unlimited',
        scansRemaining: user.subscriptionTier === 'free' ? 
          (process.env.FREE_SCAN_LIMIT - user.scanCount) : 'unlimited'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upgrade to premium subscription
// @route   POST /api/subscription/upgrade
// @access  Private
exports.upgradeToPremium = async (req, res, next) => {
  try {
    // In a real application, this would include payment processing
    // For this example, we'll just update the subscription
    
    const { plan } = req.body;
    
    if (!plan || !['premium', 'enterprise'].includes(plan)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid subscription plan (premium or enterprise)'
      });
    }
    
    // Set expiration to 1 year from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        subscriptionTier: plan,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: expiresAt
      },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      data: {
        tier: user.subscriptionTier,
        status: user.subscriptionStatus,
        expiresAt: user.subscriptionExpiresAt,
        message: `Successfully upgraded to ${plan} plan`
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel subscription
// @route   POST /api/subscription/cancel
// @access  Private
exports.cancelSubscription = async (req, res, next) => {
  try {
    // In a real application, this would include payment processing cancellation
    
    // Only update if user is not already on free plan
    if (req.user.subscriptionTier === 'free') {
      return res.status(400).json({
        success: false,
        error: 'You are already on the free plan'
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        subscriptionStatus: 'canceled'
      },
      { new: true }
    );
    
    // We're not downgrading immediately, just marking as canceled
    // In a real app, there might be logic to downgrade at the end of the billing period
    
    res.status(200).json({
      success: true,
      data: {
        tier: user.subscriptionTier,
        status: user.subscriptionStatus,
        expiresAt: user.subscriptionExpiresAt,
        message: 'Subscription has been canceled. You will be downgraded to the free plan when your current subscription expires.'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get available subscription plans
// @route   GET /api/subscription/plans
// @access  Public
exports.getSubscriptionPlans = async (req, res, next) => {
  try {
    // This would typically come from a database
    const plans = [
      {
        id: 'free',
        name: 'Free',
        description: 'Basic Docker container and image analysis',
        price: 0,
        interval: null,
        features: [
          'View running containers',
          'Basic container stats',
          'View Docker images',
          `${process.env.FREE_SCAN_LIMIT} security scans per month`,
          'Basic vulnerability reporting'
        ]
      },
      {
        id: 'premium',
        name: 'Premium',
        description: 'Advanced container analytics and unlimited security scanning',
        price: 9.99,
        interval: 'month',
        features: [
          'All Free features',
          'Unlimited security scans',
          'Detailed vulnerability analysis',
          'Vulnerability remediation suggestions',
          'Historical scan data'
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Full-featured Docker security and monitoring solution for teams',
        price: 49.99,
        interval: 'month',
        features: [
          'All Premium features',
          'Team collaboration',
          'Custom policies and compliance rules',
          'Advanced image analysis',
          'Priority support'
        ]
      }
    ];
    
    res.status(200).json({
      success: true,
      data: plans
    });
  } catch (error) {
    next(error);
  }
}; 