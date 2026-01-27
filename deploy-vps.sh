#!/bin/bash
# QC Management Tool - VPS Deployment Script
# For Ubuntu 24.04 with Docker
# Usage: ./deploy-vps.sh [VPS_IP]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Get VPS IP from argument or prompt
VPS_IP=${1:-}
if [ -z "$VPS_IP" ]; then
    read -p "Enter your VPS IP address: " VPS_IP
fi

print_info "Starting deployment for QC Management Tool on VPS: $VPS_IP"

# Step 1: Check if .env exists
print_info "Step 1: Checking environment configuration..."
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp .env.example .env
    
    # Generate secure passwords
    DB_PASSWORD=$(openssl rand -hex 16)
    JWT_SECRET=$(openssl rand -hex 32)
    N8N_PASSWORD=$(openssl rand -hex 12)
    
    # Update .env with generated values
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASSWORD/" .env
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://qc_user:$DB_PASSWORD@postgres:5432/qc_app|" .env
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i "s/N8N_BASIC_AUTH_PASSWORD=.*/N8N_BASIC_AUTH_PASSWORD=$N8N_PASSWORD/" .env
    sed -i "s/YOUR_VPS_IP/$VPS_IP/g" .env
    sed -i "s/N8N_HOST=.*/N8N_HOST=$VPS_IP/" .env
    
    print_info "Generated secure passwords and saved to .env"
    print_warning "IMPORTANT: Save these credentials securely!"
    echo ""
    echo "Database Password: $DB_PASSWORD"
    echo "JWT Secret: $JWT_SECRET"
    echo "n8n Password: $N8N_PASSWORD"
    echo ""
    read -p "Press Enter to continue after saving these credentials..."
else
    print_info ".env file exists, using existing configuration"
fi

# Step 2: Verify Docker is installed
print_info "Step 2: Verifying Docker installation..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    print_info "Docker installed. You may need to logout and login again."
fi

if ! command -v docker compose &> /dev/null; then
    print_error "Docker Compose is not available"
    exit 1
fi

print_info "Docker version: $(docker --version)"
print_info "Docker Compose version: $(docker compose version)"

# Step 3: Check disk space
print_info "Step 3: Checking disk space..."
AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
print_info "Available disk space: $AVAILABLE_SPACE"

# Step 4: Stop existing containers if any
print_info "Step 4: Stopping existing containers (if any)..."
if [ -f docker-compose.prod.yml ]; then
    docker compose -f docker-compose.prod.yml down || true
fi

# Step 5: Pull Docker images
print_info "Step 5: Pulling Docker images..."
docker compose -f docker-compose.prod.yml pull

# Step 6: Build custom images
print_info "Step 6: Building custom images (API & Frontend)..."
docker compose -f docker-compose.prod.yml build

# Step 7: Start services
print_info "Step 7: Starting all services..."
docker compose -f docker-compose.prod.yml up -d

# Step 8: Wait for services to be healthy
print_info "Step 8: Waiting for services to start..."
sleep 10

# Check service health
print_info "Checking service status..."
docker compose -f docker-compose.prod.yml ps

# Step 9: Test API health
print_info "Step 9: Testing API health..."
for i in {1..30}; do
    if curl -s http://localhost:3001/health > /dev/null; then
        print_info "API is responding!"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "API failed to start after 30 seconds"
        print_info "Checking API logs:"
        docker compose -f docker-compose.prod.yml logs api | tail -20
        exit 1
    fi
    echo -n "."
    sleep 1
done

# Step 10: Display access information
print_info "========================================="
print_info "Deployment Complete!"
print_info "========================================="
echo ""
print_info "Access your application:"
echo "  Frontend:    http://$VPS_IP"
echo "  API:         http://$VPS_IP/api"
echo "  API Health:  http://$VPS_IP/api/health"
echo "  n8n:         http://$VPS_IP:5678"
echo ""
print_info "Default n8n credentials:"
echo "  Username: admin"
echo "  Password: (check .env file for N8N_BASIC_AUTH_PASSWORD)"
echo ""
print_info "Next steps:"
echo "  1. Access n8n and import workflows from n8n/ directory"
echo "  2. Configure n8n PostgreSQL credentials"
echo "  3. Activate workflows in n8n"
echo "  4. Set up automatic backups (see docs/03-guides/DEPLOYMENT.md)"
echo ""
print_info "Useful commands:"
echo "  View logs:          docker compose -f docker-compose.prod.yml logs -f"
echo "  Restart services:   docker compose -f docker-compose.prod.yml restart"
echo "  Stop services:      docker compose -f docker-compose.prod.yml down"
echo "  Check status:       docker compose -f docker-compose.prod.yml ps"
echo ""

# Step 11: Create backup script
print_info "Step 11: Creating backup script..."
mkdir -p /opt/backups/qc-manager
cat > /tmp/backup-qc-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/qc-manager"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

cd /opt/QC-Manager
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U qc_user qc_app | gzip > $BACKUP_DIR/qc_backup_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "qc_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: qc_backup_$DATE.sql.gz"
EOF

sudo mv /tmp/backup-qc-db.sh /usr/local/bin/backup-qc-db.sh
sudo chmod +x /usr/local/bin/backup-qc-db.sh

print_info "Backup script created at /usr/local/bin/backup-qc-db.sh"
print_info "To schedule daily backups, run:"
echo "  (crontab -l 2>/dev/null; echo '0 2 * * * /usr/local/bin/backup-qc-db.sh') | crontab -"

print_info "========================================="
print_info "Deployment script completed successfully!"
print_info "========================================="
