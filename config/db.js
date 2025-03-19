const mongoose = require('mongoose');
const env = require('./env');

/**
 * Connect to MongoDB database
 */
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log(`MongoDB URI: ${maskUri(env.MONGODB_URI)}`);
    
    // Set mongoose options
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: env.IS_DEVELOPMENT, // Don't build indexes in production
      serverSelectionTimeoutMS: 5000, // Keep trying to connect for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };
    
    // Connect to MongoDB
    const conn = await mongoose.connect(env.MONGODB_URI, options);
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected, attempting to reconnect...');
    });
    
    return conn;
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    throw err; // Throw the error instead of exiting the process
  }
};

/**
 * Mask the MongoDB URI for secure logging
 * @param {string} uri - MongoDB connection string
 * @returns {string} Masked URI
 */
function maskUri(uri) {
  if (!uri) return 'undefined';
  
  try {
    // Basic URI pattern: mongodb://username:password@host:port/database
    return uri.replace(/(mongodb:\/\/)([^:]+):([^@]+)@/, '$1$2:****@');
  } catch (err) {
    return 'Invalid URI format';
  }
}

module.exports = connectDB; 