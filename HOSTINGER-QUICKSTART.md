# Hostinger VPS Quick Deploy Guide

**Deployment Time**: ~15 minutes  
**Difficulty**: Beginner-friendly

---

## Prerequisites

- Hostinger VPS with Ubuntu 24.04
- Docker installed (VPS Management Panel → Docker Manager)
- Your VPS IP address
- GitHub account

---

## Method 1: Docker Manager (Recommended First Try)

### Step 1: Prepare Repository

1. Ensure latest code is on GitHub:
   ```bash
   git pull origin main
   ```

2. Note your VPS IP from Hostinger panel

### Step 2: Configure in Docker Manager

1. **Access Docker Manager**:
   - Login to Hostinger VPS Management
   - Navigate to **Docker Manager**
   - Click **"Create Application"**

2. **Application Settings**:
   - **Name**: `qc-manager`
   - **Repository URL**: `https://github.com/Gebrilo/QC-Manager.git`
   - **Branch**: `main`
   - **Compose File**: `docker-compose.hostinger.yml` ⚠️ Important!

3. **Environment Variables**:
   
   Click "Add Environment Variable" and add each of these:
   
   ```
   POSTGRES_USER=qc_user
   POSTGRES_PASSWORD=[generate strong password]
   POSTGRES_DB=qc_app
   DATABASE_URL=postgresql://qc_user:[same password]@postgres:5432/qc_app
   JWT_SECRET=[generate random string 64+ chars]
   NEXT_PUBLIC_API_URL=http://[YOUR_VPS_IP]/api
   N8N_BASIC_AUTH_USER=admin
   N8N_BASIC_AUTH_PASSWORD=[generate strong password]
   N8N_HOST=[YOUR_VPS_IP]
   WEBHOOK_URL=http://[YOUR_VPS_IP]:5678
   ```

   **Generate secure passwords**:
   - Use password generator (min 16 characters)
   - Or command: `openssl rand -hex 16`

4. **Deploy**:
   - Click **"Create"** or **"Deploy"**
   - Wait 5-10 minutes for images to pull and containers to start
   - Monitor logs in Docker Manager

### Step 3: Verify Deployment

1. **Check Status**:
   - All services should show "Running" (green)
   - May take 2-3 minutes after "Running" for health checks

2. **Access Application**:
   - Frontend: `http://[YOUR_VPS_IP]`
   - n8n: `http://[YOUR_VPS_IP]:5678`
   - API Health: `http://[YOUR_VPS_IP]:3001/health`

---

## Method 2: CLI Deployment (If Docker Manager Fails)

### When to Use CLI:
- Docker Manager shows "connection reset" errors
- Image pull timeouts
- Build failures
- More control and visibility needed

### Step 1: SSH Access

```bash
ssh root@[YOUR_VPS_IP]
```

### Step 2: Deploy Application

```bash
# Navigate to deployment directory
cd /opt

# Clone repository (or pull if exists)
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# Make deployment script executable
chmod +x deploy-hostinger.sh

# Run deployment (will prompt for VPS IP)
./deploy-hostinger.sh [YOUR_VPS_IP]
```

**What the script does**:
- Configures Docker for Hostinger's network
- Pulls images with retry logic
- Generates secure passwords
- Creates `.env` file
- Starts all services
- Shows credentials

### Step 3: Monitor Deployment

```bash
# Watch container logs
docker compose logs -f

# Check container status
docker compose ps

# Test specific service
docker compose logs api
```

### Step 4: Save Credentials

The script will output:
```
DB Password: [generated]
JWT Secret: [generated]
n8n Password: [generated]
```

⚠️ **Save these immediately** - you'll need them for n8n login and database access.

---

## Post-Deployment Configuration

### 1. Configure Nginx (Optional - for domain)

If you have a domain name:

```bash
# Edit nginx config
nano nginx/default.conf

# Update server_name from _ to:
server_name yourdomain.com www.yourdomain.com;

# Restart nginx
docker compose restart nginx
```

### 2. Setup n8n Workflows

1. Access n8n: `http://[YOUR_VPS_IP]:5678`
2. Login with credentials from `.env`
3. Import workflows from `n8n/workflows/` directory
4. Update webhook URLs to use your VPS IP
5. Activate workflows

### 3. Initialize Database (First Time Only)

Database automatically initializes on first startup with:
- Schema from `database/schema.sql`
- Views from `database/migrations/`

Verify:
```bash
docker compose exec postgres psql -U qc_user -d qc_app -c "\dt"
```

---

## Troubleshooting

### Issue: Docker Manager - "Connection reset by peer"

**Solution**: Use CLI deployment method instead.

```bash
ssh root@[YOUR_VPS_IP]
cd /opt/QC-Manager
./deploy-hostinger.sh [YOUR_VPS_IP]
```

### Issue: Services won't start

**Check logs**:
```bash
docker compose logs [service-name]
# Example: docker compose logs api
```

**Common causes**:
- Wrong environment variables
- Database not ready (wait 30 seconds)
- Port conflicts

**Fix**: Restart specific service
```bash
docker compose restart [service-name]
```

### Issue: "Cannot connect to API"

**Verify**:
1. API is running: `docker compose ps api`
2. Health endpoint: `curl http://localhost:3001/health`
3. Check NEXT_PUBLIC_API_URL in web service

**Fix**:
```bash
# Update environment variable
docker compose down
nano .env  # Fix NEXT_PUBLIC_API_URL
docker compose up -d
```

### Issue: n8n won't load

**Check**:
```bash
docker compose logs n8n
```

**Common issue**: Database connection
- Verify POSTGRES_* variables match
- Ensure postgres service is healthy

### Issue: Frontend shows blank page

**Check browser console** for API connection errors.

**Fix**:
1. Verify NEXT_PUBLIC_API_URL uses correct VPS IP
2. Check API is accessible: `curl http://[VPS_IP]:3001/health`
3. Restart web service: `docker compose restart web`

---

## Maintenance Commands

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail=100
```

### Restart Services
```bash
# All services
docker compose restart

# Specific service
docker compose restart api
```

### Stop/Start
```bash
# Stop all
docker compose down

# Start all
docker compose up -d
```

### Update Application
```bash
cd /opt/QC-Manager
git pull origin main
docker compose down
docker compose up -d --build
```

### Backup Database
```bash
# Manual backup
docker compose exec postgres pg_dump -U qc_user qc_app > backup_$(date +%Y%m%d).sql

# Or use backup script
/usr/local/bin/backup-qc-db.sh
```

### Check Resource Usage
```bash
# Container stats
docker stats

# Disk usage
docker system df

# Clean up unused images
docker system prune -a
```

---

## Quick Reference

### URLs
- **Frontend**: `http://[VPS_IP]`
- **API**: `http://[VPS_IP]:3001`
- **n8n**: `http://[VPS_IP]:5678`
- **Health Check**: `http://[VPS_IP]:3001/health`

### Default Ports
- 80: Nginx (HTTP)
- 3000: Next.js Frontend
- 3001: Express API
- 5432: PostgreSQL (internal only)
- 5678: n8n

### Important Files
- `docker-compose.hostinger.yml`: Hostinger-optimized config
- `.env`: Environment variables
- `nginx/default.conf`: Web server config
- `database/schema.sql`: Database schema

### Useful Commands
```bash
# Check all services status
docker compose ps

# View API logs
docker compose logs api -f

# Restart everything
docker compose restart

# Stop everything
docker compose down

# Start fresh (loses data!)
docker compose down -v && docker compose up -d
```

---

## Support Resources

- **Full Documentation**: `docs/03-guides/HOSTINGER-DOCKER-MANAGER.md`
- **General VPS Deployment**: `docs/03-guides/VPS-DEPLOYMENT.md`
- **Architecture Diagram**: `docs/02-architecture/SYSTEM-ARCHITECTURE.md`
- **n8n Workflows**: `n8n/README.md`

---

## Security Checklist

- [ ] Changed all default passwords
- [ ] JWT_SECRET is random and secure (64+ characters)
- [ ] Database password is strong (16+ characters)
- [ ] n8n admin password is secure
- [ ] Firewall configured (Hostinger panel)
- [ ] Only necessary ports open (80, 443, 5678)
- [ ] Regular backups scheduled
- [ ] SSL certificate configured (for production)

---

## Performance Optimization

For VPS with 8GB RAM:

```bash
# Edit docker-compose.hostinger.yml
# Add resource limits to prevent memory issues:

services:
  api:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

Restart after changes:
```bash
docker compose down && docker compose up -d
```

---

## Getting Help

If you encounter issues not covered here:

1. Check full guide: `docs/03-guides/HOSTINGER-DOCKER-MANAGER.md`
2. Review logs: `docker compose logs`
3. Check Hostinger status: [status.hostinger.com](https://status.hostinger.com)
4. Verify Docker is running: `systemctl status docker`
