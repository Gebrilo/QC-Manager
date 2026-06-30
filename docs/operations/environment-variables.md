# Environment Variables

## File Locations

| Environment | File |
|-------------|------|
| Local Docker | `.env` (root) |
| Local API dev | `apps/api/.env` |
| Local Web dev | `apps/web/.env.local` |
| Production | `.env` (from `.env.production.example`) |
| Staging | `.env.staging` (from `.env.staging.example`) |

## API and Database

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Local/staging | PostgreSQL connection string |
| `SUPABASE_DATABASE_URL` | Production | Supabase PostgreSQL connection string; maps to `DATABASE_URL` in prod compose |
| `DATABASE_SSL` | Optional | Set `false` for local/non-SSL |
| `POSTGRES_USER` | Fallback | Used when no `DATABASE_URL` |
| `POSTGRES_PASSWORD` | Fallback | Used when no `DATABASE_URL` |
| `POSTGRES_DB` | Fallback | Used when no `DATABASE_URL` |
| `POSTGRES_HOST` | Fallback | Used when no `DATABASE_URL` |
| `POSTGRES_PORT` | Fallback | Used when no `DATABASE_URL` |
| `JWT_SECRET` | Required | Legacy JWT fallback |
| `SUPABASE_JWT_SECRET` | Required | Supabase token verification |
| `SUPABASE_URL` | Required | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server-only admin key |
| `CORS_ORIGIN` | Recommended | Allowed frontend origin |

## Frontend Build/Runtime

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | Required | Browser-facing API URL; baked at build time |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Browser-safe Supabase URL; baked at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Browser-safe anon key; baked at build time |
| `API_INTERNAL_URL` | Optional | Next.js proxy target; defaults to `http://qc-api:3001` |
| `PUBLIC_SITE_URL` | Optional | Public origin for landing metadata |
| `LANDING_PAGE_REVALIDATE_SECONDS` | Optional | ISR cache interval; default `60` |

## Integrations

| Variable | Required | Notes |
|----------|----------|-------|
| `N8N_WEBHOOK_URL` | Optional | n8n webhook base URL; empty = mock |
| `TULEAP_BASE_URL` | Optional | Tuleap instance URL |
| `TULEAP_ACCESS_KEY` | Optional | Tuleap personal access key |
| `TULEAP_DEFAULT_PROJECT_ID` | Optional | Default Tuleap project ID |
| `TULEAP_TRACKER_TASK` | Optional | Task tracker ID |
| `TULEAP_TRACKER_USER_STORY` | Optional | User story tracker ID |
| `TULEAP_TRACKER_TEST_CASE` | Optional | Test case tracker ID |
| `TULEAP_TRACKER_BUG` | Optional | Bug tracker ID |
| `TULEAP_RECONCILE_MAX_MISSING` | Optional | Deletion reconciliation tuning |
| `TULEAP_RECONCILE_CONFIRM_THRESHOLD` | Optional | Reconciliation threshold |

## Landing Page and AI Webhooks

| Variable | Required | Notes |
|----------|----------|-------|
| `QC_AGENT_WEBHOOK_SECRET` | Required | Shared secret for AI/n8n content webhooks (`x-qc-agent-secret` header) |
| `PUBLIC_SITE_URL` | Optional | Public origin |
| `LANDING_PAGE_REVALIDATE_SECONDS` | Optional | ISR cache interval |

## Deployment

| Variable | Required | Notes |
|----------|----------|-------|
| `WEB_DOMAIN` | Production | Traefik web domain |
| `API_DOMAIN` | Production | Traefik API domain |
| `DOCKER_HUB_USERNAME` | Production | Image namespace |
| `BACKUP_PATH` | Staging | Backup directory |
| `BACKUP_RETENTION_DAYS` | Staging | Backup retention |

## Feature Flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `RBAC_UNIFIED` | `off` | Toggle Access Engine vs legacy catalog |
