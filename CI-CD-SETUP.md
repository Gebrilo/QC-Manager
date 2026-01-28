# CI/CD Pipeline Setup Guide

This guide explains how to set up the automated CI/CD pipeline using GitHub Actions, Docker Hub, and your VPS.

## Pipeline Overview

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│  git push   │───►│   GitHub     │───►│  Docker Hub │───►│   VPS       │
│  to main    │    │   Actions    │    │   Registry  │    │   Deploy    │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────────┘
```

**Workflow:**
1. Push code to `main` branch
2. GitHub Actions builds Docker images
3. Images pushed to Docker Hub
4. SSH to VPS pulls and deploys

---

## Step 1: Create Docker Hub Account and Token

1. Go to https://hub.docker.com and sign up/login
2. Navigate to **Account Settings** → **Security**
3. Click **New Access Token**
4. Settings:
   - **Description:** `github-actions`
   - **Permissions:** Read & Write
5. **Copy and save the token** (shown only once)

---

## Step 2: Generate SSH Key for GitHub Actions

On your **local machine**, run:

```bash
# Generate new SSH key
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_key

# View the private key (needed for GitHub Secret)
cat ~/.ssh/github_actions_key

# View the public key (add to VPS)
cat ~/.ssh/github_actions_key.pub
```

Add the **public key** to your VPS:

```bash
# Option 1: Using ssh-copy-id
ssh-copy-id -i ~/.ssh/github_actions_key.pub root@YOUR_VPS_IP

# Option 2: Manual (on VPS)
echo "YOUR_PUBLIC_KEY_CONTENT" >> ~/.ssh/authorized_keys
```

---

## Step 3: Add GitHub Secrets

Go to your GitHub repository:
**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 6 secrets:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `DOCKER_HUB_USERNAME` | Docker Hub username | Your Docker Hub login |
| `DOCKER_HUB_TOKEN` | Docker Hub access token | From Step 1 |
| `VPS_HOST` | VPS IP address | Your Hostinger VPS IP |
| `VPS_USERNAME` | SSH username | Usually `root` |
| `VPS_SSH_KEY` | Private SSH key | Content of `github_actions_key` (from Step 2) |
| `NEXT_PUBLIC_API_URL` | Frontend API URL | `http://YOUR_VPS_IP/api` |

### Example Values

```
DOCKER_HUB_USERNAME: gebrilo
DOCKER_HUB_TOKEN: dckr_pat_xxxxxxxxxxxxxx
VPS_HOST: 192.168.1.100
VPS_USERNAME: root
VPS_SSH_KEY: -----BEGIN OPENSSH PRIVATE KEY-----
             ... (entire private key content)
             -----END OPENSSH PRIVATE KEY-----
NEXT_PUBLIC_API_URL: http://192.168.1.100/api
```

---

## Step 4: Initial VPS Setup

SSH to your VPS and run:

```bash
# Clone repository
cd /opt
git clone https://github.com/YOUR_USERNAME/QC-Manager.git
cd QC-Manager

# Configure environment
cp env.example .env
nano .env  # Fill in all required values

# Add DOCKER_HUB_USERNAME to .env
echo "DOCKER_HUB_USERNAME=your_dockerhub_username" >> .env
```

### Required .env Variables for Production

```env
# Database
POSTGRES_USER=qc_user
POSTGRES_PASSWORD=<generate with: openssl rand -hex 16>
POSTGRES_DB=qc_app
DATABASE_URL=postgresql://qc_user:<password>@postgres:5432/qc_app

# Security
JWT_SECRET=<generate with: openssl rand -hex 32>

# External n8n (your existing n8n instance)
N8N_WEBHOOK_URL=https://n8n.srv1206957.hstgr.cloud/webhook

# Frontend
NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP/api

# Docker Hub (for pulling images)
DOCKER_HUB_USERNAME=your_dockerhub_username
```

---

## Step 5: Test the Pipeline

### Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Build and Deploy to Hostinger VPS**
3. Click **Run workflow** → **Run workflow**

### Automatic Trigger

```bash
# Any push to main triggers the pipeline
git add .
git commit -m "feat: Add new feature"
git push origin main
```

---

## Monitoring

### View Workflow Runs

- Go to **Actions** tab in your GitHub repository
- Click on a workflow run to see details
- Each step shows logs and status

### Check VPS Deployment

```bash
# SSH to VPS
ssh root@YOUR_VPS_IP

# Check running containers
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Check specific service
docker compose -f docker-compose.prod.yml logs -f api
```

---

## Rollback

Each deployment creates images tagged with commit SHA:

```bash
# SSH to VPS
ssh root@YOUR_VPS_IP
cd /opt/QC-Manager

# List available tags
docker images | grep qc-api
docker images | grep qc-web

# Update docker-compose.prod.yml to use specific version
# Change: image: username/qc-api:latest
# To:     image: username/qc-api:abc123def  (commit SHA)

# Deploy specific version
docker compose -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

### Build Failed

1. Check Actions logs for error details
2. Common issues:
   - Dockerfile syntax error
   - Missing dependencies in package.json
   - Build arg not passed correctly

### Deploy Failed

1. Check SSH connection:
   ```bash
   ssh -i ~/.ssh/github_actions_key root@YOUR_VPS_IP
   ```

2. Verify VPS_SSH_KEY secret:
   - Must include `-----BEGIN` and `-----END` lines
   - No extra whitespace

3. Check VPS firewall allows SSH (port 22)

### Container Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs api
docker compose -f docker-compose.prod.yml logs web

# Common issues:
# - DATABASE_URL incorrect
# - Missing environment variables
# - Port conflicts
```

### Images Not Updating

```bash
# Force pull latest images
docker compose -f docker-compose.prod.yml pull

# Recreate containers
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Clean up old images
docker image prune -f
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | GitHub Actions workflow definition |
| `apps/api/Dockerfile` | API service build instructions |
| `apps/web/Dockerfile` | Web service build instructions |
| `docker-compose.prod.yml` | Production deployment config (uses Docker Hub images) |
| `docker-compose.yml` | Base config (source builds) |

---

## Security Best Practices

1. **Never commit secrets** - Use GitHub Secrets only
2. **Rotate tokens regularly** - Regenerate Docker Hub token periodically
3. **Use separate SSH key** - Don't reuse personal SSH keys
4. **Limit SSH access** - Consider restricting SSH to GitHub Actions IPs
5. **Monitor deployments** - Set up alerts for failed workflows
