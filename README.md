# QC-Manager

QC-Manager is a quality-control and delivery-management system for work tracked in Tuleap. It mirrors Tuleap artifacts into a QC-owned PostgreSQL database, then adds governance, test management, dashboards, resource planning, access control, notifications, and reporting on top.

The app is split into an Express API, a Next.js frontend, shared RBAC/domain utilities, PostgreSQL migrations, Docker deployment files, and n8n workflow definitions.

## Product Scope

- **Work tracking**: QC projects, user stories, tasks, bugs, task assignments, task history, and soft deletes.
- **Test management**: test cases, suites, runs, executions, result upload, quality metrics, and artifact traceability.
- **Dashboards**: global dashboard plus PM, team-manager, and member dashboards.
- **Governance**: quality gates, release approvals, release readiness, trend views, and quality reports.
- **People management**: users, teams, resources, journeys, onboarding/probation, and individual development plans.
- **Access control**: shared RBAC catalog, role permissions, per-user permission overrides, scoped artifact access, and row-level action flags.
- **Integrations**: Tuleap inbound/outbound artifact sync, n8n report/workflow webhooks, Supabase auth/storage, TestSprite webhook support, and artifact attachments.
- **Notifications and preferences**: in-app notifications, avatar/profile data, user preferences, display density, and default landing pages.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Radix UI, TanStack Table, Recharts, React Hook Form, Supabase JS |
| Backend | Node.js 18, Express 4, Zod, JWT, pg, Multer, xlsx |
| Shared code | RBAC catalog and access helpers under `apps/shared/` |
| Database | PostgreSQL. Production app data uses Supabase PostgreSQL; local Docker uses a local PostgreSQL container by default. |
| Auth | Supabase Auth sessions synced to `app_user`; legacy JWT verification is retained as a fallback during migration. |
| Automation | n8n workflow JSON under `n8n/`; n8n itself is optional/external to the main compose files. |
| Deployment | Docker, Docker Compose, Traefik labels, Docker Hub images, manual GitHub Actions deploy workflow |
| Testing | Jest/Supertest for API tests; Playwright for web e2e tests |

## Repository Layout

```text
.
|-- apps/
|   |-- api/                  # Express REST API, migrations-on-startup, route modules
|   |-- web/                  # Next.js App Router frontend
|   `-- shared/               # Shared RBAC catalog and cross-app utilities
|-- database/migrations/      # SQL reference migrations and targeted manual migrations
|-- docs/                     # Requirements, architecture, guides, QA packs, ADRs
|-- n8n/                      # n8n workflow definitions and workflow README
|-- specs/                    # Feature specifications
|-- docker-compose.yml        # Local Docker services
|-- docker-compose.override.yml
|-- docker-compose.staging.yml
|-- docker-compose.prod.yml
`-- .github/workflows/deploy.yml
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose, if using the containerized setup
- A Supabase project for authentication and production database/storage
- Access to Tuleap only if you are testing sync or outbound artifact creation

### Option 1: Local Docker

The local Docker setup starts `qc-postgres`, `qc-api`, and `qc-web`. It uses the local PostgreSQL container for app data because `docker-compose.override.yml` overrides `DATABASE_URL`.

```bash
docker network create qc-shared-network
cp .env.example .env
docker compose up -d
docker compose logs -f api
```

Local URLs:

- Web: http://localhost:3000
- API: http://localhost:3001
- Health: http://localhost:3001/health
- OpenAPI spec, when present: http://localhost:3001/openapi.json

Important local Docker notes:

- `docker-compose.override.yml` is automatically merged by Docker Compose.
- Root `.env` is used by Docker Compose variable substitution.
- Local compose does not start n8n. Configure `N8N_WEBHOOK_URL` only when an n8n instance is reachable.
- If the web app imports Supabase client code in your local flow, provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` through the web runtime or an `apps/web/.env.local` file.

### Option 2: Direct Node Development

When running services directly, each app reads env files from its own working directory. A root `.env` is not automatically loaded by `cd apps/api && npm run dev` or `cd apps/web && npm run dev`.

API:

```bash
cd apps/api
npm install
cp ../../.env.example .env
# Edit .env: set DATABASE_URL or SUPABASE_DATABASE_URL, JWT_SECRET,
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_JWT_SECRET.
npm run dev
```

Web:

```bash
cd apps/web
npm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EOF
npm run dev
```

## Common Commands

| Task | Command |
| --- | --- |
| Start local Docker stack | `docker compose up -d` |
| Stop local Docker stack | `docker compose down` |
| API logs | `docker compose logs -f api` |
| Web logs | `docker compose logs -f web` |
| API dev server | `cd apps/api && npm run dev` |
| Web dev server | `cd apps/web && npm run dev` |
| API tests | `cd apps/api && npm test` |
| Web production build | `cd apps/web && npm run build` |
| Web e2e tests | `cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e` |
| Production deploy from VPS checkout | `docker compose -f docker-compose.prod.yml up -d` |
| Staging deploy from VPS checkout | `docker compose -p qc-staging -f docker-compose.staging.yml --env-file .env.staging up -d` |

## Environment Variables

Use root `.env` for Docker Compose, `apps/api/.env` for direct API development, and `apps/web/.env.local` for direct web development.

### API and Database

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Local/direct or staging | PostgreSQL connection string. Local Docker sets this to `qc-postgres`. |
| `SUPABASE_DATABASE_URL` | Production | Supabase PostgreSQL connection string; production compose maps it into `DATABASE_URL`. |
| `DATABASE_SSL` | Optional | Set `false` for local/non-SSL databases. Supabase uses SSL. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT` | Local Docker/fallback | Used when no database URL is provided. |
| `JWT_SECRET` | Required | Legacy JWT fallback and local development secret. Use a strong secret outside local dev. |
| `SUPABASE_JWT_SECRET` | Required for Supabase auth sync | Used to verify Supabase access tokens. |
| `SUPABASE_URL` | Required for auth/storage features | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for admin/storage features | Server-only key. Do not expose it to the browser. |
| `CORS_ORIGIN` | Recommended | Allowed frontend origin. Defaults to `*`. |
| `OPENAPI_SPEC_PATH` | Optional | Overrides the served OpenAPI JSON path. |

### Frontend Build/Runtime

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Required | Browser-facing API base URL. Production Docker bakes this into the image at build time. |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Browser-safe Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Browser-safe Supabase anon key. |
| `API_INTERNAL_URL` | Optional | Used by Next.js rewrites for `/api-proxy/*`; defaults to `http://qc-api:3001`. |

### Integrations and Operations

| Variable | Required | Notes |
| --- | --- | --- |
| `N8N_WEBHOOK_URL` | Optional | Base n8n webhook URL, for example `http://n8n:5678/webhook`. Empty value mocks workflow calls in non-production. |
| `TULEAP_BASE_URL` | Optional unless syncing Tuleap | Tuleap instance URL. |
| `TULEAP_ACCESS_KEY` | Optional unless outbound Tuleap calls are enabled | Tuleap personal access key/API token. |
| `TULEAP_DEFAULT_PROJECT_ID` | Optional | Default Tuleap project id. |
| `TULEAP_TRACKER_TASK`, `TULEAP_TRACKER_USER_STORY`, `TULEAP_TRACKER_TEST_CASE`, `TULEAP_TRACKER_BUG` | Optional unless creating Tuleap artifacts | Tracker ids used by outbound artifact creation. |
| `TULEAP_RECONCILE_MAX_MISSING`, `TULEAP_RECONCILE_CONFIRM_THRESHOLD` | Optional | Deletion reconciliation tuning. |
| `REPORT_EMAIL_FROM`, `SYSTEM_EMAIL_FROM`, `SUPABASE_EMAIL_FROM` | Optional | Report/email sender fallbacks. |
| `WEB_DOMAIN`, `API_DOMAIN` | Production/staging | Domains used by Traefik labels and web build args. |
| `DOCKER_HUB_USERNAME` | Production/staging | Image namespace for compose and CI. |
| `BACKUP_PATH`, `BACKUP_RETENTION_DAYS` | Staging/ops | Used by staging backup service. |

See `.env.example`, `.env.staging.example`, and `.env.production.example` for templates.

## API Surface

The API mounts routes at both root and `/api` for compatibility. For example, `/projects` and `/api/projects` both resolve to the same router.

Primary route prefixes:

| Prefix | Purpose |
| --- | --- |
| `/auth`, `/auth/profile`, `/me` | Supabase session sync, current user, profile/avatar/preferences |
| `/projects`, `/user-stories`, `/tasks`, `/bugs` | Core QC artifacts and work tracking |
| `/resources`, `/teams`, `/manager`, `/development-plans` | Resource, team, manager, and IDP workflows |
| `/test-cases`, `/test-suites`, `/test-executions`, `/test-results` | Test authoring, suites, runs, executions, and uploaded results |
| `/dashboard`, `/dashboards`, `/reports`, `/governance` | Metrics, role dashboards, reporting, and quality gates |
| `/roles`, `/admin/access`, `/users` | RBAC, access engine, users, and permission management |
| `/journeys`, `/my-journeys`, `/my-tasks` | Onboarding journeys and personal work |
| `/notifications`, `/search`, `/attachments` | Cross-cutting app features |
| `/tuleap-webhook`, `/tuleap/artifacts` | Tuleap inbound webhook handling and outbound artifact APIs |
| `/testsprite` | TestSprite webhook integration |
| `/health`, `/openapi.json` | Health check and OpenAPI document endpoint |

## Data and Migration Model

- The app uses PostgreSQL tables such as `projects`, `tasks`, `task_resource_assignment`, `resources`, `app_user`, `teams`, `project_teams`, `project_managers`, `user_stories`, `bugs`, `test_case`, `test_suites`, `test_run`, `test_execution`, `test_result`, `report_jobs`, `notifications`, `tuleap_sync_config`, `tuleap_webhook_log`, and artifact link/access tables.
- `projects`, `tasks`, bugs, tests, and related artifacts use soft-delete fields where supported. Prefer `deleted_at` over hard deletion in app behavior.
- `apps/api/src/config/db.js` runs idempotent startup migrations and is the authoritative migration path for the running API.
- `database/migrations/` contains reference SQL and targeted/manual migration files. Use these carefully against disposable or staging databases before production.
- Production app data is in Supabase PostgreSQL. The production `qc-postgres` container is for n8n/internal storage only.

## Access Model

Built-in roles live in `apps/shared/rbac/catalog.ts`:

- `admin`
- `pm`
- `team_manager`
- `tester`
- `viewer`
- `contributor`

Legacy aliases are canonicalized during permission checks:

- `manager` -> `team_manager`
- `user` -> `tester`
- `member` -> `tester`

Permissions use `qc.*` keys. The Access Engine adds scoped access such as own/team/any visibility and row-action flags through `apps/api/src/services/access/enforcement.js`.

User statuses are used by route and scope checks:

- `PREPARATION`
- `ACTIVE`
- `SUSPENDED`
- `ARCHIVED`

## Tuleap Integration

Tuleap sync is based on four artifact types:

- `bug`
- `task`
- `user_story`
- `test_case`

Key concepts:

- **Tracker Config** rows live in `tuleap_sync_config` and map Tuleap trackers to QC projects, artifact types, field mappings, status mappings, and default visibility.
- **Inbound sync** is handled through `/tuleap-webhook/*`, usually mediated by n8n.
- **Outbound creation/update** goes through `/tuleap/artifacts/*` and uses the Tuleap base URL, access key, and tracker ids.
- Artifact links are stored on the QC side using QC UUIDs, with Tuleap integer ids resolved at the Tuleap boundary.

See `CONTEXT.md`, `docs/adr/`, and `docs/04-integrations/n8n-workflows.md` for deeper integration language and decisions.

## Deployment

### Production

Production uses pre-built Docker Hub images and Traefik labels. The API connects to Supabase PostgreSQL through `SUPABASE_DATABASE_URL`; the local `qc-postgres` volume is not the app database.

Prerequisites:

- External Docker network: `qc-shared-network`
- External Docker network: `qc-network`
- Traefik connected to `qc-shared-network`
- Docker Hub images: `<DOCKER_HUB_USERNAME>/qc-api:latest` and `<DOCKER_HUB_USERNAME>/qc-web:latest`
- `.env` created from `.env.production.example`

```bash
docker network create qc-shared-network
docker network create qc-network
cp .env.production.example .env
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
```

### Staging

Staging uses `docker-compose.staging.yml`, `:staging` image tags, a local staging PostgreSQL container, and a backup sidecar.

```bash
cp .env.staging.example .env.staging
docker compose -p qc-staging -f docker-compose.staging.yml --env-file .env.staging up -d
```

### GitHub Actions

`.github/workflows/deploy.yml` is manual-only (`workflow_dispatch`). Running the workflow builds API and web images, pushes them to Docker Hub, then deploys either staging or production over SSH.

Required GitHub secrets include Docker Hub credentials, VPS SSH credentials, domain values, app secrets, Supabase values, and Tuleap values used by the deploy script. The workflow currently uses:

- `DOCKER_HUB_USERNAME`, `DOCKER_HUB_TOKEN`
- `VPS_HOST`, `VPS_SSH_PORT`, `VPS_USERNAME`, `VPS_SSH_KEY`, `SSH_PASSPHRASE`
- `WEB_DOMAIN`, `API_DOMAIN`, `STAGING_WEB_DOMAIN`, `STAGING_API_DOMAIN`
- `JWT_SECRET`, `STAGING_JWT_SECRET`
- `POSTGRES_PASSWORD`, `STAGING_POSTGRES_PASSWORD`
- `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `N8N_WEBHOOK_URL`, `CORS_ORIGIN`, `STAGING_CORS_ORIGIN`
- `TULEAP_BASE_URL`, `TULEAP_ACCESS_KEY`

Production web images bake `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time. Changing those values requires rebuilding the web image.

## Documentation

- [Docs index](docs/README.md)
- [Domain language](CONTEXT.md)
- [Architecture docs](docs/02-architecture/)
- [Development guide](docs/03-guides/development-guide.md)
- [Deployment guide](docs/03-guides/deployment-guide.md)
- [n8n workflows](n8n/README.md)
- [Database migrations](database/migrations/README.md)
- [ADR index](docs/adr/README.md)
- [Web design system](apps/web/DESIGN_SYSTEM.md)
- [Web component guide](apps/web/COMPONENT_GUIDE.md)

## License

[MIT](LICENSE)
