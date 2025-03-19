#!/bin/bash

# DockLens Backend Setup Script
# This script helps set up all prerequisites for the DockLens backend

set -e

# Print colored messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}DockLens Backend Setup${NC}"
echo -e "------------------------\n"

# Check for Node.js
echo -e "${YELLOW}Checking for Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js is installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js is not installed. Please install Node.js 14 or higher.${NC}"
    echo -e "Visit https://nodejs.org/ for installation instructions."
    exit 1
fi

# Check for npm
echo -e "${YELLOW}Checking for npm...${NC}"
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓ npm is installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm is not installed. Please install npm.${NC}"
    exit 1
fi

# Check for Docker
echo -e "${YELLOW}Checking for Docker...${NC}"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}✓ Docker is installed: $DOCKER_VERSION${NC}"
elif [ -e /Applications/Docker.app ] || [ -e ~/Applications/Docker.app ]; then
    echo -e "${GREEN}✓ Docker Desktop detected${NC}"
    if docker ps &> /dev/null; then
        DOCKER_VERSION=$(docker --version 2>/dev/null || echo "version unknown")
        echo -e "${GREEN}✓ Docker is running: $DOCKER_VERSION${NC}"
    else
        echo -e "${YELLOW}⚠ Docker Desktop is installed but not running. Please start Docker Desktop.${NC}"
    fi
else
    echo -e "${RED}✗ Docker is not installed. Please install Docker.${NC}"
    echo -e "Visit https://docs.docker.com/get-docker/ for installation instructions."
    exit 1
fi

# Check Docker socket access
echo -e "${YELLOW}Checking Docker socket access...${NC}"
if docker ps &> /dev/null; then
    echo -e "${GREEN}✓ Docker socket is accessible${NC}"
elif [ -S /var/run/docker.sock ]; then
    if [ -r /var/run/docker.sock ]; then
        echo -e "${GREEN}✓ Docker socket is accessible${NC}"
    else
        echo -e "${RED}✗ Docker socket is not readable. Please check permissions.${NC}"
        echo -e "You may need to run: sudo usermod -aG docker $USER"
        echo -e "And then log out and log back in."
        exit 1
    fi
elif [ -S //./pipe/docker_engine ]; then
    echo -e "${GREEN}✓ Docker socket is accessible (Windows)${NC}"
else
    echo -e "${RED}✗ Docker socket not found. Is Docker running?${NC}"
    exit 1
fi

# Check/Install Trivy
echo -e "${YELLOW}Checking for Trivy...${NC}"
if command -v trivy &> /dev/null; then
    TRIVY_VERSION=$(trivy --version | head -n 1)
    echo -e "${GREEN}✓ Trivy is installed: $TRIVY_VERSION${NC}"
else
    echo -e "${RED}Trivy is not installed. Attempting installation...${NC}"
    
    # Detect OS
    if [ "$(uname)" == "Darwin" ]; then
        # macOS
        echo -e "Installing Trivy on macOS..."
        if command -v brew &> /dev/null; then
            brew install aquasecurity/trivy/trivy
        else
            echo -e "${RED}Homebrew not found. Please install Trivy manually.${NC}"
            echo -e "Visit https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
            exit 1
        fi
    elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
        # Linux
        echo -e "Installing Trivy on Linux..."
        
        # Check for distro
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            if [[ "$ID" == "ubuntu" || "$ID" == "debian" ]]; then
                sudo apt-get update
                sudo apt-get install -y wget apt-transport-https gnupg lsb-release
                wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
                echo deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main | sudo tee -a /etc/apt/sources.list.d/trivy.list
                sudo apt-get update
                sudo apt-get install -y trivy
            elif [[ "$ID" == "centos" || "$ID" == "rhel" || "$ID" == "fedora" ]]; then
                sudo yum install -y wget
                wget -qO - https://aquasecurity.github.io/trivy-repo/rpm/public.key | sudo gpg --dearmor | sudo tee /etc/yum.repos.d/trivy.repo > /dev/null
                sudo yum install -y trivy
            else
                echo -e "${RED}Unsupported Linux distribution. Please install Trivy manually.${NC}"
                echo -e "Visit https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
                exit 1
            fi
        else
            echo -e "${RED}Unable to determine Linux distribution. Please install Trivy manually.${NC}"
            exit 1
        fi
    elif [ "$(expr substr $(uname -s) 1 10)" == "MINGW32_NT" ] || [ "$(expr substr $(uname -s) 1 10)" == "MINGW64_NT" ]; then
        # Windows
        echo -e "${RED}Please install Trivy manually on Windows.${NC}"
        echo -e "You can use scoop: scoop bucket add aquasecurity https://github.com/aquasecurity/scoop-bucket.git && scoop install trivy"
        echo -e "Or download from: https://github.com/aquasecurity/trivy/releases"
        exit 1
    else
        echo -e "${RED}Unsupported operating system. Please install Trivy manually.${NC}"
        echo -e "Visit https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
        exit 1
    fi
    
    # Verify installation
    if command -v trivy &> /dev/null; then
        TRIVY_VERSION=$(trivy --version | head -n 1)
        echo -e "${GREEN}✓ Trivy successfully installed: $TRIVY_VERSION${NC}"
    else
        echo -e "${RED}Trivy installation failed. Please install manually.${NC}"
        echo -e "Visit https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
        exit 1
    fi
fi

# Initialize Trivy DB
echo -e "${YELLOW}Initializing Trivy vulnerability database...${NC}"
trivy --download-db-only
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Trivy database initialized successfully${NC}"
else
    echo -e "${RED}✗ Trivy database initialization failed.${NC}"
    echo -e "This may affect vulnerability scanning functionality."
fi

# Install dependencies
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed successfully${NC}"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file. You may want to edit it with your settings.${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Setup complete
echo -e "\n${GREEN}DockLens setup completed successfully!${NC}"
echo -e "You can now start the server with: npm start\n" 