const express = require('express');
const router = express.Router();
const Docker = require('docker-modem');
const fs = require('fs');

// Create Docker client with proper socket configuration
const docker = new Docker({
  socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock',
  host: null,
  port: null,
  version: 'v1.41'
});

// Get all images
router.get('/', async (req, res, next) => {
  try {
    console.log('Attempting to list images...');
    const opts = {
      path: '/images/json',
      method: 'GET',
      statusCodes: {
        200: true,
        500: 'server error'
      }
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        console.error('Docker API Error:', {
          message: err.message,
          code: err.code,
          statusCode: err.statusCode,
          reason: err.reason
        });
        return res.status(err.statusCode || 500).json({
          error: 'Docker API Error',
          details: err.message,
          code: err.code
        });
      }
      res.json(data);
    });
  } catch (error) {
    console.error('Route Error:', error);
    next(error);
  }
});

// Get image details
router.get('/:id', async (req, res, next) => {
  try {
    const opts = {
      path: `/images/${req.params.id}/json`,
      method: 'GET',
      statusCodes: {
        200: true,
        404: 'no such image',
        500: 'server error'
      }
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        console.error('Docker API Error:', err);
        return res.status(err.statusCode || 500).json({
          error: 'Docker API Error',
          details: err.message,
          code: err.code
        });
      }
      res.json(data);
    });
  } catch (error) {
    next(error);
  }
});

// Pull image
router.post('/pull', async (req, res, next) => {
  try {
    const { imageName } = req.body;
    if (!imageName) {
      return res.status(400).json({ error: 'Image name is required' });
    }

    const opts = {
      path: `/images/create?fromImage=${encodeURIComponent(imageName)}`,
      method: 'POST',
      statusCodes: {
        200: true,
        404: 'repository does not exist',
        500: 'server error'
      }
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        return res.status(err.statusCode || 500).json({
          error: 'Docker API Error',
          details: err.message,
          code: err.code
        });
      }
      res.json({ message: 'Image pulled successfully' });
    });
  } catch (error) {
    next(error);
  }
});

// Delete image
router.delete('/:id', async (req, res, next) => {
  try {
    const opts = {
      path: `/images/${req.params.id}`,
      method: 'DELETE',
      statusCodes: {
        200: true,
        404: 'no such image',
        409: 'conflict',
        500: 'server error'
      }
    };

    docker.dial(opts, (err, data) => {
      if (err) {
        return res.status(err.statusCode || 500).json({
          error: 'Docker API Error',
          details: err.message,
          code: err.code
        });
      }
      res.json(data);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 