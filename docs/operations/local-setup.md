# Local Setup

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- A Supabase project (for auth and production DB; optional for local dev with local PostgreSQL)

## Option 1: Docker (Recommended)

```bash
# One-time network setup
docker network create qc-shared-network

# Configure environment
cp .env.example .env
# Edit .env: set JWT_SECRET, Supabase keys (optional for local-only)

# Start the stack
docker compose up -d

# Check logs
docker compose logs -f api
```

### Local URLs

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| Health | http://localhost:3001/health |
| OpenAPI | http://localhost:3001/openapi.json |

> [!NOTE]
> Local Docker uses `docker-compose.override.yml` to set `DATABASE_URL` to the local `qc-postgres` container. Production uses Supabase cloud PostgreSQL.

## Option 2: Direct Node Development

### API

```bash
cd apps/api
npm install
cp ../../.env.example .env
# Edit .env with required values
npm run dev
```

### Web

```bash
cd apps/web
npm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EOF
npm run dev
```

## Common Commands

| Task | Command |
|------|---------|
| Start stack | `docker compose up -d` |
| Stop stack | `docker compose down` |
| API logs | `docker compose logs -f api` |
| Web logs | `docker compose logs -f web` |
| API dev server | `cd apps/api && npm run dev` |
| Web dev server | `cd apps/web && npm run dev` |
| API tests | `cd apps/api && npm test` |
| Web build | `cd apps/web && npm run build` |
| Web E2E tests | `cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e` |

## Verifying Setup

```bash
# API health check
curl http://localhost:3001/health

# Web is serving
curl -o /dev/null -w "%{http_code}" http://localhost:3000
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `qc-shared-network` not found | `docker network create qc-shared-network` |
| API can't connect to DB | Check `DATABASE_URL` in `.env` or compose override |
| Port conflict | Stop other services on ports 3000/3001 |
| `npm install` fails | Use Node.js 18+; check npm version |
