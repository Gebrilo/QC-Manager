# Configuration

## Environment Variables

See [operations/environment-variables.md](../operations/environment-variables.md) for the complete reference.

## Feature Flags

| Flag | Env Variable | Default | Purpose |
|------|-------------|---------|---------|
| RBAC Unified Mode | `RBAC_UNIFIED` | `off` | Toggles matrix-based Access Engine vs legacy catalog (ADR 0010) |
| Landing revalidation | `LANDING_PAGE_REVALIDATE_SECONDS` | `60` | Landing page ISR cache interval |
| n8n mock mode | `N8N_WEBHOOK_URL` (empty) | mock | Empty value mocks n8n calls in non-production |
| Database SSL | `DATABASE_SSL` | varies | Set `false` for local/non-SSL databases |

## Runtime Configuration

### API Startup

On every container start, `apps/api/src/config/db.js`:
1. Connects to PostgreSQL via `DATABASE_URL` or fallback env vars
2. Runs `runMigrations()` — idempotent DDL
3. Logs "Database migrations completed successfully"

### Permission Matrix

When `RBAC_UNIFIED=on`:
- API reads `role_permissions` + `role_scopes` tables
- Loads per-user `user_permissions` overrides
- Resolves effective permissions per request
- Matrix is hot-reloadable (read per request; flip with process restart)

### Web Build-Time Baking

These are baked into the production web image at build time:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Changing them requires rebuilding the web image.

## File Storage

- Uploads directory: `uploads/` (mounted as Docker volume)
- Subdirectory: `uploads/journey-tasks/` (must exist with write permissions)
- Avatars: `uploads/avatars/`
