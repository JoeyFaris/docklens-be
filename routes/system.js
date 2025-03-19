const express = require('express');
const router = express.Router();
const Docker = require('docker-modem');

// Create Docker client with proper socket configuration
const docker = new Docker({
  socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock',
  host: null,
  port: null,
  version: 'v1.41' // Docker API version
});

// Get Docker system information
router.get('/info', async (req, res, next) => {
  try {
    const opts = {
      path: '/info',
      method: 'GET',
      statusCodes: {
        200: true,
        500: 'server error'
      }
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        console.error('Docker API Error:', err);
        return next(err);
      }
      res.json(data);
    });
  } catch (error) {
    console.error('Route Error:', error);
    next(error);
  }
});

// Get Docker version
router.get('/version', async (req, res, next) => {
  try {
    const opts = {
      path: '/version',
      method: 'GET'
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        return next(err);
      }
      res.json(data);
    });
  } catch (error) {
    next(error);
  }
});

// Get system disk usage
router.get('/disk-usage', async (req, res, next) => {
  try {
    const opts = {
      path: '/system/df',
      method: 'GET'
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        return next(err);
      }
      res.json(data);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 