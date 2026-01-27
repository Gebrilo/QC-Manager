# Hostinger Docker Manager Deployment Guide

## Overview

This guide walks you through deploying the QC Management Tool using Hostinger's Docker Manager GUI interface.

**Important**: Use `docker-compose.hostinger.yml` instead of the default `docker-compose.yml` to avoid build timeouts and network issues.

---

## Prerequisites

- Hostinger VPS with Ubuntu 24.04
- Docker Manager enabled in Hostinger panel
- VPS IP address
- GitHub account access to https://github.com/Gebrilo/QC-Manager

---

## Deployment Steps

### Step 1: Access Hostinger Docker Manager

1. Log in to your Hostinger panel
2. Navigate to **VPS** → **Docker Manager**
3. Click **"Create Application"** or **"Add Application"**

### Step 2: Configure Repository

In the Docker Manager setup form:

| Field | Value |
|-------|-------|
| **Application Name** | `qc-manager` (or your choice) |
| **Repository URL** | `https://github.com/Gebrilo/QC-Manager.git` |
| **Branch** | `main` |
| **Docker Compose File** | `docker-compose.hostinger.yml` ⚠️ **Important!** |
| **Auto Deploy** | ✓ Enabled (optional) |

**Critical**: Make sure to select `docker-compose.hostinger.yml` and NOT `docker-compose.yml`

### Step 3: Set Environment Variables

Click **"Add Environment Variable"** and add each of these (replace placeholders):

```bash
POSTGRES_USER=qc_user
POSTGRES_PASSWORD=your-secure-db-password-here
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://qc_user:your-secure-db-password-here@postgres:5432/qc_app
JWT_SECRET=your-64-char-jwt-secret-here
NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP/api
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-n8n-password-here
N8N_HOST=YOUR_VPS_IP
WEBHOOK_URL=http://YOUR_VPS_IP:5678
```

**Generate secure passwords**:
- PostgreSQL: 32 characters minimum
- JWT Secret: 64 characters minimum  
- n8n Password: 24 characters minimum

You can use: https://passwordsgenerator.net/ or `openssl rand -hex 32`

**Replace `YOUR_VPS_IP`**: Use your actual VPS IP (e.g., `123.45.67.89`)

### Step 4: Deploy

1. Review all settings
2. Click **"Create"** or **"Deploy"**
3. Wait for deployment (5-15 minutes first time)

### Step 5: Monitor Deployment

In Docker Manager:
1. Click on your application
2. View **"Logs"** tab to monitor progress
3. Wait for these success messages:
   - `postgres: database system is ready to accept connections`
   - `api: API Server running on port 3001`
   - `web: Ready in X ms`
   - `n8n: Editor is now accessible`

### Step 6: Verify Deployment

**Test API Health**:
```bash
curl http://YOUR_VPS_IP/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

**Access Services**:
- **Frontend**: `http://YOUR_VPS_IP` → Should show QC dashboard
- **n8n**: `http://YOUR_VPS_IP:5678` → n8n login page
- **API Health**: `http://YOUR_VPS_IP/api/health` → JSON response

---

## Configuration After Deployment

### n8n Workflow Setup

1. **Access n8n**: `http://YOUR_VPS_IP:5678`
2. **Login**: Use credentials from environment variables
3. **Add PostgreSQL Credential**:
   - Settings → Credentials → Add Credential
   - Type: PostgreSQL
   - Host: `postgres`
   - Port: `5432`
   - Database: `qc_app`
   - User: `qc_user`
   - Password: (from POSTGRES_PASSWORD)
   - Test connection → Save

4. **Import Workflows**:
   - Download workflow files from GitHub: `n8n/*.json`
   - Workflows → Import from File
   - Upload each JSON file
   - Activate each workflow

---

## Troubleshooting

### Issue: "connection reset by peer" During Pull

**Symptom**: Deployment fails with network error while pulling images

**Cause**: Hostinger network timeout or IPv6 issues

**Fix**:
1. Delete the failed application
2. Wait 5 minutes
3. Try again - sometimes it works on retry
4. If persistent, use CLI deployment (see below)

### Issue: Images Take Too Long to Pull

**Symptom**: Deployment stuck on "Pulling image..."

**Cause**: Large base images timing out

**Fix**:
- The `docker-compose.hostinger.yml` already uses smaller Alpine images
- Wait up to 15 minutes for first deployment
- If still fails after 20 minutes, cancel and retry
- Consider CLI deployment as alternative

### Issue: Container Fails Health Check

**Symptom**: Container shows "Unhealthy" status

**Cause**: Service not ready yet or configuration error

**Fix**:
```bash
# Check logs in Docker Manager
# Or via SSH:
ssh root@YOUR_VPS_IP
cd /var/lib/docker/volumes/  # Find your volumes
docker ps  # Check container status
docker logs <container-name>  # View logs
```

### Issue: Frontend Shows "Cannot connect to API"

**Symptom**: Web page loads but shows connection error

**Cause**: `NEXT_PUBLIC_API_URL` is wrong or not set

**Fix**:
1. In Docker Manager → Application → Environment Variables
2. Verify `NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP/api`
3. Must use your actual IP, not localhost
4. After fixing, restart web container

### Issue: n8n Login Doesn't Work

**Symptom**: Wrong password error

**Cause**: Environment variable not set correctly

**Fix**:
- Check `N8N_BASIC_AUTH_PASSWORD` in Docker Manager
- Remove any quotes around the password
- Format should be: `N8N_BASIC_AUTH_PASSWORD=yourpassword`
- Restart n8n container after fixing

---

## Fallback: CLI Deployment

If Docker Manager continues to fail, deploy via SSH:

### Quick CLI Deploy

```bash
# 1. SSH to VPS
ssh root@YOUR_VPS_IP

# 2. Clone and deploy
cd /opt
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager
chmod +x deploy-hostinger.sh
./deploy-hostinger.sh YOUR_VPS_IP

# 3. Follow prompts
```

See `HOSTINGER-QUICKSTART.md` for detailed CLI instructions.

---

## Maintenance

### Viewing Logs

**In Docker Manager**:
- Click application → Logs tab
- Select specific container
- View real-time logs

**Via SSH**:
```bash
ssh root@YOUR_VPS_IP
cd /var/lib/docker/...  # Navigate to app directory
docker compose logs -f
```

### Restarting Services

**In Docker Manager**:
- Click application
- Click "Restart" button
- Or restart individual containers

**Via SSH**:
```bash
docker compose -f docker-compose.hostinger.yml restart
docker compose -f docker-compose.hostinger.yml restart api  # Specific service
```

### Updating Application

**In Docker Manager**:
- If "Auto Deploy" enabled: Changes deploy automatically
- Manual: Click "Redeploy" button

**Via SSH**:
```bash
cd /opt/QC-Manager  # Or your deployment directory
git pull origin main
docker compose -f docker-compose.hostinger.yml down
docker compose -f docker-compose.hostinger.yml up -d
```

---

## Network & Firewall

### Required Ports

Ensure these ports are open in Hostinger firewall:

| Port | Service | Required |
|------|---------|----------|
| 80 | HTTP (Nginx) | Yes |
| 5678 | n8n | Yes |
| 22 | SSH | Yes |
| 3000 | Frontend (internal) | No (via Nginx) |
| 3001 | API (internal) | No (via Nginx) |
| 5432 | PostgreSQL (internal) | No (never expose) |

**Check firewall**:
```bash
ssh root@YOUR_VPS_IP
sudo ufw status
```

### Enable Required Ports

```bash
sudo ufw allow 80/tcp
sudo ufw allow 5678/tcp
sudo ufw allow 22/tcp
sudo ufw reload
```

---

## Performance Optimization

### Resource Limits

The `docker-compose.hostinger.yml` is optimized for 8GB RAM VPS:

| Service | RAM Usage | Notes |
|---------|-----------|-------|
| PostgreSQL | ~150MB | Sufficient for small-medium data |
| n8n | ~250MB | Stable version 1.29.0 |
| API | ~100MB | Alpine Node.js |
| Web | ~200MB | Alpine Node.js |
| Nginx | ~10MB | Lightweight proxy |
| **Total** | ~710MB | Leaves 7GB+ free |

### Startup Times

First deployment:
- Image pull: 5-10 minutes
- npm install: 3-5 minutes per service
- Total: 15-20 minutes

Subsequent restarts:
- With cached images: 2-3 minutes
- Services use volumes for node_modules

---

## Security Best Practices

1. **Change Default Passwords**: Never use default passwords
2. **Strong JWT Secret**: Minimum 64 random characters
3. **Firewall**: Only open required ports
4. **PostgreSQL**: Never expose port 5432 externally
5. **Regular Updates**: Keep Docker images updated
6. **Backups**: Set up automated database backups
7. **n8n Access**: Restrict to trusted IPs if possible

---

## Comparison: Docker Manager vs CLI

| Feature | Docker Manager | CLI Deployment |
|---------|---------------|----------------|
| **Ease of Use** | ⭐⭐⭐⭐⭐ GUI | ⭐⭐⭐ Command line |
| **Speed** | ⭐⭐⭐ Slower first pull | ⭐⭐⭐⭐ Faster |
| **Reliability** | ⭐⭐⭐ Network dependent | ⭐⭐⭐⭐⭐ More reliable |
| **Control** | ⭐⭐⭐ Limited | ⭐⭐⭐⭐⭐ Full control |
| **Debugging** | ⭐⭐ Limited logs | ⭐⭐⭐⭐⭐ Full visibility |
| **Auto-updates** | ⭐⭐⭐⭐⭐ Built-in | ⭐⭐ Manual |

**Recommendation**: 
- Try Docker Manager first (easier)
- Use CLI if issues persist (more reliable)

---

## Success Checklist

After deployment, verify:

- [ ] All containers show "Running" in Docker Manager
- [ ] API health endpoint returns `{"status":"ok"}`
- [ ] Frontend loads at `http://YOUR_VPS_IP`
- [ ] n8n accessible at `http://YOUR_VPS_IP:5678`
- [ ] Can login to n8n with credentials
- [ ] Database has tables (via n8n SQL query)
- [ ] No errors in container logs
- [ ] Firewall allows ports 80, 5678, 22
- [ ] Can create test project in UI
- [ ] n8n workflows imported and active

---

## Additional Resources

- [HOSTINGER-QUICKSTART.md](../HOSTINGER-QUICKSTART.md) - Quick reference
- [QUICK-DEPLOY-VPS.md](../QUICK-DEPLOY-VPS.md) - Alternative deployment
- [VPS-DEPLOYMENT.md](VPS-DEPLOYMENT.md) - Comprehensive VPS guide
- [GitHub Repository](https://github.com/Gebrilo/QC-Manager) - Source code

---

## Support

If you encounter issues:

1. Check logs in Docker Manager
2. Verify environment variables
3. Try CLI deployment as fallback
4. Check GitHub Issues: https://github.com/Gebrilo/QC-Manager/issues
5. Review troubleshooting section above

---

**Last Updated**: 2026-01-27
**Tested On**: Hostinger VPS, Ubuntu 24.04, Docker 24+
