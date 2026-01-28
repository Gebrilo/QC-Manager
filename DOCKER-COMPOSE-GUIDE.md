# Docker Compose Guide

This project uses the **Docker Compose Override Pattern** - a best practice approach that eliminates duplication and confusion.

---

## File Structure

```
/
├── docker-compose.yml           # Base config (production-ready)
├── docker-compose.override.yml  # Local dev overrides (auto-merged)
├── env.example                  # Environment template
└── .env                         # Your config (gitignored)
```

---

## Quick Start

### Local Development

```bash
# No setup needed - override file provides dev defaults
docker compose up -d

# Access:
# Frontend: http://localhost:3000
# API:      http://localhost:3001
# n8n:      http://localhost:5678
# Database: localhost:5432
```

### VPS Deployment (Hostinger or Any)

```bash
# 1. Configure environment
cp env.example .env
nano .env  # Update passwords and YOUR_VPS_IP

# 2. Deploy
docker compose up -d

# Access:
# Frontend: http://YOUR_VPS_IP (via nginx)
# n8n:      http://YOUR_VPS_IP:5678
```

---

## How It Works

### Automatic Override Merging

When you run `docker compose up`, Docker automatically:

1. Loads `docker-compose.yml` (base config)
2. Looks for `docker-compose.override.yml`
3. Merges them together if found

| Environment | Override File Present? | Result |
|-------------|----------------------|--------|
| Local Dev   | Yes (in repo)        | Base + Override merged |
| VPS Server  | No (not deployed)    | Base only (production mode) |

### What Gets Overridden for Local Dev

| Setting | Production (Base) | Local Dev (Override) |
|---------|-------------------|----------------------|
| DB Password | From .env (required) | `postgres` (hardcoded) |
| JWT Secret | From .env (required) | Dev secret (hardcoded) |
| API URL | From .env (required) | `http://localhost:3001` |
| DB Port | Not exposed | `5432` (for local tools) |
| API Port | Not exposed | `3001` (direct access) |
| Web Port | Not exposed | `3000` (direct access) |
| Nginx | Enabled | Disabled (use direct ports) |

---

## Environment Variables

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password | `openssl rand -hex 16` |
| `JWT_SECRET` | API authentication secret | `openssl rand -hex 32` |
| `DATABASE_URL` | Full connection string | `postgresql://user:pass@postgres:5432/qc_app` |
| `NEXT_PUBLIC_API_URL` | Frontend API endpoint | `http://192.168.1.100/api` |
| `N8N_BASIC_AUTH_PASSWORD` | n8n admin password | `openssl rand -hex 12` |
| `N8N_HOST` | n8n hostname | `192.168.1.100` |
| `WEBHOOK_URL` | n8n webhook base URL | `http://192.168.1.100:5678` |

### Generate Secure Passwords

```bash
# Database password (16 bytes = 32 hex chars)
openssl rand -hex 16

# JWT secret (32 bytes = 64 hex chars)
openssl rand -hex 32

# n8n password (12 bytes = 24 hex chars)
openssl rand -hex 12
```

---

## Common Commands

### Start Services

```bash
# Local (with override)
docker compose up -d

# Production (base only)
docker compose up -d
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f web
```

### Check Status

```bash
docker compose ps
```

### Restart Services

```bash
# All
docker compose restart

# Specific
docker compose restart api
```

### Stop Services

```bash
# Stop (keep volumes)
docker compose down

# Stop and remove volumes (DELETES DATA!)
docker compose down -v
```

### Rebuild After Code Changes

```bash
# Web service (triggers Next.js rebuild)
docker compose exec web rm -rf .next
docker compose restart web

# API service (reinstalls dependencies)
docker compose restart api
```

---

## Troubleshooting

### "POSTGRES_PASSWORD is required"

You're on a VPS without `.env` file configured.

```bash
cp env.example .env
nano .env  # Set all required values
docker compose up -d
```

### "Cannot connect to database"

1. Check PostgreSQL is healthy:
   ```bash
   docker compose ps postgres
   docker compose logs postgres
   ```

2. Verify DATABASE_URL matches POSTGRES_PASSWORD:
   ```bash
   grep POSTGRES_PASSWORD .env
   grep DATABASE_URL .env
   ```

### "Web shows 'Building...' but never starts"

First build takes 2-3 minutes. Monitor progress:
```bash
docker compose logs -f web
```

### "Nginx returns 502 Bad Gateway"

Backend services aren't ready yet. Wait or check:
```bash
docker compose logs api
docker compose logs web
```

### Port Already in Use

```bash
# Find what's using the port
netstat -tlnp | grep :3000

# Or force recreate
docker compose down
docker compose up -d
```

---

## Architecture

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Nginx    │ :80
                    │  (reverse   │
                    │   proxy)    │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │     Web     │ │     API     │ │     n8n     │
    │  (Next.js)  │ │  (Express)  │ │ (Workflows) │
    │    :3000    │ │    :3001    │ │    :5678    │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
                    ┌──────▼──────┐
                    │  PostgreSQL │
                    │    :5432    │
                    └─────────────┘
```

---

## Migration from Old Setup

If you were using the old multi-file setup:

```bash
# 1. Stop old containers
docker compose -f docker-compose.hostinger.yml down
# or
docker compose -f docker-compose.prod.yml down

# 2. Pull latest code
git pull origin main

# 3. Configure environment
cp env.example .env
nano .env

# 4. Start with new config
docker compose up -d
```

Your data volumes (`postgres_data`, `n8n_data`) are preserved.

---

## Best Practices

1. **Never commit `.env`** - It's gitignored for security
2. **Use strong passwords** - Generate with `openssl rand -hex`
3. **Keep `docker-compose.override.yml` local** - Don't deploy it to VPS
4. **Monitor logs after deploy** - `docker compose logs -f`
5. **Backup before updates** - `docker compose exec postgres pg_dump ...`

---

## Related Documentation

- **VPS Deployment Guide**: `docs/03-guides/VPS-DEPLOYMENT.md`
- **Quick Start**: `HOSTINGER-QUICKSTART.md`
- **Deployment Checklist**: `DEPLOYMENT-CHECKLIST.md`
- **n8n Workflows**: `n8n/README.md`
