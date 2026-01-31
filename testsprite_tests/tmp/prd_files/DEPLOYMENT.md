# QC Management Tool - Deployment Guide

## Prerequisites

- Docker & Docker Compose v2.0+
- 2GB RAM minimum
- Git

## Quick Start (Development)

```bash
# 1. Clone repository
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# 2. Copy environment template
cp .env.example .env

# 3. Start all services
docker-compose up -d

# 4. Access applications
# - Frontend: http://localhost:3000
# - API: http://localhost:3001
# - n8n: http://localhost:5678 (admin/admin)
```

## Environment Configuration

Create a `.env` file in the project root with these variables:

```bash
# PostgreSQL Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://postgres:your-secure-password@postgres:5432/qc_app

# API Server
PORT=3001
JWT_SECRET=your-secure-jwt-secret
NODE_ENV=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001

# n8n Automation
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-secure-n8n-password
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http
N8N_WEBHOOK_URL=http://n8n:5678/webhook
WEBHOOK_URL=http://localhost:5678
```

## Production Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin
```

### 2. Clone and Configure

```bash
cd /opt
sudo git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# Create production environment file
sudo nano .env
```

### 3. Production Environment

```bash
# PostgreSQL
POSTGRES_USER=qc_user
POSTGRES_PASSWORD=STRONG_PASSWORD_HERE
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://qc_user:STRONG_PASSWORD_HERE@postgres:5432/qc_app

# API
PORT=3001
JWT_SECRET=GENERATE_RANDOM_64_CHAR_STRING
NODE_ENV=production

# Frontend
NEXT_PUBLIC_API_URL=https://qc.yourdomain.com/api

# n8n
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=STRONG_N8N_PASSWORD
N8N_HOST=n8n.yourdomain.com
N8N_PORT=5678
N8N_PROTOCOL=https
N8N_WEBHOOK_URL=http://n8n:5678/webhook
WEBHOOK_URL=https://n8n.yourdomain.com
```

### 4. Update Nginx Configuration

Edit `nginx/default.conf` and replace `yourdomain.com` with your actual domain:

```nginx
server {
    listen 80;
    server_name qc.yourdomain.com;  # <- Change this
    ...
}

server {
    listen 80;
    server_name n8n.yourdomain.com;  # <- Change this
    ...
}
```

### 5. Start Production

```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Verify health
curl http://localhost:3001/health
```

### 6. SSL Configuration (Optional but Recommended)

For HTTPS, use a reverse proxy like Nginx with Let's Encrypt:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificates
sudo certbot --nginx -d qc.yourdomain.com -d n8n.yourdomain.com
```

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js Web App |
| API | 3001 | Express.js Backend |
| n8n | 5678 | Automation Server |
| PostgreSQL | 5432 | Database |
| Nginx | 80/443 | Reverse Proxy (prod) |

## Verify Deployment

```bash
# Check all containers are running
docker-compose ps

# Test API health
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}

# Test API endpoint
curl http://localhost:3001/projects
# Expected: [] or list of projects

# Access frontend
# Open http://localhost:3000 in browser
```

## n8n Workflow Setup

1. Access n8n: http://localhost:5678
2. Login with credentials from `.env`
3. Create PostgreSQL credentials:
   - Host: `postgres`
   - Port: `5432`
   - Database: `qc_app`
   - User/Password: from `.env`
4. Import workflows from `n8n/` directory
5. Activate workflows

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs <service-name>

# Common fixes
docker-compose down
docker-compose up -d --build
```

### Database Connection Failed

```bash
# Check PostgreSQL is healthy
docker-compose exec postgres pg_isready

# Connect manually
docker-compose exec postgres psql -U postgres -d qc_app
```

### API Not Responding

```bash
# Check API logs
docker-compose logs api

# Verify DATABASE_URL is correct
# Ensure PostgreSQL is running first
```

### Frontend Build Errors

```bash
# Rebuild frontend
docker-compose down web
docker-compose up -d --build web
```

## Backup & Restore

### Backup Database

```bash
docker-compose exec postgres pg_dump -U postgres qc_app > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T postgres psql -U postgres qc_app
```

## Updating

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```
