#!/bin/bash
# Hostinger VPS Deployment Script for QC Manager
# Optimized for Hostinger's network constraints and Docker environment

set -e

echo "======================================================"
echo "  Hostinger VPS Deployment - QC Manager Application"
echo "======================================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get VPS IP
VPS_IP=${1:-}
if [ -z "$VPS_IP" ]; then
    read -p "Enter your VPS IP address: " VPS_IP
fi

if [ -z "$VPS_IP" ]; then
    error "VPS IP is required. Exiting."
    exit 1
fi

info "Deploying to VPS: $VPS_IP"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

success "Docker and Docker Compose are installed"

# Configure Docker daemon for better reliability on Hostinger
info "Configuring Docker daemon for Hostinger network..."
sudo mkdir -p /etc/docker

sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "max-concurrent-downloads": 3,
  "max-concurrent-uploads": 3,
  "max-download-attempts": 5,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "dns": ["8.8.8.8", "8.8.4.4"]
}
EOF

info "Restarting Docker daemon..."
sudo systemctl restart docker
sleep 5

if sudo systemctl is-active --quiet docker; then
    success "Docker daemon configured and running"
else
    error "Docker daemon failed to restart"
    exit 1
fi

# Verify Hostinger-specific compose file exists
info "Verifying docker-compose.hostinger.yml exists..."
if [ ! -f docker-compose.hostinger.yml ]; then
    error "docker-compose.hostinger.yml not found!"
    exit 1
fi
success "Found docker-compose.hostinger.yml"

# Pull images with retry logic
info "Pulling Docker images (this may take 5-10 minutes)..."
echo ""

IMAGES=(
    "postgres:15.6-alpine"
    "node:18-alpine"
    "nginx:1.25-alpine"
    "n8nio/n8n:1.29.0"
)

for image in "${IMAGES[@]}"; do
    info "Pulling $image..."
    retry=0
    max_retries=3
    
    until docker pull "$image" || [ $retry -eq $max_retries ]; do
        retry=$((retry+1))
        if [ $retry -eq $max_retries ]; then
            error "Failed to pull $image after $max_retries attempts"
            exit 1
        fi
        warn "Retry $retry/$max_retries for $image..."
        sleep 5
    done
    
    success "Pulled $image"
done

echo ""
success "All images pulled successfully"
echo ""

# Generate environment file if it doesn't exist
if [ -f .env ]; then
    warn ".env file already exists. Skipping generation."
    read -p "Do you want to regenerate .env? (y/N): " regenerate
    if [[ ! $regenerate =~ ^[Yy]$ ]]; then
        info "Using existing .env file"
    else
        rm .env
    fi
fi

if [ ! -f .env ]; then
    info "Generating .env file with secure credentials..."
    
    # Generate secure passwords
    DB_PASS=$(openssl rand -hex 16)
    JWT_SECRET=$(openssl rand -hex 32)
    N8N_PASS=$(openssl rand -hex 12)
    
    cat > .env <<EOF
# PostgreSQL Configuration
POSTGRES_USER=qc_user
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://qc_user:${DB_PASS}@postgres:5432/qc_app

# API Configuration
PORT=3001
JWT_SECRET=${JWT_SECRET}
N8N_WEBHOOK_URL=http://n8n:5678/webhook
NODE_ENV=production

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://${VPS_IP}/api

# n8n Configuration
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_PASS}
N8N_HOST=${VPS_IP}
N8N_PORT=5678
N8N_PROTOCOL=http
WEBHOOK_URL=http://${VPS_IP}:5678
EOF

    success ".env file created"
    echo ""
    echo "======================================================"
    echo "  🔐 IMPORTANT - Save These Credentials"
    echo "======================================================"
    echo ""
    echo "Database Password: ${DB_PASS}"
    echo "JWT Secret: ${JWT_SECRET}"
    echo "n8n Admin Password: ${N8N_PASS}"
    echo ""
    echo "n8n Login: http://${VPS_IP}:5678"
    echo "  Username: admin"
    echo "  Password: ${N8N_PASS}"
    echo ""
    echo "======================================================"
    echo ""
    read -p "Press Enter to continue after saving credentials..."
fi

# Stop any existing containers
if docker compose -f docker-compose.hostinger.yml ps -q | grep -q .; then
    info "Stopping existing containers..."
    docker compose -f docker-compose.hostinger.yml down
    success "Stopped existing containers"
fi

# Start services
info "Starting services..."
echo ""

docker compose -f docker-compose.hostinger.yml up -d

echo ""
success "Services started!"
echo ""

# Wait for services to be healthy
info "Waiting for services to start (this may take 2-3 minutes)..."
echo ""

sleep 10

# Check service status
info "Checking service status..."
docker compose -f docker-compose.hostinger.yml ps

echo ""

# Test health endpoints
info "Testing health endpoints..."
echo ""

sleep 20  # Give services time to fully start

# Test API health
if curl -s http://localhost:3001/health > /dev/null; then
    success "API is responding"
else
    warn "API health check failed - it may still be starting up"
fi

# Test frontend
if curl -s http://localhost:3000 > /dev/null; then
    success "Frontend is responding"
else
    warn "Frontend health check failed - it may still be starting up"
fi

# Test n8n
if curl -s http://localhost:5678 > /dev/null; then
    success "n8n is responding"
else
    warn "n8n health check failed - it may still be starting up"
fi

echo ""
echo "======================================================"
echo "  ✅ Deployment Complete!"
echo "======================================================"
echo ""
echo "Access your application:"
echo "  • Frontend: http://${VPS_IP}"
echo "  • API: http://${VPS_IP}:3001"
echo "  • n8n: http://${VPS_IP}:5678"
echo ""
echo "Useful commands:"
echo "  • View logs: docker compose -f docker-compose.hostinger.yml logs -f"
echo "  • Check status: docker compose -f docker-compose.hostinger.yml ps"
echo "  • Restart: docker compose -f docker-compose.hostinger.yml restart"
echo "  • Stop: docker compose -f docker-compose.hostinger.yml down"
echo ""
echo "⚠️  Important Next Steps:"
echo "  1. Verify all services are running: docker compose -f docker-compose.hostinger.yml ps"
echo "  2. Check logs if any issues: docker compose -f docker-compose.hostinger.yml logs"
echo "  3. Configure n8n workflows at http://${VPS_IP}:5678"
echo "  4. Setup database backups (see docs)"
echo "  5. Configure firewall to allow ports 80, 443, 5678"
echo ""
echo "Documentation: docs/03-guides/HOSTINGER-DOCKER-MANAGER.md"
echo "======================================================"
