# Docker Hub — Build, Push & Deploy Guide

## Prerequisites

```bash
# 1. Install Docker Desktop (Windows/Mac) or Docker Engine (Linux)
# 2. Create a Docker Hub account at https://hub.docker.com
# 3. Log in from your terminal:
docker login
# Enter your Docker Hub username and password/access-token
```

> [!TIP]
> Use a **Docker Hub Access Token** instead of your password. Create one at:
> `Docker Hub → Account Settings → Security → New Access Token`

---

## Quick Start — Build & Push

### Option A: One-command script

```bash
# Tag as "latest"
build-and-push.bat <your-dockerhub-username>

# Tag as specific version + latest
build-and-push.bat <your-dockerhub-username> v1.0.0

# Custom API URL for production build
build-and-push.bat <your-dockerhub-username> v1.0.0 https://api.gerbil.qc
```

### Option B: Manual commands

```bash
# Build API image
docker build -t <username>/qc-api:v1.0.0 -t <username>/qc-api:latest ./apps/api

# Build Web image (NEXT_PUBLIC_API_URL is baked at build time)
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.gerbil.qc ^
  -t <username>/qc-web:v1.0.0 -t <username>/qc-web:latest ./apps/web

# Push all tags
docker push <username>/qc-api:v1.0.0
docker push <username>/qc-api:latest
docker push <username>/qc-web:v1.0.0
docker push <username>/qc-web:latest
```

---

## Pull & Deploy on VPS

### Option A: Docker Compose (recommended)

```bash
# 1. Copy docker-compose.prod.yml and .env to your server
# 2. Configure .env (see .env.production.example)
# 3. Create the shared network
docker network create qc-shared-network

# 4. Pull and start everything
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 5. Check status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

### Option B: Standalone docker run

```bash
# Pull images
docker pull <username>/qc-api:latest
docker pull <username>/qc-web:latest

# Run API
docker run -d --name qc-api -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/qc_app \
  -e JWT_SECRET=your-production-secret \
  -e NODE_ENV=production \
  -e CORS_ORIGIN=https://yourdomain.com \
  <username>/qc-api:latest

# Run Web
docker run -d --name qc-web -p 3000:3000 \
  <username>/qc-web:latest
```

---

## Tag Versioning Strategy

| Tag | Purpose | When to use |
|-----|---------|-------------|
| `latest` | Most recent stable build | Always pushed alongside version tags |
| `v1.0.0` | Immutable release | Every production release |
| `v1.0` | Latest patch in minor | Optional, for auto-patching |
| `v1` | Latest minor in major | Optional, for looser pinning |

```bash
# Multi-tag example
docker build -t user/qc-api:v1.2.3 -t user/qc-api:v1.2 -t user/qc-api:v1 -t user/qc-api:latest ./apps/api
```

> [!IMPORTANT]
> **Always pin to a specific version in production** (e.g., `v1.0.0`), not `latest`.

---

## Environment Variables Reference

### API (`qc-api`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP listen port |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | JWT signing secret (min 32 chars) |
| `NODE_ENV` | No | `production` | Set by Dockerfile |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin |
| `N8N_WEBHOOK_URL` | No | — | n8n webhook endpoint |

### Web (`qc-web`)

| Variable | Required | When | Description |
|----------|----------|------|-------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | **Build time** | API base URL baked into JS bundle |
| `PORT` | No | Runtime | Default `3000` |
| `HOSTNAME` | No | Runtime | Default `0.0.0.0` |

---

## Secrets Handling

> [!CAUTION]
> **Never bake secrets into Docker images.** Pass them at runtime via environment variables or Docker secrets.

```bash
# ✅ Good — pass at runtime
docker run -e JWT_SECRET=supersecret ... qc-api:latest

# ✅ Good — use env file
docker run --env-file .env.production ... qc-api:latest

# ✅ Best — use Docker secrets (Swarm mode)
echo "supersecret" | docker secret create jwt_secret -

# ❌ Bad — hardcoded in Dockerfile
ENV JWT_SECRET=hardcoded   # NEVER do this
```

---

## Production vs Development

| Aspect | Development | Production |
|--------|-------------|------------|
| Compose file | `docker-compose.yml` | `docker-compose.prod.yml` |
| Source code | Mounted via volumes | Baked into image |
| Hot reload | ✅ Yes | ❌ No |
| Image source | `node:18-alpine` (raw) | `<user>/qc-api:v1.0.0` |
| `NODE_ENV` | `development` | `production` |
| Dependencies | All (incl. devDeps) | Production only |

---

## CI/CD — GitHub Actions Example

```yaml
# .github/workflows/docker-publish.yml
name: Build & Push Docker Images

on:
  push:
    tags: ['v*']

env:
  API_IMAGE: ${{ secrets.DOCKER_HUB_USERNAME }}/qc-api
  WEB_IMAGE: ${{ secrets.DOCKER_HUB_USERNAME }}/qc-web

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}
          password: ${{ secrets.DOCKER_HUB_TOKEN }}

      - name: Extract version
        id: version
        run: echo "tag=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Build & push API
        uses: docker/build-push-action@v5
        with:
          context: ./apps/api
          push: true
          tags: |
            ${{ env.API_IMAGE }}:${{ steps.version.outputs.tag }}
            ${{ env.API_IMAGE }}:latest

      - name: Build & push Web
        uses: docker/build-push-action@v5
        with:
          context: ./apps/web
          push: true
          build-args: |
            NEXT_PUBLIC_API_URL=${{ secrets.NEXT_PUBLIC_API_URL }}
          tags: |
            ${{ env.WEB_IMAGE }}:${{ steps.version.outputs.tag }}
            ${{ env.WEB_IMAGE }}:latest
```

**Required GitHub Secrets:**
- `DOCKER_HUB_USERNAME` — your Docker Hub username
- `DOCKER_HUB_TOKEN` — Docker Hub access token
- `NEXT_PUBLIC_API_URL` — production API URL (e.g., `https://api.gerbil.qc`)

---

## Updating a Deployed Server

```bash
# SSH into your VPS, then:
cd /opt/qc-management   # or wherever your compose file lives

# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Recreate containers with new images (zero-downtime if behind a reverse proxy)
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Clean up old images
docker image prune -f
```
