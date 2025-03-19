const path = require('path');
const os = require('os');

// Load environment variables from .env file
require('dotenv').config();

// Environment Configuration
const env = {
  // Server Configuration
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Trivy Configuration
  TRIVY_CACHE_DIR: process.env.TRIVY_CACHE_DIR || path.join(os.homedir(), '.cache/trivy'),
  
  // Security Settings
  ENABLE_RATE_LIMIT: process.env.ENABLE_RATE_LIMIT === 'true',
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  
  // Docker Connection
  DOCKER_HOST: process.env.DOCKER_HOST || null,
  DOCKER_SOCKET_PATH: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock',
  DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY === '1',
  DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH || null,
  
  // Scan Configuration
  SCAN_TIMEOUT: parseInt(process.env.SCAN_TIMEOUT, 10) || 300,
  MAX_PARALLEL_SCANS: parseInt(process.env.MAX_PARALLEL_SCANS, 10) || 3,
  
  // CORS Settings
  ALLOW_ALL_ORIGINS: process.env.ALLOW_ALL_ORIGINS === 'true',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3001'],
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  FILE_LOGGING: process.env.FILE_LOGGING === 'true',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/server.log',
  
  // MongoDB Connection
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/docklens',
  
  // JWT Authentication
  JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production',
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '1d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_key_change_this_in_production',
  JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION || '7d',
  
  // Premium Features
  FREE_SCAN_LIMIT: parseInt(process.env.FREE_SCAN_LIMIT, 10) || 5,
  
  // Derived values
  IS_PRODUCTION: (process.env.NODE_ENV || 'development') === 'production',
  IS_DEVELOPMENT: (process.env.NODE_ENV || 'development') === 'development',
  IS_TEST: (process.env.NODE_ENV || 'development') === 'test',
};

// Validate required configurations
function validateEnv() {
  const errors = [];
  
  // Add validation rules here if necessary
  if (env.IS_PRODUCTION && env.ALLOW_ALL_ORIGINS) {
    errors.push('ALLOW_ALL_ORIGINS should not be true in production environment');
  }
  
  if (env.IS_PRODUCTION && env.JWT_SECRET === 'your_jwt_secret_key_change_this_in_production') {
    errors.push('JWT_SECRET should be changed in production environment');
  }
  
  if (env.IS_PRODUCTION && env.JWT_REFRESH_SECRET === 'your_refresh_secret_key_change_this_in_production') {
    errors.push('JWT_REFRESH_SECRET should be changed in production environment');
  }
  
  if (errors.length > 0) {
    console.error('Environment validation failed:');
    errors.forEach(err => console.error(`- ${err}`));
    process.exit(1);
  }
}

// Run validation
validateEnv();

module.exports = env; 