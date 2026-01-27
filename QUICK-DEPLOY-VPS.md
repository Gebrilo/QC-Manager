# Quick Deploy to VPS

**Time**: ~20 minutes | **Platform**: Ubuntu 24.04 with Docker

## Prerequisites
- VPS IP address
- SSH access
- 8GB RAM, 20GB disk

---

## 🚀 Quick Commands

```bash
# 1. SSH to VPS
ssh root@YOUR_VPS_IP

# 2. Clone & Deploy
cd /opt
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager
chmod +x deploy-vps.sh
./deploy-vps.sh YOUR_VPS_IP

# 3. Follow prompts - script will:
#    - Install Docker (if needed)
#    - Generate secure passwords
#    - Build & start services
#    - Create backup scripts
```

---

## Access Your Application

After deployment completes:

| Service | URL |
|---------|-----|
| **Frontend** | `http://YOUR_VPS_IP` |
| **n8n** | `http://YOUR_VPS_IP:5678` |
| **API Health** | `http://YOUR_VPS_IP/api/health` |

**n8n Login**: `admin` / (password shown during deployment)

---

## Manual Deployment

If you prefer step-by-step control:

### 1. Setup VPS
```bash
ssh root@YOUR_VPS_IP
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Git
sudo apt install git -y

# Configure firewall
sudo ufw allow 80/tcp
sudo ufw allow 5678/tcp
sudo ufw allow 22/tcp
sudo ufw reload
```

### 2. Clone & Configure
```bash
cd /opt
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# Create environment file
cp .env.example .env

# Generate passwords
echo "DB: $(openssl rand -hex 16)"
echo "JWT: $(openssl rand -hex 32)"
echo "n8n: $(openssl rand -hex 12)"

# Edit .env - IMPORTANT: Replace placeholders
nano .env
```

**In .env, update these:**
- `POSTGRES_PASSWORD` - Use generated DB password
- `DATABASE_URL` - Include same DB password
- `JWT_SECRET` - Use generated JWT secret
- `N8N_BASIC_AUTH_PASSWORD` - Use generated n8n password
- `YOUR_VPS_IP` - Replace with your actual IP (2 places)

### 3. Deploy
```bash
# Pull images
docker compose -f docker-compose.prod.yml pull

# Build
docker compose -f docker-compose.prod.yml build

# Start
docker compose -f docker-compose.prod.yml up -d

# Monitor (Ctrl+C to exit)
docker compose -f docker-compose.prod.yml logs -f
```

### 4. Verify
```bash
# Check containers
docker compose -f docker-compose.prod.yml ps

# Test API
curl http://localhost:3001/health

# Open in browser
# Frontend: http://YOUR_VPS_IP
# n8n: http://YOUR_VPS_IP:5678
```

---

## Configure n8n (Required)

1. Open `http://YOUR_VPS_IP:5678`
2. Login: `admin` / (password from .env)
3. **Add PostgreSQL Credential**:
   - Settings → Credentials → Add
   - Type: PostgreSQL
   - Host: `postgres`
   - Port: `5432`
   - Database: `qc_app`
   - User: `qc_user`
   - Password: (from .env POSTGRES_PASSWORD)
   - Test & Save
4. **Import Workflows**:
   - Workflows → Import from File
   - Upload all `.json` files from `n8n/` directory
5. **Activate Workflows**:
   - Open each workflow → Toggle "Active"

---

## Set Up Backups

```bash
# Copy backup script
sudo cp scripts/backup-qc-db.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup-qc-db.sh

# Schedule daily backups (2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-qc-db.sh") | crontab -
```

---

## Common Commands

```bash
cd /opt/QC-Manager

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart service
docker compose -f docker-compose.prod.yml restart api

# Stop all
docker compose -f docker-compose.prod.yml down

# Start all
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

---

## Troubleshooting

**Frontend shows "API Error"**
```bash
# Check .env has correct IP
cat .env | grep NEXT_PUBLIC_API_URL

# Should be: http://YOUR_VPS_IP/api
# If wrong, fix and rebuild:
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml restart web
```

**Container won't start**
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs <service_name>

# Restart
docker compose -f docker-compose.prod.yml restart <service_name>
```

**Database connection failed**
```bash
# Test connection
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U qc_user -d qc_app -c "SELECT 1"
```

---

## Full Documentation

For complete details, see:
- [`DEPLOYMENT-CHECKLIST.md`](DEPLOYMENT-CHECKLIST.md) - Step-by-step checklist
- [`docs/03-guides/VPS-DEPLOYMENT.md`](docs/03-guides/VPS-DEPLOYMENT.md) - Complete VPS guide
- [`docs/03-guides/DEPLOYMENT.md`](docs/03-guides/DEPLOYMENT.md) - General deployment

---

## Success Criteria ✅

Your deployment is successful when:
- ✅ Frontend loads at `http://YOUR_VPS_IP`
- ✅ n8n accessible at `http://YOUR_VPS_IP:5678`
- ✅ API health returns: `{"status":"ok"}`
- ✅ All containers show "Up (healthy)"
- ✅ n8n workflows are "Active"

---

**Questions?** Check the full deployment guide or open an issue on GitHub.
