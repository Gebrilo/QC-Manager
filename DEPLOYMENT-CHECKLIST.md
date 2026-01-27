# QC Management Tool - VPS Deployment Checklist

## Pre-Deployment

- [ ] VPS provisioned (Ubuntu 24.04)
- [ ] VPS IP address obtained: `_________________`
- [ ] SSH access working: `ssh root@YOUR_VPS_IP`
- [ ] Minimum specs met: 8GB RAM, 20GB disk
- [ ] GitHub repository accessible

## Initial Setup (5-10 minutes)

- [ ] SSH into VPS
- [ ] Update system: `sudo apt update && sudo apt upgrade -y`
- [ ] Verify Docker installed: `docker --version`
  - [ ] If not: `curl -fsSL https://get.docker.com | sh`
- [ ] Install Git: `sudo apt install git -y`
- [ ] Configure firewall:
  - [ ] `sudo ufw allow 80/tcp`
  - [ ] `sudo ufw allow 5678/tcp`
  - [ ] `sudo ufw allow 22/tcp`
  - [ ] `sudo ufw reload`

## Deploy Application (10-15 minutes)

- [ ] Clone repository: `cd /opt && git clone https://github.com/Gebrilo/QC-Manager.git`
- [ ] Change ownership: `sudo chown -R $USER:$USER QC-Manager`
- [ ] Navigate: `cd QC-Manager`
- [ ] Create .env file: `cp .env.example .env`
- [ ] Generate passwords:
  ```bash
  echo "DB Password: $(openssl rand -hex 16)"
  echo "JWT Secret: $(openssl rand -hex 32)"
  echo "n8n Password: $(openssl rand -hex 12)"
  ```
- [ ] Edit .env: `nano .env`
  - [ ] Set `POSTGRES_PASSWORD`
  - [ ] Set `DATABASE_URL` (with same password)
  - [ ] Set `JWT_SECRET`
  - [ ] Set `N8N_BASIC_AUTH_PASSWORD`
  - [ ] Replace `YOUR_VPS_IP` with actual IP (2 occurrences)
  - [ ] Save credentials securely!
- [ ] Pull images: `docker compose -f docker-compose.prod.yml pull`
- [ ] Build: `docker compose -f docker-compose.prod.yml build`
- [ ] Start: `docker compose -f docker-compose.prod.yml up -d`
- [ ] Monitor logs: `docker compose -f docker-compose.prod.yml logs -f`

## Verify Deployment (5 minutes)

- [ ] All containers running: `docker compose -f docker-compose.prod.yml ps`
- [ ] API health check: `curl http://localhost:3001/health`
- [ ] Nginx proxy: `curl http://localhost/api/health`
- [ ] Database ready: `docker compose exec postgres pg_isready -U qc_user`
- [ ] Frontend accessible: Open `http://YOUR_VPS_IP` in browser
- [ ] n8n accessible: Open `http://YOUR_VPS_IP:5678` in browser

## Configure n8n (10-15 minutes)

- [ ] Login to n8n: `http://YOUR_VPS_IP:5678`
- [ ] Create PostgreSQL credentials:
  - [ ] Host: `postgres`
  - [ ] Port: `5432`
  - [ ] Database: `qc_app`
  - [ ] User: `qc_user`
  - [ ] Password: (from .env)
  - [ ] Test connection
- [ ] Import workflows (9 files from `n8n/` directory):
  - [ ] `qc_generate_project_summary_pdf.json`
  - [ ] `qc_generate_task_export_excel.json`
  - [ ] `qc_task_export_excel.json`
  - [ ] `workflows/01_Create_Task.json`
  - [ ] `workflows/02_Update_Task.json`
  - [ ] `workflows/03_Generate_Report.json`
  - [ ] `workflows/create_project.json`
  - [ ] `workflows/task_automation.json`
  - [ ] `qc_cleanup_expired_reports.json`
- [ ] Activate all workflows

## Set Up Backups (5 minutes)

- [ ] Create backup directory: `sudo mkdir -p /opt/backups/qc-manager`
- [ ] Copy backup script: `sudo cp scripts/backup-qc-db.sh /usr/local/bin/`
- [ ] Make executable: `sudo chmod +x /usr/local/bin/backup-qc-db.sh`
- [ ] Test backup: `sudo /usr/local/bin/backup-qc-db.sh`
- [ ] Schedule cron:
  ```bash
  (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-qc-db.sh") | crontab -
  ```
- [ ] Verify: `crontab -l`

## Configure Docker Logs (2 minutes)

- [ ] Edit config: `sudo nano /etc/docker/daemon.json`
- [ ] Add log rotation config
- [ ] Restart Docker: `sudo systemctl restart docker`
- [ ] Restart services: `docker compose -f docker-compose.prod.yml up -d`

## Final Verification

- [ ] Frontend loads and displays dashboard
- [ ] Can navigate all pages (Projects, Tasks, Resources, etc.)
- [ ] API endpoints respond (check browser Network tab)
- [ ] n8n workflows show "Active" status
- [ ] Database has tables: `docker compose exec postgres psql -U qc_user -d qc_app -c "\dt"`
- [ ] Backups working: `ls -lh /opt/backups/qc-manager/`
- [ ] Log rotation configured: `cat /etc/docker/daemon.json`

## Credentials to Save

**Record these securely:**

- VPS IP: `_________________`
- PostgreSQL Password: `_________________`
- JWT Secret: `_________________`
- n8n Password: `_________________`
- Database Backup Location: `/opt/backups/qc-manager/`

## Access Information

| Service | URL | Username | Password |
|---------|-----|----------|----------|
| Frontend | `http://YOUR_VPS_IP` | - | - |
| API | `http://YOUR_VPS_IP/api` | - | - |
| n8n | `http://YOUR_VPS_IP:5678` | admin | (from .env) |

## Common Issues

### Container won't start
```bash
docker compose -f docker-compose.prod.yml logs <service_name>
docker compose -f docker-compose.prod.yml restart <service_name>
```

### Frontend shows "API Error"
```bash
# Check .env has correct IP
cat .env | grep NEXT_PUBLIC_API_URL
# Should show: http://YOUR_VPS_IP/api

# Rebuild if changed
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml restart web
```

### Can't access from browser
```bash
# Check firewall
sudo ufw status
# Port 80 should be ALLOW

# Check containers
docker compose -f docker-compose.prod.yml ps
# All should be "Up" and "healthy"
```

## Estimated Time

- **Automated deployment**: ~15-20 minutes
- **Manual deployment**: ~30-40 minutes
- **First-time setup (with learning)**: ~60 minutes

## Next Steps After Deployment

1. Test creating a project
2. Test creating tasks
3. Test creating resources
4. Verify n8n workflows trigger
5. Check reports generation
6. Set up regular backups verification

## Support

For detailed instructions, see:
- `docs/03-guides/VPS-DEPLOYMENT.md` - Complete deployment guide
- `docs/03-guides/DEPLOYMENT.md` - General deployment guide
- `README.md` - Quick start and architecture overview

---

**Total Time**: 35-50 minutes for complete deployment
**Difficulty**: Intermediate (requires basic Linux/Docker knowledge)
