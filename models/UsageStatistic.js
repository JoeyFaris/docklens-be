const mongoose = require('mongoose');

const UsageStatisticSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login', 
      'container_list', 
      'container_inspect', 
      'image_list', 
      'image_inspect', 
      'security_scan_start', 
      'security_scan_check'
    ]
  },
  resource: {
    type: String,
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Create indexes for efficient querying
UsageStatisticSchema.index({ user: 1, createdAt: -1 });
UsageStatisticSchema.index({ action: 1 });
UsageStatisticSchema.index({ date: 1 });

module.exports = mongoose.model('UsageStatistic', UsageStatisticSchema); 