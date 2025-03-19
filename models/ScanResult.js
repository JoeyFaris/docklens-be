const mongoose = require('mongoose');

const ScanResultSchema = new mongoose.Schema({
  scanId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  imageId: {
    type: String, 
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  progress: {
    type: String
  },
  error: {
    type: String
  },
  vulnerabilities: {
    critical: {
      type: Number,
      default: 0
    },
    high: {
      type: Number,
      default: 0
    },
    medium: {
      type: Number,
      default: 0
    },
    low: {
      type: Number,
      default: 0
    }
  },
  warnings: {
    type: String
  },
  fullResults: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Index for faster queries
ScanResultSchema.index({ imageId: 1, status: 1 });
ScanResultSchema.index({ user: 1, startTime: -1 });

// Virtual for total vulnerabilities
ScanResultSchema.virtual('totalVulnerabilities').get(function() {
  if (!this.vulnerabilities) return 0;
  
  return (
    (this.vulnerabilities.critical || 0) +
    (this.vulnerabilities.high || 0) +
    (this.vulnerabilities.medium || 0) +
    (this.vulnerabilities.low || 0)
  );
});

// Method to get a summary of the scan result
ScanResultSchema.methods.getSummary = function() {
  return {
    scanId: this.scanId,
    imageId: this.imageId,
    status: this.status,
    startTime: this.startTime,
    completedAt: this.completedAt,
    vulnerabilities: this.vulnerabilities,
    totalVulnerabilities: this.totalVulnerabilities
  };
};

module.exports = mongoose.model('ScanResult', ScanResultSchema); 