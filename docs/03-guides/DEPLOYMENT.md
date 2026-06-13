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
QC_AGENT_WEBHOOK_SECRET=change-this-agent-webhook-secret

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
PUBLIC_SITE_URL=http://localhost:3000
LANDING_PAGE_REVALIDATE_SECONDS=60

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
QC_AGENT_WEBHOOK_SECRET=GENERATE_RANDOM_AGENT_WEBHOOK_SECRET

# Frontend
NEXT_PUBLIC_API_URL=https://qc.yourdomain.com/api
PUBLIC_SITE_URL=https://qc.yourdomain.com
LANDING_PAGE_REVALIDATE_SECONDS=60

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

# Verify startup migrations, including landing page tables
docker-compose logs api | grep "Database migrations completed successfully"

# Test public landing content
curl http://localhost:3001/api/public/landing-page

# Test API endpoint
curl http://localhost:3001/projects
# Expected: [] or list of projects

# Access frontend
# Open http://localhost:3000 in browser
```

## Public Landing Page and AI/n8n Changelog Webhook

The API startup migration creates:

- `landing_page_config`
- `landing_page_features`
- `roadmap_items`
- `changelog_entries`
- `ai_content_generation_logs`

Admin configuration is available at `/admin/landing-config` for users with `qc.admin.landing_page.manage`.

Example n8n changelog publish call:

```bash
curl -X POST "https://api.yourdomain.com/api/webhooks/landing-content/changelog" \
  -H "Content-Type: application/json" \
  -H "x-qc-agent-secret: $QC_AGENT_WEBHOOK_SECRET" \
  -d '{
    "version_number": "v1.4.0",
    "title": "Release v1.4.0",
    "content_markdown": "### Added\n- New dashboard widgets\n\n### Fixed\n- Bug sync issue",
    "published_at": "2026-06-13T10:00:00Z",
    "source": "n8n",
    "source_reference": "workflow-id-or-github-release"
  }'
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
