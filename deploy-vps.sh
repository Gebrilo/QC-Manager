#!/bin/bash
# QC Management Tool - VPS Deployment Script
# Works on any VPS including Hostinger (Ubuntu 22.04/24.04 with Docker)
# Usage: ./deploy-vps.sh [VPS_IP]

set -e

echo "======================================================"
echo "  QC Management Tool - VPS Deployment"
echo "======================================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Step 1: Check Docker
info "Step 1: Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    warn "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    success "Docker installed"
fi

if ! command -v docker compose &> /dev/null; then
    error "Docker Compose not available"
    exit 1
fi

success "Docker: $(docker --version | cut -d' ' -f3)"

# Step 2: Configure Docker daemon for reliability
info "Step 2: Configuring Docker daemon..."
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

sudo systemctl restart docker
sleep 3
success "Docker daemon configured"

# Step 3: Pull images with retry
info "Step 3: Pulling Docker images..."

IMAGES=(
    "postgres:15.6-alpine"
    "node:18-alpine"
    "nginx:1.25-alpine"
    "n8nio/n8n:1.29.0"
)

for image in "${IMAGES[@]}"; do
    info "Pulling $image..."
    retry=0
    until docker pull "$image" || [ $retry -eq 3 ]; do
        retry=$((retry+1))
        warn "Retry $retry/3..."
        sleep 5
    done
    if [ $retry -eq 3 ]; then
        error "Failed to pull $image"
        exit 1
    fi
done
success "All images pulled"

# Step 4: Generate .env if needed
info "Step 4: Checking environment configuration..."

if [ -f .env ]; then
    warn ".env exists"
    read -p "Regenerate .env? (y/N): " regenerate
    if [[ $regenerate =~ ^[Yy]$ ]]; then
        rm .env
    fi
fi

if [ ! -f .env ]; then
    info "Generating .env with secure credentials..."
    
    DB_PASS=$(openssl rand -hex 16)
    JWT_SECRET=$(openssl rand -hex 32)
    N8N_PASS=$(openssl rand -hex 12)
    
    cat > .env <<EOF
# Database
POSTGRES_USER=qc_user
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://qc_user:${DB_PASS}@postgres:5432/qc_app

# API
JWT_SECRET=${JWT_SECRET}

# Frontend
NEXT_PUBLIC_API_URL=http://${VPS_IP}/api

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_PASS}
N8N_HOST=${VPS_IP}
N8N_PROTOCOL=http
WEBHOOK_URL=http://${VPS_IP}:5678
EOF

    success ".env created"
    echo ""
    echo "======================================================"
    echo "  SAVE THESE CREDENTIALS"
    echo "======================================================"
    echo ""
    echo "Database Password: ${DB_PASS}"
    echo "JWT Secret: ${JWT_SECRET}"
    echo "n8n Password: ${N8N_PASS}"
    echo ""
    echo "n8n Login: http://${VPS_IP}:5678"
    echo "  Username: admin"
    echo "  Password: ${N8N_PASS}"
    echo ""
    echo "======================================================"
    read -p "Press Enter after saving credentials..."
fi

# Step 5: Remove override file if present (production should not use it)
if [ -f docker-compose.override.yml ]; then
    warn "Removing docker-compose.override.yml (not for production)"
    rm docker-compose.override.yml
fi

# Step 6: Stop existing containers
info "Step 5: Stopping existing containers..."
docker compose down 2>/dev/null || true
success "Containers stopped"

# Step 7: Start services
info "Step 6: Starting services..."
docker compose up -d

echo ""
success "Services started!"

# Step 8: Wait and check health
info "Step 7: Waiting for services (2-3 minutes for first run)..."
sleep 15

docker compose ps
echo ""

# Test endpoints
info "Testing health endpoints..."
sleep 20

if curl -s http://localhost:3001/health > /dev/null; then
    success "API responding"
else
    warn "API still starting..."
fi

if curl -s http://localhost:3000 > /dev/null; then
    success "Frontend responding"
else
    warn "Frontend still building (normal for first run)..."
fi

if curl -s http://localhost:5678 > /dev/null; then
    success "n8n responding"
else
    warn "n8n still starting..."
fi

# Step 9: Create backup script
info "Step 8: Creating backup script..."
mkdir -p /opt/backups/qc-manager

cat > /tmp/backup-qc-db.sh << 'BACKUP_EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/qc-manager"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

cd /opt/QC-Manager
docker compose exec -T postgres pg_dump -U qc_user qc_app | gzip > $BACKUP_DIR/qc_backup_$DATE.sql.gz

find $BACKUP_DIR -name "qc_backup_*.sql.gz" -mtime +7 -delete
echo "Backup: qc_backup_$DATE.sql.gz"
BACKUP_EOF

sudo mv /tmp/backup-qc-db.sh /usr/local/bin/backup-qc-db.sh
sudo chmod +x /usr/local/bin/backup-qc-db.sh
success "Backup script created"

echo ""
echo "======================================================"
echo "  DEPLOYMENT COMPLETE"
echo "======================================================"
echo ""
echo "Access:"
echo "  Frontend: http://${VPS_IP}"
echo "  API:      http://${VPS_IP}/api/health"
echo "  n8n:      http://${VPS_IP}:5678"
echo ""
echo "Commands:"
echo "  Logs:    docker compose logs -f"
echo "  Status:  docker compose ps"
echo "  Restart: docker compose restart"
echo "  Stop:    docker compose down"
echo ""
echo "Backup:"
echo "  Manual:  /usr/local/bin/backup-qc-db.sh"
echo "  Auto:    (crontab -l; echo '0 2 * * * /usr/local/bin/backup-qc-db.sh') | crontab -"
echo ""
echo "======================================================"
