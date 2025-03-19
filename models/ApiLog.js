const mongoose = require('mongoose');

const ApiLogSchema = new mongoose.Schema({
  // Optional user reference - will be null for non-authenticated calls
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // IP address of the client
  ip: {
    type: String,
    index: true
  },
  
  // Request details
  endpoint: {
    type: String,
    required: true,
    index: true
  },
  
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  },
  
  // Response details
  statusCode: {
    type: Number,
    required: true,
    index: true
  },
  
  responseTime: {
    type: Number,  // in milliseconds
    required: true
  },
  
  // Client details
  userAgent: {
    type: String
  },
  
  // When the request was made
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Additional details (query params, body, etc.) - optional
  // Note: Be careful with sensitive data
  details: {
    type: mongoose.Schema.Types.Mixed
  }
});

// TTL index to automatically delete old logs (90 days)
ApiLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

// Compound indexes for common queries
ApiLogSchema.index({ userId: 1, timestamp: -1 });
ApiLogSchema.index({ endpoint: 1, method: 1, timestamp: -1 });
ApiLogSchema.index({ statusCode: 1, timestamp: -1 });

module.exports = mongoose.model('ApiLog', ApiLogSchema); 