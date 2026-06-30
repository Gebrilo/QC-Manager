# System Components

## API (`apps/api/`)

Express.js REST API serving as the backend for all QC-Manager functionality.

### Tech: Node.js 18, Express 4, Zod, JWT, pg, Multer, xlsx

### Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| DB | `src/config/db.js` | PostgreSQL pool via `pg`, startup migrations |
| Auth Middleware | `src/middleware/authMiddleware.js` | JWT + Supabase token verification, role extraction |
| RBAC Access Engine | `src/services/access/` | Matrix-based authorization resolver |
| Tuleap Persisters | `src/services/persisters/` | Inbound artifact processing (ADR 0002) |
| Tuleap Emitters | `src/services/emitters/` | Outbound artifact creation (ADR 0004) |
| Value Normalizer | `src/services/tuleapValueNormalizer.js` | Tuleap field resolution (ADR 0003) |
| n8n Client | `src/utils/n8n.js` | Webhook calls to n8n engine |
| Zod Schemas | `src/schemas/` | Request/response validation |

### Route Mounting

Routes are mounted at both root (`/projects`) and `/api` prefix (`/api/projects`) for compatibility.

```
/auth, /auth/profile, /me            → Current user, profile, preferences
/projects, /user-stories, /tasks, /bugs → Core artifacts
/resources, /teams, /manager           → Resource and team management
/test-cases, /test-suites, /test-executions, /test-results → Test management
/dashboard, /dashboards, /reports, /governance → Metrics and governance
/roles, /admin/access, /users          → RBAC and user management
/journeys, /my-journeys, /my-tasks    → Onboarding and personal work
/notifications, /search, /attachments  → Cross-cutting features
/tuleap-webhook, /tuleap/artifacts     → Tuleap integration
/testsprite                            → TestSprite webhook
/public/landing-page, /admin/landing-page → Landing page
/health, /openapi.json                 → Health and OpenAPI
```

## Web Frontend (`apps/web/`)

Next.js 14 App Router frontend with TypeScript and Tailwind CSS.

### Tech: Next.js 14, React 18, TypeScript, Tailwind CSS, Radix UI, TanStack Table, Recharts, React Hook Form

### Key Features

- **18 App Router pages** covering all feature areas
- **Shared component library** in `src/components/ui/` and domain-specific folders
- **API client** in `src/lib/api.ts` for backend communication
- **Route guards** in `src/config/routes.ts` and `RouteGuard.tsx`
- **Auth provider** with Supabase session management in `AuthProvider.tsx`
- **Design system** documented in `DESIGN_SYSTEM.md` and `COMPONENT_GUIDE.md`
- **Dark mode support** via Tailwind `class` strategy

## Shared RBAC (`apps/shared/`)

Cross-app RBAC catalog shared between API and web.

| File | Purpose |
|------|---------|
| `rbac/catalog.ts` | Role definitions, permission keys (`qc.*`), default grants |
| Types | Permission enums, role type definitions |

## n8n (`n8n/`)

Workflow automation engine for scheduled reports, webhook mediation, and AI content intake.

### Key Workflows

- Tuleap webhook intake (receives Tuleap events → transforms → forwards to API)
- Scheduled report generation
- Landing page content generation (AI chained workflows)
- Database cleanup and maintenance

## Database (`database/migrations/`)

Reference SQL migration files. Actual migrations run via `apps/api/src/config/db.js` on API startup.

> [!IMPORTANT]
> `db.js` `runMigrations()` is the authoritative migration path. SQL files in `database/migrations/` are reference copies — the running API executes migrations embedded in `db.js`.
