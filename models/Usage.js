const mongoose = require('mongoose');

const UsageSchema = new mongoose.Schema({
  // User can be null for non-authenticated API calls
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // IP address for non-authenticated calls
  ip: {
    type: String,
    index: true
  },
  
  // Type of usage (api, scan, etc.)
  type: {
    type: String,
    required: true,
    enum: ['api', 'scan', 'download'],
    index: true
  },
  
  // Period type (daily, monthly, etc.)
  period: {
    type: String, 
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    index: true
  },
  
  // Start and end of the period
  periodStart: {
    type: Date,
    required: true,
    index: true
  },
  
  periodEnd: {
    type: Date,
    required: true
  },
  
  // Usage count
  count: {
    type: Number,
    default: 0
  },
  
  // Additional metadata (can be used for specific metrics)
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes for faster queries
UsageSchema.index({ user: 1, type: 1, period: 1, periodStart: 1 });
UsageSchema.index({ ip: 1, type: 1, period: 1, periodStart: 1 });

module.exports = mongoose.model('Usage', UsageSchema); 