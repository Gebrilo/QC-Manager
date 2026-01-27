# QC Management Tool - VPS Deployment Guide
# For Hostinger VPS running Ubuntu 24.04 with Docker

This guide provides step-by-step instructions for deploying the QC Management Tool to your Hostinger VPS.

## Prerequisites

- Hostinger VPS with Ubuntu 24.04
- 8GB RAM, 100GB disk space (confirmed available)
- Root or sudo access
- SSH access to the VPS
- VPS IP address

## Quick Deploy (Automated)

```bash
# 1. SSH into your VPS
ssh root@YOUR_VPS_IP

# 2. Clone the repository
cd /opt
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# 3. Run the deployment script
chmod +x deploy-vps.sh
./deploy-vps.sh YOUR_VPS_IP

# 4. Follow the on-screen instructions
```

The automated script will:
- Check Docker installation
- Create .env with secure passwords
- Build and start all services
- Set up backup scripts
- Display access URLs

---

## Manual Deployment (Step-by-Step)

### Step 1: Connect to Your VPS

```bash
# From your local machine
ssh root@YOUR_VPS_IP

# If using a non-root user
ssh username@YOUR_VPS_IP
```

### Step 2: Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 3: Install Docker (if not installed)

```bash
# Check if Docker is installed
docker --version

# If not installed, run:
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Apply group changes
newgrp docker

# Verify installation
docker run hello-world
```

### Step 4: Clone Repository

```bash
cd /opt
sudo git clone https://github.com/Gebrilo/QC-Manager.git
sudo chown -R $USER:$USER QC-Manager
cd QC-Manager
```

### Step 5: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Generate secure passwords
DB_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
N8N_PASSWORD=$(openssl rand -hex 12)

# Edit .env file
nano .env
```

**Update these values in .env:**

```bash
# PostgreSQL Database
POSTGRES_USER=qc_user
POSTGRES_PASSWORD=YOUR_DB_PASSWORD_HERE  # Use generated password
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://qc_user:YOUR_DB_PASSWORD_HERE@postgres:5432/qc_app

# API Server
PORT=3001
JWT_SECRET=YOUR_JWT_SECRET_HERE  # Use generated secret
NODE_ENV=production

# Frontend - IMPORTANT: Replace with your actual VPS IP
NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP/api

# n8n Automation
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=YOUR_N8N_PASSWORD_HERE  # Use generated password
N8N_HOST=YOUR_VPS_IP
N8N_PORT=5678
N8N_PROTOCOL=http
N8N_WEBHOOK_URL=http://n8n:5678/webhook
WEBHOOK_URL=http://YOUR_VPS_IP:5678
```

**IMPORTANT:** Save the generated passwords securely! You'll need them to access services.

Save with `Ctrl+O`, `Enter`, `Ctrl+X`

### Step 6: Configure Firewall

```bash
# Check firewall status
sudo ufw status

# If UFW is active, allow required ports
sudo ufw allow 80/tcp comment 'HTTP for QC App'
sudo ufw allow 5678/tcp comment 'n8n Automation'
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw reload

# Verify rules
sudo ufw status numbered
```

### Step 7: Start Services

```bash
# Pull Docker images
docker compose -f docker-compose.prod.yml pull

# Build custom images (API & Frontend)
docker compose -f docker-compose.prod.yml build

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Monitor logs
docker compose -f docker-compose.prod.yml logs -f
```

**Wait for these messages:**
- PostgreSQL: `database system is ready to accept connections`
- API: `API Server running on port 3001`
- Frontend: `Ready` or `compiled successfully`
- n8n: `Editor is now accessible`

Press `Ctrl+C` to exit logs when ready.

### Step 8: Verify Deployment

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Test API health
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}

# Test through Nginx
curl http://localhost/api/health
# Expected: {"status":"ok","timestamp":"..."}

# Check database
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U qc_user
# Expected: accepting connections
```

### Step 9: Access Your Application

**From your browser:**

1. **Frontend**: `http://YOUR_VPS_IP`
   - Should see the QC Management Tool dashboard

2. **n8n Automation**: `http://YOUR_VPS_IP:5678`
   - Login: `admin` / (password from .env)

3. **API Health**: `http://YOUR_VPS_IP/api/health`
   - Should return: `{"status":"ok",...}`

### Step 10: Set Up n8n Workflows

1. **Access n8n**: `http://YOUR_VPS_IP:5678`

2. **Login** with credentials from .env

3. **Create PostgreSQL Credentials**:
   - Click Settings (⚙️) → Credentials → Add Credential
   - Select: PostgreSQL
   - Name: `QC Database`
   - Configuration:
     - Host: `postgres`
     - Port: `5432`
     - Database: `qc_app`
     - User: `qc_user`
     - Password: (from .env POSTGRES_PASSWORD)
   - Test Connection → Save

4. **Import Workflows**:
   - Go to Workflows tab
   - Click "Import from File"
   - Upload each workflow from your local machine or clone:
   
   ```bash
   # On VPS, workflows are in:
   /opt/QC-Manager/n8n/
   ```
   
   Files to import:
   - `qc_generate_project_summary_pdf.json`
   - `qc_generate_task_export_excel.json`
   - `qc_task_export_excel.json`
   - `workflows/01_Create_Task.json`
   - `workflows/02_Update_Task.json`
   - `workflows/03_Generate_Report.json`
   - `workflows/create_project.json`
   - `workflows/task_automation.json`

5. **Activate Workflows**:
   - Open each workflow
   - Toggle "Active" switch (top right)

### Step 11: Set Up Automatic Backups

```bash
# Create backup directory
sudo mkdir -p /opt/backups/qc-manager

# Copy backup script
sudo cp scripts/backup-qc-db.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup-qc-db.sh

# Test backup
sudo /usr/local/bin/backup-qc-db.sh

# Schedule daily backups at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-qc-db.sh") | crontab -

# Verify cron job
crontab -l
```

### Step 12: Configure Docker Log Rotation

```bash
# Create/edit Docker daemon config
sudo nano /etc/docker/daemon.json
```

Add:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Save and restart Docker:
```bash
sudo systemctl restart docker
cd /opt/QC-Manager
docker compose -f docker-compose.prod.yml up -d
```

---

## Verification Checklist

After deployment, verify:

- [ ] All 5 containers running: `docker compose -f docker-compose.prod.yml ps`
- [ ] PostgreSQL healthy: `docker compose exec postgres pg_isready -U qc_user`
- [ ] API responds: `curl http://localhost:3001/health`
- [ ] Frontend loads: Open `http://YOUR_VPS_IP` in browser
- [ ] n8n accessible: Open `http://YOUR_VPS_IP:5678` in browser
- [ ] Database tables exist: `docker compose exec postgres psql -U qc_user -d qc_app -c "\dt"`
- [ ] Firewall configured: `sudo ufw status`
- [ ] Backups scheduled: `crontab -l`
- [ ] n8n workflows imported and active

---

## Maintenance Commands

### Service Management

```bash
cd /opt/QC-Manager

# View all containers
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f api  # Specific service

# Restart all services
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart api

# Stop all services
docker compose -f docker-compose.prod.yml down

# Start services
docker compose -f docker-compose.prod.yml up -d
```

### Monitor Resources

```bash
# Real-time container stats
docker stats

# Disk usage
df -h
docker system df

# Memory usage
free -h

# Service health
docker compose -f docker-compose.prod.yml ps
```

### Update Application

```bash
cd /opt/QC-Manager

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Verify
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3001/health
```

### Database Operations

```bash
# Manual backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U qc_user qc_app > backup_$(date +%Y%m%d).sql

# Restore from backup
cat backup_20260127.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U qc_user qc_app

# Connect to database
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U qc_user -d qc_app

# View tables
\dt

# Exit psql
\q
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs <service_name>

# Check last 50 lines
docker compose -f docker-compose.prod.yml logs --tail=50 api

# Restart service
docker compose -f docker-compose.prod.yml restart <service_name>

# Full restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Frontend Shows "API Error"

```bash
# 1. Check API is running
curl http://localhost:3001/health

# 2. Check NEXT_PUBLIC_API_URL in .env
cat .env | grep NEXT_PUBLIC_API_URL
# Should be: http://YOUR_VPS_IP/api

# 3. Rebuild frontend if .env changed
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml restart web
```

### Database Connection Failed

```bash
# Test connection
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U qc_user -d qc_app -c "SELECT version();"

# Check logs
docker compose -f docker-compose.prod.yml logs postgres

# Verify DATABASE_URL
cat .env | grep DATABASE_URL
```

### n8n Workflows Not Triggering

```bash
# Check n8n logs
docker compose -f docker-compose.prod.yml logs n8n

# Verify webhook URL
cat .env | grep N8N_WEBHOOK_URL

# Test webhook manually
curl -X POST http://localhost:5678/webhook/task-created \
  -H "Content-Type: application/json" \
  -d '{"task_id":"test","task_name":"Test"}'
```

### Out of Memory

```bash
# Check memory
free -h
docker stats --no-stream

# Add swap (2GB temporary)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Disk Space Full

```bash
# Check space
df -h
docker system df

# Clean up
docker system prune -a --volumes
sudo journalctl --vacuum-time=7d
```

---

## Access URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | `http://YOUR_VPS_IP` | - |
| API | `http://YOUR_VPS_IP/api` | - |
| API Health | `http://YOUR_VPS_IP/api/health` | - |
| n8n | `http://YOUR_VPS_IP:5678` | admin / (from .env) |

---

## Security Notes

1. **Change Default Passwords**: Update all passwords in .env before deployment
2. **Firewall**: Only ports 80, 5678, and 22 should be open
3. **PostgreSQL**: Port 5432 should NOT be exposed externally
4. **Backups**: Test backup restoration regularly
5. **Updates**: Keep Docker and system packages updated
6. **SSL**: Consider adding SSL certificates later for HTTPS

---

## Resource Usage

Expected usage on 8GB RAM VPS:

| Service | RAM | Disk |
|---------|-----|------|
| PostgreSQL | ~150MB | ~500MB |
| API | ~100MB | ~200MB |
| Frontend | ~200MB | ~400MB |
| n8n | ~250MB | ~300MB |
| Nginx | ~10MB | ~5MB |
| **Total** | **~710MB** | **~1.4GB** |

Leaves ~7GB RAM free for system and caching.

---

## Next Steps

After successful deployment:

1. Test all features through the frontend
2. Create test data (projects, tasks, resources)
3. Verify n8n workflows trigger correctly
4. Set up monitoring (optional)
5. Plan data migration (if moving from existing system)

---

## Support

For issues:
- Check logs: `docker compose logs -f`
- Review troubleshooting section above
- Check GitHub issues: https://github.com/Gebrilo/QC-Manager/issues

---

## Success Confirmation

You know deployment is successful when:
- ✅ All containers show "Up" and "healthy"
- ✅ Frontend loads at `http://YOUR_VPS_IP`
- ✅ API health check returns success
- ✅ n8n dashboard accessible
- ✅ Database accepts connections
- ✅ Workflows are active in n8n
