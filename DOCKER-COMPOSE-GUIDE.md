# Docker Compose Files Guide

This project has **3 different docker-compose files** for different deployment scenarios.

---

## 📁 Which File to Use?

### 1. `docker-compose.yml` - Local Development
**Use when:** Developing locally on your machine

**Features:**
- Hard-coded credentials (non-secure, for dev only)
- Builds Docker images from Dockerfiles
- Exposes all ports for easy access
- Container names for easier debugging

**Start:**
```bash
docker compose up -d
```

**Stop:**
```bash
docker compose down
```

---

### 2. `docker-compose.hostinger.yml` - Hostinger VPS
**Use when:** Deploying to Hostinger VPS

**Features:**
- Uses pre-built Alpine images (no Dockerfile builds)
- Optimized for Hostinger's network constraints
- Inline `npm install` to avoid build timeouts
- Requires `.env` file with your VPS IP

**Start:**
```bash
docker compose -f docker-compose.hostinger.yml up -d
```

**Or use the deployment script:**
```bash
./deploy-hostinger.sh YOUR_VPS_IP
```

**Stop:**
```bash
docker compose -f docker-compose.hostinger.yml down
```

---

### 3. `docker-compose.prod.yml` - Production VPS
**Use when:** Deploying to a non-Hostinger VPS with full Docker support

**Features:**
- Builds custom Docker images
- Includes Nginx reverse proxy
- Requires `.env` file for all configuration
- Suitable for AWS, DigitalOcean, Linode, etc.

**Start:**
```bash
docker compose -f docker-compose.prod.yml up -d
```

**Or use the deployment script:**
```bash
./deploy-vps.sh YOUR_VPS_IP
```

**Stop:**
```bash
docker compose -f docker-compose.prod.yml down
```

---

## 🎯 Quick Decision Tree

```
Are you developing locally?
  ├─ YES → Use docker-compose.yml (default)
  └─ NO → Deploying to VPS?
       ├─ Hostinger VPS → Use docker-compose.hostinger.yml
       └─ Other VPS → Use docker-compose.prod.yml
```

---

## 📝 File Comparison

| Feature | docker-compose.yml | docker-compose.hostinger.yml | docker-compose.prod.yml |
|---------|-------------------|------------------------------|------------------------|
| **Purpose** | Local dev | Hostinger VPS | Production VPS |
| **Build** | Yes (Dockerfiles) | No (pre-built images) | Yes (Dockerfiles) |
| **Environment** | Hard-coded | .env file | .env file |
| **Nginx** | ❌ | ✅ | ✅ |
| **Ports Exposed** | All | All | 80, 443 only |
| **Optimization** | Developer experience | Hostinger network | Production ready |

---

## 🚨 Important Notes

### Never Mix Files!
When using a specific compose file, **always specify it** with the `-f` flag:

**❌ Wrong:**
```bash
# On VPS, this will use docker-compose.yml (local dev config)
docker compose up -d
```

**✅ Correct:**
```bash
# Explicitly specify the file
docker compose -f docker-compose.hostinger.yml up -d
```

### Default Behavior
If you run `docker compose` without `-f`, it will use `docker-compose.yml` by default. This is fine for local development, but **not for VPS deployment**.

---

## 🛠️ Common Commands

### View Logs
```bash
# Local dev
docker compose logs -f

# Hostinger VPS
docker compose -f docker-compose.hostinger.yml logs -f

# Production VPS
docker compose -f docker-compose.prod.yml logs -f
```

### Check Status
```bash
# Local dev
docker compose ps

# Hostinger VPS
docker compose -f docker-compose.hostinger.yml ps

# Production VPS
docker compose -f docker-compose.prod.yml ps
```

### Restart Services
```bash
# Local dev
docker compose restart

# Hostinger VPS
docker compose -f docker-compose.hostinger.yml restart

# Production VPS
docker compose -f docker-compose.prod.yml restart
```

### Full Rebuild
```bash
# Local dev
docker compose down -v
docker compose up -d --build

# Hostinger VPS (no build needed)
docker compose -f docker-compose.hostinger.yml down -v
docker compose -f docker-compose.hostinger.yml up -d

# Production VPS
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📚 Related Documentation

- **Hostinger Deployment:** `docs/03-guides/HOSTINGER-DOCKER-MANAGER.md`
- **Production Deployment:** `docs/03-guides/VPS-DEPLOYMENT.md`
- **Quick Start:** `HOSTINGER-QUICKSTART.md`
- **Deployment Checklist:** `DEPLOYMENT-CHECKLIST.md`

---

## 🔧 Troubleshooting

### Issue: Wrong compose file used on VPS
**Symptom:** Services fail to start, build errors on VPS

**Solution:**
```bash
# Stop everything
docker compose down
docker compose -f docker-compose.hostinger.yml down
docker compose -f docker-compose.prod.yml down

# Start with correct file
docker compose -f docker-compose.hostinger.yml up -d
```

### Issue: "Connection reset by peer" on Hostinger
**Solution:** Use `docker-compose.hostinger.yml` which is specifically optimized for Hostinger's network

### Issue: Want to switch from one config to another
**Solution:**
```bash
# Stop current setup
docker compose -f OLD_FILE.yml down

# Start new setup
docker compose -f NEW_FILE.yml up -d
```

---

## ✅ Best Practices

1. **Always use `-f` flag on VPS** - Never rely on default behavior
2. **Use deployment scripts** - They handle file selection automatically
3. **Check which file is running** - Use `docker compose ps` and look at container names
4. **Keep .env updated** - Required for both VPS configs
5. **Document your choice** - Note which file you're using in deployment docs

---

**Need Help?** Check the full deployment guides in `docs/03-guides/`
