const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ],
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false // don't return password in queries
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  subscriptionTier: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free'
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'expired', 'canceled', 'pending'],
    default: 'active'
  },
  subscriptionExpiresAt: {
    type: Date,
    default: null
  },
  scanCount: {
    type: Number,
    default: 0
  },
  lastScanReset: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date
});

// Encrypt password using bcrypt before saving
UserSchema.pre('save', async function(next) {
  // Only hash the password if it's modified
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update the updatedAt field on document update
UserSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Method to match password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role, tier: this.subscriptionTier },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRATION }
  );
};

// Generate refresh token
UserSchema.methods.getRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRATION }
  );
};

// Check if user has used all free scans
UserSchema.methods.hasFreeScanAvailable = function() {
  // Reset counter if it's a new month
  const now = new Date();
  const lastReset = new Date(this.lastScanReset);
  
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.scanCount = 0;
    this.lastScanReset = now;
    this.save();
    return true;
  }
  
  return this.subscriptionTier !== 'free' || this.scanCount < env.FREE_SCAN_LIMIT;
};

// Check if subscription is active
UserSchema.methods.hasActiveSubscription = function() {
  if (this.subscriptionTier === 'free') {
    return true; // Free tier is always active
  }
  
  return this.subscriptionStatus === 'active' && 
         (!this.subscriptionExpiresAt || new Date(this.subscriptionExpiresAt) > new Date());
};

module.exports = mongoose.model('User', UserSchema);
