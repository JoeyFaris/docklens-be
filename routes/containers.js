const express = require('express');
const router = express.Router();
const Docker = require('docker-modem');
const fs = require('fs');

// Function to check Docker socket availability
function checkDockerSocket() {
  const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
  try {
    fs.accessSync(socketPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (error) {
    console.error(`Docker socket not accessible: ${error.message}`);
    return false;
  }
}

// Create Docker client with proper socket configuration
const docker = new Docker({
  socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock',
  host: null,
  port: null,
  version: 'v1.41' // Docker API version
});

// Middleware to check Docker availability
router.use((req, res, next) => {
  if (!checkDockerSocket()) {
    return res.status(503).json({
      error: 'Docker is not available',
      details: 'Please ensure Docker Desktop is running and you have necessary permissions',
      socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'
    });
  }
  next();
});

// Get all containers
router.get('/', async (req, res) => {
  try {
    // Call Docker API to list containers
    const opts = {
      path: '/containers/json?all=true',
      method: 'GET',
      statusCodes: {
        200: true,
        400: 'bad parameter',
        500: 'server error'
      }
    };

    // Make request to Docker daemon
    docker.dial(opts, (err, containers) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to get containers',
          error: err.message
        });
      }

      // Transform container data into consistent format
      const containerList = containers.map(container => ({
        id: container.Id,
        name: container.Names[0].replace(/^\//, ''), // Remove leading slash
        image: container.Image,
        status: container.State,
        created: new Date(container.Created * 1000).toISOString(),
        ports: container.Ports,
        state: container.Status
      }));

      res.status(200).json({
        success: true,
        message: 'Successfully retrieved containers',
        data: containerList
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving containers',
      error: error.message
    });
  }
});

// Get single container
router.get('/:id', async (req, res) => {
  try {
    // Call Docker API to inspect container
    const opts = {
      path: `/containers/${req.params.id}/json`,
      method: 'GET',
      statusCodes: {
        200: true,
        404: 'no such container',
        500: 'server error'
      }
    };

    // Make request to Docker daemon
    docker.dial(opts, (err, container) => {
      if (err) {
        if (err.statusCode === 404) {
          return res.status(404).json({
            success: false,
            message: 'Container not found',
            error: 'No such container'
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to get container details',
          error: err.message
        });
      }

      // Transform container data into consistent format
      const containerDetails = {
        id: container.Id,
        name: container.Name.replace(/^\//, ''), // Remove leading slash
        image: container.Config.Image,
        status: container.State.Status,
        created: container.Created,
        ports: Object.keys(container.NetworkSettings.Ports || {}).map(port => {
          const mapping = container.NetworkSettings.Ports[port];
          const [hostPort, hostIP] = mapping ? [mapping[0].HostPort, mapping[0].HostIp] : [null, null];
          return {
            internal: parseInt(port.split('/')[0]),
            external: hostPort ? parseInt(hostPort) : null,
            protocol: port.split('/')[1],
            hostIP: hostIP !== '0.0.0.0' ? hostIP : null
          };
        }),
        mounts: container.Mounts.map(mount => ({
          source: mount.Source,
          destination: mount.Destination,
          mode: mount.Mode
        })),
        networks: container.NetworkSettings.Networks,
        state: container.State,
        env: container.Config.Env
      };

      res.status(200).json({
        success: true,
        message: 'Container details retrieved successfully',
        data: containerDetails
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving container details',
      error: error.message
    });
  }
});

// Create container (placeholder)
router.post('/', (req, res) => {
  res.status(201).json({
    success: true,
    message: 'Create container functionality not yet implemented',
    data: {
      id: 'new-container-id',
      name: req.body.name || 'new-container',
      image: req.body.image || 'nginx:latest',
      status: 'created',
      created: new Date().toISOString()
    }
  });
});

// Start container
router.post('/:id/start', async (req, res) => {
  try {
    // Call Docker API to start container
    const opts = {
      path: `/containers/${req.params.id}/start`,
      method: 'POST',
      statusCodes: {
        204: true,
        304: 'container already started',
        404: 'no such container',
        500: 'server error'
      }
    };

    // Make request to Docker daemon
    docker.dial(opts, (err, data) => {
      if (err) {
        if (err.statusCode === 404) {
          return res.status(404).json({
            success: false,
            message: 'Container not found',
            error: 'No such container'
          });
        } else if (err.statusCode === 304) {
          return res.status(200).json({
            success: true,
            message: 'Container is already running',
            data: {
              id: req.params.id,
              status: 'running'
            }
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to start container',
          error: err.message
        });
      }

      res.status(200).json({
        success: true,
        message: 'Container started successfully',
        data: {
          id: req.params.id,
          status: 'running'
        }
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error starting container',
      error: error.message
    });
  }
});

// Stop container
router.post('/:id/stop', async (req, res) => {
  try {
    // Call Docker API to stop container
    const opts = {
      path: `/containers/${req.params.id}/stop`,
      method: 'POST',
      statusCodes: {
        204: true,
        304: 'container already stopped',
        404: 'no such container',
        500: 'server error'
      }
    };

    // Make request to Docker daemon
    docker.dial(opts, (err, data) => {
      if (err) {
        if (err.statusCode === 404) {
          return res.status(404).json({
            success: false,
            message: 'Container not found',
            error: 'No such container'
          });
        } else if (err.statusCode === 304) {
          return res.status(200).json({
            success: true,
            message: 'Container is already stopped',
            data: {
              id: req.params.id,
              status: 'stopped'
            }
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to stop container',
          error: err.message
        });
      }

      res.status(200).json({
        success: true,
        message: 'Container stopped successfully',
        data: {
          id: req.params.id,
          status: 'stopped'
        }
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error stopping container',
      error: error.message
    });
  }
});

// Delete container
router.delete('/:id', async (req, res) => {
  try {
    // Call Docker API to delete container
    const opts = {
      path: `/containers/${req.params.id}?force=${req.query.force === 'true'}&v=${req.query.v === 'true'}`,
      method: 'DELETE',
      statusCodes: {
        204: true,
        400: 'bad parameter',
        404: 'no such container',
        409: 'conflict',
        500: 'server error'
      }
    };

    // Make request to Docker daemon
    docker.dial(opts, (err, data) => {
      if (err) {
        if (err.statusCode === 404) {
          return res.status(404).json({
            success: false,
            message: 'Container not found',
            error: 'No such container'
          });
        } else if (err.statusCode === 409) {
          return res.status(409).json({
            success: false,
            message: 'Cannot delete running container. Use force=true or stop the container first',
            error: 'Conflict: container is running'
          });
        }
        return res.status(err.statusCode || 500).json({
          success: false,
          message: 'Failed to delete container',
          error: err.message
        });
      }

      res.status(200).json({
        success: true,
        message: 'Container deleted successfully',
        data: {}
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting container',
      error: error.message
    });
  }
});

// Get container stats
router.get('/:id/stats', async (req, res, next) => {
  try {
    const opts = {
      path: `/containers/${req.params.id}/stats?stream=false`,
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

// Restart container
router.post('/:id/restart', async (req, res, next) => {
  try {
    const opts = {
      path: `/containers/${req.params.id}/restart`,
      method: 'POST'
    };

    docker.dial(opts, (err) => {
      if (err) {
        return next(err);
      }
      res.json({ message: 'Container restarted successfully' });
    });
  } catch (error) {
    next(error);
  }
});

// Get container logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const opts = {
      path: `/containers/${req.params.id}/logs?stdout=1&stderr=1&tail=100`,
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