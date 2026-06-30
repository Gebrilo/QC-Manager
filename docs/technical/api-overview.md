# API Overview

## Base URL

- **Production**: `https://api.gerbil.qc`
- **Local**: `http://localhost:3001`

## Route Mounting

All routes are accessible at both root and `/api` prefix:
- `/projects` ↔ `/api/projects`
- `/tasks` ↔ `/api/tasks`

## Authentication

Requests require a valid JWT or Supabase session token in the `Authorization: Bearer <token>` header.

**Public endpoints** (no auth required):
- `GET /health`
- `GET /api/public/landing-page`

## Route Groups

### Core Artifacts

| Prefix | Purpose | Key Operations |
|--------|---------|----------------|
| `/projects` | QC Project CRUD | List by scope, create, update, soft-delete |
| `/tasks` | Task management | CRUD with status flow validation, assignment |
| `/user-stories` | User story registry | CRUD, link to tasks |
| `/bugs` | Bug tracking | CRUD, severity, source classification |

### Test Management

| Prefix | Purpose | Key Operations |
|--------|---------|----------------|
| `/test-cases` | Test case registry | CRUD, categorize, link to tasks/stories |
| `/test-suites` | Test suite management | CRUD, organize test cases |
| `/test-executions` | Test run execution | Create runs, assign, record results |
| `/test-results` | Result upload and metrics | Upload XLSX/CSV, aggregate metrics |

### People & Teams

| Prefix | Purpose | Key Operations |
|--------|---------|----------------|
| `/resources` | Resource management | CRUD, capacity, utilization |
| `/teams` | Team management | CRUD, membership, project assignment |
| `/users` | User management | CRUD, role assignment, status management |
| `/roles` | Role and permission admin | Read catalog, manage permissions |
| `/admin/access` | Access Engine config | Manage role_permissions, user_permissions |

### Dashboards & Governance

| Prefix | Purpose | Key Operations |
|--------|---------|----------------|
| `/dashboard` | Global dashboard | Aggregate metrics |
| `/dashboards` | Role-specific dashboards | PM, team-manager, member views |
| `/reports` | Report generation | Trigger, download |
| `/governance` | Quality governance | Gates, approvals, readiness |

### Journeys & Personal Work

| Prefix | Purpose |
|--------|---------|
| `/journeys` | Onboarding/probation journey management |
| `/my-journeys` | Current user's active journeys |
| `/my-tasks` | Current user's assigned tasks |

### Cross-Cutting

| Prefix | Purpose |
|--------|---------|
| `/notifications` | In-app notification CRUD and preferences |
| `/search` | Global search across artifacts |
| `/attachments` | File upload and download for artifacts |

### Integrations

| Prefix | Purpose |
|--------|---------|
| `/tuleap-webhook` | Inbound Tuleap event intake (Unified Payload) |
| `/tuleap/artifacts` | Outbound artifact creation/update to Tuleap |
| `/testsprite` | TestSprite webhook for test results |

### Landing Page

| Prefix | Purpose |
|--------|---------|
| `/public/landing-page` | Public landing page content API |
| `/admin/landing-page` | Admin landing page configuration |
| `/webhooks/landing-content` | AI/n8n content intake webhooks |

### System

| Prefix | Purpose |
|--------|---------|
| `/health` | Health check endpoint |
| `/openapi.json` | OpenAPI specification (when available) |
| `/auth`, `/me` | User session, profile, avatar, preferences |

## Validation

All request bodies are validated with Zod schemas in `apps/api/src/schemas/`. Tuleap unified payloads undergo dual-schema validation (strict for ingest/create, `deepPartial` for update) per ADR 0007.

## Error Response Format

```json
{
  "error": "Human-readable error message",
  "details": ["Validation error detail 1", "Validation error detail 2"]
}
```

Common HTTP status codes: 200, 201, 400, 401, 403, 404, 500.
