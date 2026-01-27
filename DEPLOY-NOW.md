# VPS Deployment - Ready to Deploy! 🚀

All deployment materials have been prepared and pushed to GitHub. You can now deploy to your Hostinger VPS.

## ✅ What's Been Prepared

### Deployment Scripts
- **`deploy-vps.sh`**: Fully automated deployment script
  - Auto-detects Docker installation
  - Generates secure passwords
  - Configures all services
  - Sets up backups

### Documentation
- **`QUICK-DEPLOY-VPS.md`**: Fast track deployment guide (~20 min)
- **`DEPLOYMENT-CHECKLIST.md`**: Complete step-by-step checklist
- **`docs/03-guides/VPS-DEPLOYMENT.md`**: Comprehensive deployment guide

### Configuration
- **`nginx/nginx.conf`**: IP-based access configuration
- **`nginx/default.conf`**: Production-ready reverse proxy
- **`scripts/backup-qc-db.sh`**: Automated database backups

---

## 🎯 Recommended: Automated Deployment

**Time**: ~20 minutes | **Difficulty**: Easy

### Step 1: SSH to Your VPS
```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Clone & Deploy
```bash
cd /opt
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager
chmod +x deploy-vps.sh
./deploy-vps.sh YOUR_VPS_IP
```

### Step 3: Follow Prompts
The script will:
- ✓ Check/install Docker
- ✓ Generate secure passwords (save these!)
- ✓ Build all services
- ✓ Start containers
- ✓ Create backup scripts
- ✓ Display access URLs

### Step 4: Configure n8n
1. Open `http://YOUR_VPS_IP:5678`
2. Login with credentials from .env
3. Add PostgreSQL credential
4. Import workflows from `n8n/` directory
5. Activate all workflows

**Done!** Access your app at `http://YOUR_VPS_IP`

---

## 📋 Alternative: Manual Deployment

If you prefer step-by-step control, follow **`docs/03-guides/VPS-DEPLOYMENT.md`**

**Time**: ~40 minutes | **Difficulty**: Intermediate

---

## 📦 What Will Be Deployed

### Services (5 Docker Containers)
- **PostgreSQL 15**: Database with auto-initialized schema
- **Express API**: Backend REST API (port 3001)
- **Next.js Frontend**: Web interface (port 3000)
- **n8n**: Automation workflows (port 5678)
- **Nginx**: Reverse proxy (port 80)

### Resources Used
- **RAM**: ~710MB (leaves ~7GB free)
- **Disk**: ~1.4GB (leaves ~98GB free)

---

## 🌐 Access URLs After Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend** | `http://YOUR_VPS_IP` | Main application |
| **API** | `http://YOUR_VPS_IP/api` | REST API |
| **n8n** | `http://YOUR_VPS_IP:5678` | Workflows |
| **Health** | `http://YOUR_VPS_IP/api/health` | Status check |

---

## 🔐 Security Notes

### Credentials Generated
The deployment script generates:
- PostgreSQL password (32 chars)
- JWT secret (64 chars)
- n8n password (24 chars)

**IMPORTANT**: Save these securely when displayed!

### Firewall
Ports opened:
- `80` - HTTP (Frontend/API)
- `5678` - n8n workflows
- `22` - SSH

Port `5432` (PostgreSQL) is **NOT** exposed externally.

---

## 🔧 Common Post-Deployment Tasks

### View Logs
```bash
cd /opt/QC-Manager
docker compose -f docker-compose.prod.yml logs -f
```

### Restart Service
```bash
docker compose -f docker-compose.prod.yml restart api
```

### Check Status
```bash
docker compose -f docker-compose.prod.yml ps
```

### Manual Backup
```bash
sudo /usr/local/bin/backup-qc-db.sh
```

### Update Application
```bash
cd /opt/QC-Manager
git pull origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

---

## ✅ Deployment Verification

Your deployment is successful when:

- [ ] All 5 containers show "Up (healthy)"
- [ ] Frontend loads at `http://YOUR_VPS_IP`
- [ ] API returns: `{"status":"ok"}`
- [ ] n8n dashboard accessible
- [ ] Database accepts connections
- [ ] Workflows imported and active

---

## 📚 Documentation Quick Links

| Document | Purpose | Time |
|----------|---------|------|
| `QUICK-DEPLOY-VPS.md` | Fast deployment guide | 20 min |
| `DEPLOYMENT-CHECKLIST.md` | Step-by-step checklist | 30 min |
| `docs/03-guides/VPS-DEPLOYMENT.md` | Complete manual guide | 40 min |
| `docs/03-guides/DEPLOYMENT.md` | General deployment | Reference |

---

## 🆘 Troubleshooting

### Container Won't Start
```bash
docker compose -f docker-compose.prod.yml logs <service_name>
docker compose -f docker-compose.prod.yml restart <service_name>
```

### Frontend Shows "API Error"
```bash
# Check .env has correct IP
cat .env | grep NEXT_PUBLIC_API_URL
# Should be: http://YOUR_VPS_IP/api

# Rebuild if wrong
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml restart web
```

### Can't Access from Browser
```bash
# Check firewall
sudo ufw status

# Check containers
docker compose -f docker-compose.prod.yml ps
```

---

## 🎉 Next Steps After Deployment

1. **Test the application**:
   - Create a test project
   - Add test tasks
   - Create resources
   - Try report generation

2. **Configure n8n workflows**:
   - Import all 9 workflows
   - Test webhook triggers
   - Verify automation works

3. **Set up monitoring** (optional):
   - Resource usage: `docker stats`
   - Disk space: `df -h`
   - Service logs: `docker compose logs -f`

4. **Plan data migration** (if applicable):
   - Export from old system
   - Import to new database
   - Verify data integrity

---

## 📞 Support

- **Documentation**: Check guides in `docs/` directory
- **GitHub Issues**: https://github.com/Gebrilo/QC-Manager/issues
- **Logs**: `docker compose -f docker-compose.prod.yml logs -f`

---

## 🚀 Ready to Deploy?

1. **SSH to your VPS**
2. **Run the deployment script**
3. **Follow the prompts**
4. **Access your application**

**Estimated Time**: 20-30 minutes total

Good luck with your deployment! 🎯
