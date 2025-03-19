const env = require('../config/env');

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  console.error(`Error: ${err.message}`.red);
  if (env.IS_DEVELOPMENT) {
    console.error(err.stack);
  }

  // Initialize error object
  const error = {
    success: false,
    error: err.message || 'Server Error',
    status: err.statusCode || 500
  };

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(val => val.message).join(', ');
    error.status = 400;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    error.message = `Duplicate field value entered: ${Object.keys(err.keyValue).join(', ')}`;
    error.status = 400;
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = `Resource not found with id of ${err.value}`;
    error.status = 404;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token. Please log in again.';
    error.status = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired. Please log in again.';
    error.status = 401;
  }

  // Add stack trace in development
  if (env.IS_DEVELOPMENT) {
    error.stack = err.stack;
  }

  // Send response
  res.status(error.status).json({
    success: false,
    error: error.message,
    ...(env.IS_DEVELOPMENT && { stack: error.stack })
  });
};

module.exports = errorHandler; 