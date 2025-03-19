const express = require('express');
const router = express.Router();
const { auth, isAdmin } = require('../middleware/auth');

// @route   GET api/subscription
// @desc    Get current user's subscription status
// @access  Private
router.get('/', auth, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      type: req.user.subscriptionType || 'free',
      status: req.user.subscriptionStatus || 'active',
      expiresAt: req.user.subscriptionExpiresAt || null,
      scansRemaining: req.user.scansRemaining
    }
  });
});

// @route   POST api/subscription/upgrade
// @desc    Upgrade subscription (placeholder for payment integration)
// @access  Private
router.post('/upgrade', auth, (req, res) => {
  // This would typically integrate with a payment processor
  // For now, just return a placeholder response
  res.status(200).json({
    success: true,
    message: 'Subscription upgrade endpoint (to be implemented)',
    data: {
      type: 'premium',
      status: 'active'
    }
  });
});

// @route   GET api/subscription/plans
// @desc    Get available subscription plans
// @access  Public
router.get('/plans', (req, res) => {
  res.status(200).json({
    success: true,
    data: [
      {
        id: 'free',
        name: 'Free',
        description: 'Basic container scanning with limited features',
        price: 0,
        features: ['Limited scans per month', 'Basic vulnerability reporting']
      },
      {
        id: 'premium',
        name: 'Premium',
        description: 'Advanced container security scanning',
        price: 19.99,
        features: ['Unlimited scans', 'Advanced vulnerability assessment', 'Historical scan data']
      }
    ]
  });
});

module.exports = router; 