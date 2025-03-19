# DockLens: Docker Image Security Scanning Backend

DockLens is a comprehensive backend service for analyzing Docker images, monitoring containers, and scanning for security vulnerabilities.

## Features

- **Security Vulnerability Scanning**: Scan Docker images for security vulnerabilities using Trivy
- **Container Management**: List, inspect, start, stop and remove containers
- **Image Analysis**: Get detailed information about Docker images
- **Resource Monitoring**: Monitor resource usage of running containers

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Docker installed and running
- Node.js 14+ installed
- [Trivy](https://github.com/aquasecurity/trivy) installed (instructions below)

## Installing Trivy

### Linux (Ubuntu/Debian)

```bash
apt-get update
apt-get install -y wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | apt-key add -
echo deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main | tee -a /etc/apt/sources.list.d/trivy.list
apt-get update
apt-get install -y trivy
```

### macOS

```bash
brew install aquasecurity/trivy/trivy
```

### Windows

```powershell
scoop bucket add aquasecurity https://github.com/aquasecurity/scoop-bucket.git
scoop install trivy
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/docklens-be.git
cd docklens-be
```

2. Install dependencies:

```bash
npm install
```

3. Copy the `.env.example` file to `.env` and adjust the configurations as needed:

```bash
cp .env.example .env
```

4. Start the server:

```bash
npm start
```

## Running with Docker

We provide a Docker image for easy deployment:

```bash
docker-compose up -d
```

This will start the DockLens backend with all required dependencies.

## API Endpoints

### Security Scanning

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /api/analysis/security-scan/:imageId | Start a security scan for a Docker image |
| GET    | /api/analysis/security-scan/status/:scanId | Get the status of a running scan |

### Containers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/containers | List all containers |
| GET    | /api/containers/:id | Get container details |
| POST   | /api/containers/:id/start | Start a container |
| POST   | /api/containers/:id/stop | Stop a container |
| DELETE | /api/containers/:id | Remove a container |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/images | List all images |
| GET    | /api/images/:id | Get image details |
| DELETE | /api/images/:id | Remove an image |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/system/info | Get Docker system information |
| GET    | /api/system/version | Get Docker version information |

## Example: Starting a Security Scan

```bash
# Start a scan for image "nginx:latest"
curl -X POST http://localhost:3000/api/analysis/security-scan/nginx:latest

# Response:
# {
#   "scanId": "nginx:latest_1620000000000",
#   "status": "started",
#   "message": "Security scan started. Use GET /security-scan/status/:scanId to check progress."
# }

# Check scan status
curl http://localhost:3000/api/analysis/security-scan/status/nginx:latest_1620000000000

# Response when complete:
# {
#   "imageId": "nginx:latest",
#   "status": "completed",
#   "completedAt": "2023-01-01T12:00:00.000Z",
#   "vulnerabilities": {
#     "critical": 1,
#     "high": 5,
#     "medium": 10,
#     "low": 20
#   },
#   "fullResults": { ... }
# }
```

## Deployment Considerations

1. **Security**: The backend needs access to the Docker socket. In production, ensure proper security measures.
2. **Trivy Cache**: Configure a persistent volume for Trivy's cache if deploying in containers.
3. **Resource Limits**: Set appropriate memory limits as scanning large images can be resource-intensive.
4. **API Authentication**: Add authentication middleware for production deployments.

## Troubleshooting

### Docker Socket Access Issues

If you encounter permission issues with the Docker socket:

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER
# Then log out and log back in
```

### Trivy Database Updates Failing

Ensure you have internet access as Trivy needs to download vulnerability databases:

```bash
# Manually update Trivy DB
trivy --download-db-only
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 