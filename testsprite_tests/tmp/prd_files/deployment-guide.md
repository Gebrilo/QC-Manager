# QC Management Tool - Complete Deployment Guide

## Overview

This guide covers the complete setup and deployment of the QC Management Tool to your Hostinger VPS, from local development to production deployment.

---

## Table of Contents

1. [Local Development Setup](#1-local-development-setup)
2. [Database Setup](#2-database-setup)
3. [Backend API Setup](#3-backend-api-setup)
4. [Frontend Setup](#4-frontend-setup)
5. [n8n Workflow Setup](#5-n8n-workflow-setup)
6. [Hostinger VPS Deployment](#6-hostinger-vps-deployment)
7. [Domain & SSL Setup](#7-domain--ssl-setup)
8. [Production Configuration](#8-production-configuration)
9. [Monitoring & Maintenance](#9-monitoring--maintenance)

---

## 1. Local Development Setup

### Prerequisites

Install the following on your local development machine:

```bash
# Node.js (v18+ recommended)
https://nodejs.org/

# PostgreSQL (v14+)
https://www.postgresql.org/download/

# Git
https://git-scm.com/downloads

# VS Code (recommended)
https://code.visualstudio.com/
```

### Project Structure

Create the following directory structure:

```
qc-management-tool/
├── backend/              # API server
│   ├── src/
│   ├── package.json
│   └── .env
├── frontend/             # Next.js app
│   ├── app/
│   ├── components/
│   ├── package.json
│   └── .env.local
├── database/             # DB schemas & migrations
│   └── schema.sql
├── n8n/                  # Workflow definitions
│   └── workflows/
├── docs/                 # Documentation
└── docker-compose.yml    # Local development (optional)
```

---

## 2. Database Setup

### Local PostgreSQL Setup

**Step 1: Install PostgreSQL**

```bash
# Windows: Download installer from postgresql.org
# Linux (Ubuntu/Debian):
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS:
brew install postgresql@14
brew services start postgresql@14
```

**Step 2: Create Database and User**

```bash
# Access PostgreSQL
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE qc_management;
CREATE USER qc_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE qc_management TO qc_user;

# Exit
\q
```

**Step 3: Run Schema**

```bash
# Download schema
# Located at: database/schema.sql

# Apply schema
psql -U qc_user -d qc_management -f database/schema.sql
```

### Schema File

Create `database/schema.sql`:

```sql
-- See the complete schema in database/schema.sql
-- (Already created in previous step)
```

---

## 3. Backend API Setup

### Initialize Backend Project

```bash
cd backend
npm init -y
```

### Install Dependencies

```bash
npm install express
npm install @hono/node-server hono
npm install zod
npm install pg
npm install dotenv
npm install cors
npm install helmet
npm install express-rate-limit

# Dev dependencies
npm install -D typescript @types/node @types/express
npm install -D tsx nodemon
```

### TypeScript Configuration

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Environment Variables

Create `backend/.env`:

```env
# Server
NODE_ENV=development
PORT=3001
API_BASE_URL=http://localhost:3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=qc_management
DB_USER=qc_user
DB_PASSWORD=your_secure_password
DB_SSL=false

# Security
JWT_SECRET=your_jwt_secret_min_32_chars
CORS_ORIGIN=http://localhost:3000

# n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook
N8N_API_KEY=your_n8n_api_key

# Storage (for reports)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
S3_BUCKET_NAME=qc-reports
```

### Package.json Scripts

Update `backend/package.json`:

```json
{
  "name": "qc-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

### Basic Server Structure

Create `backend/src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true',
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';

app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
});
```

### Start Development Server

```bash
npm run dev
```

Test: Visit `http://localhost:3001/health`

---

## 4. Frontend Setup

### Initialize Next.js Project

```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
```

### Install Additional Dependencies

```bash
npm install axios
npm install react-hook-form
npm install @tanstack/react-query
npm install lucide-react
npm install date-fns
```

### Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_N8N_WEBHOOK_URL=http://localhost:5678/webhook
```

### Project Structure

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── projects/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   └── tasks/
│       └── page.tsx
├── components/
│   ├── ProjectList.tsx
│   ├── TaskTable.tsx
│   ├── TaskForm.tsx
│   └── ReportExportPanel.tsx
└── lib/
    └── api.ts
```

### API Client

Create `frontend/lib/api.ts`:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
```

### Start Development Server

```bash
npm run dev
```

Visit: `http://localhost:3000`

---

## 5. n8n Workflow Setup

### Install n8n (Local Development)

```bash
# Option 1: Global installation
npm install -g n8n

# Option 2: npx (no installation)
npx n8n

# Option 3: Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### Start n8n

```bash
n8n start
```

Visit: `http://localhost:5678`

### Import Workflows

1. Open n8n at `http://localhost:5678`
2. Click "Workflows" → "Import from File"
3. Import the following workflows:
   - `n8n/qc_generate_project_summary_pdf.json`
   - `n8n/qc_generate_task_export_excel.json`
   - `n8n/qc_cleanup_expired_reports.json`

### Configure Credentials

In n8n, add credentials for:

1. **PostgreSQL**
   - Host: `localhost`
   - Database: `qc_management`
   - User: `qc_user`
   - Password: `your_secure_password`

2. **AWS S3** (for report storage)
   - Access Key ID
   - Secret Access Key
   - Region: `us-east-1`

3. **PDFShift** (for PDF generation)
   - API Key (get from https://pdfshift.io)

### Activate Workflows

Enable each workflow in n8n UI.

---

## 6. Hostinger VPS Deployment

### VPS Specifications (Recommended)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Storage | 50 GB SSD | 100 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Step 1: Connect to VPS

```bash
ssh root@your-vps-ip
```

### Step 2: Initial Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Create non-root user
adduser qcadmin
usermod -aG sudo qcadmin

# Setup firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Switch to new user
su - qcadmin
```

### Step 3: Install Required Software

```bash
# Node.js (v18 LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Nginx (reverse proxy)
sudo apt install -y nginx

# PM2 (process manager)
sudo npm install -g pm2

# Git
sudo apt install -y git
```

### Step 4: Setup PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE qc_management;
CREATE USER qc_user WITH ENCRYPTED PASSWORD 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE qc_management TO qc_user;
\q

# Allow remote connections (if needed)
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: host qc_management qc_user 127.0.0.1/32 md5

sudo systemctl restart postgresql
```

### Step 5: Clone & Setup Backend

```bash
cd /home/qcadmin
git clone YOUR_REPO_URL qc-app
cd qc-app/backend

# Install dependencies
npm install

# Create production .env
nano .env
```

**Production .env**:

```env
NODE_ENV=production
PORT=3001
API_BASE_URL=https://api.yourdomain.com

DB_HOST=localhost
DB_PORT=5432
DB_NAME=qc_management
DB_USER=qc_user
DB_PASSWORD=STRONG_PASSWORD_HERE
DB_SSL=false

JWT_SECRET=VERY_STRONG_SECRET_MIN_32_CHARS
CORS_ORIGIN=https://yourdomain.com

N8N_WEBHOOK_URL=http://localhost:5678/webhook
N8N_API_KEY=your_n8n_api_key

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET_NAME=qc-reports
```

```bash
# Build backend
npm run build

# Start with PM2
pm2 start dist/index.js --name qc-backend
pm2 save
pm2 startup
```

### Step 6: Setup Frontend

```bash
cd /home/qcadmin/qc-app/frontend

# Create production .env.local
nano .env.local
```

**Production .env.local**:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook
```

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start with PM2
pm2 start npm --name qc-frontend -- start
pm2 save
```

### Step 7: Setup n8n

```bash
# Install n8n globally
sudo npm install -g n8n

# Create n8n directory
mkdir ~/.n8n

# Start with PM2
pm2 start n8n --name qc-n8n
pm2 save
```

### Step 8: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/qc-app
```

**Nginx Configuration**:

```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# n8n
server {
    listen 80;
    server_name n8n.yourdomain.com;

    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/qc-app /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 7. Domain & SSL Setup

### Step 1: Point Domain to VPS

In your domain registrar (e.g., Hostinger Domain Manager):

| Type | Hostname | Value |
|------|----------|-------|
| A | @ | your-vps-ip |
| A | www | your-vps-ip |
| A | api | your-vps-ip |
| A | n8n | your-vps-ip |

### Step 2: Install Certbot (Let's Encrypt SSL)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificates
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo certbot --nginx -d api.yourdomain.com
sudo certbot --nginx -d n8n.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

Certbot will automatically update your Nginx configuration for HTTPS.

---

## 8. Production Configuration

### Environment Security

```bash
# Secure .env files
chmod 600 /home/qcadmin/qc-app/backend/.env
chmod 600 /home/qcadmin/qc-app/frontend/.env.local

# Restrict directory permissions
chmod 750 /home/qcadmin/qc-app
```

### Database Backups

Create backup script `backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/qcadmin/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U qc_user qc_management > $BACKUP_DIR/qc_db_$DATE.sql
gzip $BACKUP_DIR/qc_db_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "qc_db_*.sql.gz" -mtime +7 -delete
```

```bash
chmod +x backup-db.sh

# Add to cron (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/qcadmin/backup-db.sh
```

### PM2 Monitoring

```bash
# View logs
pm2 logs

# Monitor processes
pm2 monit

# Restart on code changes
pm2 restart qc-backend
pm2 restart qc-frontend
```

---

## 9. Monitoring & Maintenance

### Log Files

```bash
# Backend logs
pm2 logs qc-backend

# Frontend logs
pm2 logs qc-frontend

# n8n logs
pm2 logs qc-n8n

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Health Checks

Create `health-check.sh`:

```bash
#!/bin/bash

# Check backend
curl -f http://localhost:3001/health || echo "Backend DOWN"

# Check frontend
curl -f http://localhost:3000 || echo "Frontend DOWN"

# Check n8n
curl -f http://localhost:5678 || echo "n8n DOWN"

# Check PostgreSQL
pg_isready -h localhost -p 5432 || echo "PostgreSQL DOWN"
```

### Updates

```bash
# Update code
cd /home/qcadmin/qc-app
git pull origin main

# Update dependencies
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build

# Restart services
pm2 restart all
```

---

## Quick Start Checklist

- [ ] Install Node.js, PostgreSQL locally
- [ ] Create database and apply schema
- [ ] Setup backend with `.env`
- [ ] Setup frontend with `.env.local`
- [ ] Install and configure n8n
- [ ] Test locally (`localhost:3000`)
- [ ] Setup Hostinger VPS
- [ ] Install server dependencies
- [ ] Deploy backend, frontend, n8n
- [ ] Configure Nginx
- [ ] Setup DNS records
- [ ] Enable SSL with Certbot
- [ ] Configure backups
- [ ] Test production app

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to database" | Check PostgreSQL is running: `sudo systemctl status postgresql` |
| "Port already in use" | Check what's using port: `lsof -i :3001` |
| "502 Bad Gateway" | Backend not running: `pm2 restart qc-backend` |
| "Module not found" | Run `npm install` in the correct directory |
| SSL certificate error | Re-run certbot: `sudo certbot --nginx` |

---

## Support Resources

- PostgreSQL Docs: https://www.postgresql.org/docs/
- Next.js Docs: https://nextjs.org/docs
- n8n Docs: https://docs.n8n.io/
- Nginx Docs: https://nginx.org/en/docs/
- PM2 Docs: https://pm2.keymetrics.io/docs/

---

**Next Steps:** Start with local development, then follow the VPS deployment steps when ready for production.
