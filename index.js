const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const mongoose = require('mongoose');

// Load configuration
const env = require('./config/env');
const connectDB = require('./config/db');

// Import route files
const containerRoutes = require('./routes/containers');
const systemRoutes = require('./routes/system');
const imageRoutes = require('./routes/images');
const analysisRoutes = require('./routes/analysis');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const subscriptionRoutes = require('./routes/subscription');

// Import error handling middleware
const errorHandler = require('./middleware/error');

// Create Express app
const app = express();

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization middleware
app.use(mongoSanitize()); // Prevent MongoDB operator injection
app.use(xss());           // Sanitize user input

// Setup logging
if (env.FILE_LOGGING) {
  // Ensure log directory exists
  const logDir = path.dirname(env.LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Create a write stream for logs
  const accessLogStream = fs.createWriteStream(env.LOG_FILE_PATH, { flags: 'a' });
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // Console logging in development
  app.use(morgan(env.IS_PRODUCTION ? 'combined' : 'dev'));
}

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: env.ALLOW_ALL_ORIGINS ? '*' : env.ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// Rate limiting
if (env.ENABLE_RATE_LIMIT) {
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests from this IP, please try again later.'
    }
  });
  app.use(limiter);
}

// Mount routers
app.use('/api/containers', containerRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Basic health check route
app.get('/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const mongoStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }[mongoStatus] || 'unknown';
  
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    db: mongoStatusText,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      mongodb: mongoStatus === 1 ? 'healthy' : 'unavailable',
      api: 'healthy'
    }
  });
});

// Error handler middleware (must be after all route definitions)
app.use(errorHandler);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Connect to database and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    try {
      await connectDB();
      console.log('✅ MongoDB connection successful');
    } catch (dbError) {
      console.warn('⚠️ MongoDB connection failed:', dbError.message);
      console.warn('⚠️ Running in limited mode without database functionality');
      console.warn('⚠️ Some API endpoints that require database access will not work');
    }
    
    // Start the server
    const PORT = env.PORT;
    app.listen(PORT, () => {
      console.log(`✅ DockLens Backend running on port ${PORT} in ${env.NODE_ENV} mode`);
      console.log(`🔍 Health check available at: http://localhost:${PORT}/health`);
      console.log(`🔒 Rate limiting: ${env.ENABLE_RATE_LIMIT ? 'Enabled' : 'Disabled'}`);
      console.log(`🌐 CORS: ${env.ALLOW_ALL_ORIGINS ? 'All origins allowed' : 'Restricted origins'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  // Don't crash the server, but log the issue
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // Gracefully exit since the app might be in an unstable state
  process.exit(1);
});

// Start the server
startServer(); 