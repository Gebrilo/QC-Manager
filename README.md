# QC Management Tool

A comprehensive Quality Control Project Management System for tracking projects, managing tasks and resources, running test cycles, enforcing governance, and coordinating teams — powered by **Supabase** and deployed with **Docker + Traefik**.

## Features

- **Dashboard** — Real-time aggregated metrics across projects, tasks, resources, testing, and governance
- **Project Management** — Full CRUD with soft delete and status lifecycle (active, completed, on_hold, cancelled)
- **Task Management** — Status workflow (Backlog → In Progress → Done/Cancelled) with resource allocation and hour tracking
- **Resource Management** — Capacity planning, allocation tracking, utilization metrics with overallocation warnings
- **Test Management** — Test cases, test runs, test executions, and results tracking with pass/fail metrics
- **Governance** — Quality gates, release approvals, trend analysis, and release readiness evaluation
- **Reports** — Async report generation (Excel, CSV, JSON, PDF) via n8n workflows
- **User Management** — Role-based access (admin, manager, user, viewer, contributor) with JWT authentication
- **Teams** — Team-based access control with manager hierarchy and team assignments
- **Journeys** — User onboarding journeys, manager views, and probation tracking
- **Personal Tasks** — Individual task management per user
- **Bug Tracking** — Tuleap-integrated bug management with severity/priority tracking
- **Notifications** — In-app notification system
- **Preferences** — Per-user UI settings and display name customization

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript 5.9, Tailwind CSS, TanStack Table, Recharts, React Hook Form, Radix UI |
| Backend | Node.js 18, Express 4.18, Zod, JWT, Multer, pg |
| Database | **Supabase** (cloud-hosted PostgreSQL) with database views for real-time metrics |
| Auth | JWT-based authentication with role-based access control |
| Automation | n8n 1.29.0 for async report generation and workflows |
| Reverse Proxy | Traefik (production) with Let's Encrypt TLS |
| Containers | Docker & Docker Compose |
| CI/CD | GitHub Actions → Docker Hub → VPS auto-deploy |

## Quick Start

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- A [Supabase](https://supabase.com/) project (free tier works)

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# 2. Create environment file
cp .env.example .env
# Edit .env — set your Supabase DATABASE_URL, SUPABASE_URL, and keys

# 3. Start API
cd apps/api && npm install && npm run dev

# 4. Start Frontend (separate terminal)
cd apps/web && npm install && npm run dev
```

**Access the app:**
- Frontend: http://localhost:3000
- API: http://localhost:3001

### Docker Development

```bash
# 1. Create shared network (one-time)
docker network create qc-shared-network

# 2. Set up environment
cp .env.example .env
# Edit .env with your Supabase credentials

# 3. Start all services
docker compose up -d

# 4. View logs
docker compose logs -f
```

## Project Structure

```
├── apps/
│   ├── api/                  # Express.js Backend API
│   │   ├── src/
│   │   │   ├── routes/       # 21 route files
│   │   │   ├── schemas/      # Zod validation schemas
│   │   │   ├── middleware/   # Error handling, audit logging
│   │   │   ├── config/       # Database connection (Supabase)
│   │   │   └── utils/        # n8n integration, helpers
│   │   ├── __tests__/        # Jest unit tests
│   │   └── Dockerfile
│   └── web/                  # Next.js Frontend
│       ├── app/              # App Router (18 page routes)
│       └── src/
│           ├── components/   # React components
│           ├── lib/          # API client, utilities
│           └── types/        # TypeScript interfaces
├── database/
│   └── migrations/           # Reference SQL migration files
├── n8n/                      # n8n workflow definitions
├── docs/                     # Architecture & guide documentation
├── scripts/                  # Test utilities
├── specs/                    # Feature specifications (SpecKit)
├── docker-compose.yml        # Local development
└── docker-compose.prod.yml   # Production (Traefik + Supabase)
```

## API Endpoints

| Category | Routes | Key Operations |
|----------|--------|----------------|
| Auth | `auth.js` | Login, register, token refresh, password management |
| Projects | `projects.js` | CRUD, soft delete, status lifecycle |
| Tasks | `tasks.js` | CRUD, status transitions, resource assignment, hour tracking |
| Resources | `resources.js` | CRUD, utilization metrics, allocation warnings |
| Test Cases | `testCases.js` | CRUD, bulk import |
| Test Executions | `testExecutions.js` | Test runs, executions, results management |
| Test Results | `testResults.js` | Results upload & metrics |
| Dashboard | `dashboard.js` | Aggregated metrics |
| Reports | `reports.js` | Async report generation via n8n |
| Governance | `governance.js` | Quality gates, release approvals, trend analysis |
| Users | `users.js` | User management, activation, role updates |
| Teams | `teams.js` | Team CRUD, member management |
| Roles | `roles.js` | Role-based permission management |
| Bugs | `bugs.js` | Bug tracking (Tuleap integration) |
| Journeys | `journeys.js` | User onboarding journeys |
| My Journeys | `myJourneys.js` | Personal journey progress |
| Manager View | `managerView.js` | Team oversight for managers |
| Personal Tasks | `personalTasks.js` | Individual task management |
| Notifications | `notifications.js` | In-app notifications |
| Tuleap Webhook | `tuleapWebhook.js` | Tuleap artifact sync |
| Preferences | via `users.js` | Per-user UI settings |

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | Secret for JWT token signing (min 32 chars) |
| `NEXT_PUBLIC_API_URL` | API URL for the frontend |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `N8N_WEBHOOK_URL` | n8n webhook endpoint | — |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `DATABASE_SSL` | Set to `false` to disable SSL | `true` |

See `.env.example` for a complete template.

## Production Deployment

Production uses **Traefik** as a reverse proxy with automatic TLS via Let's Encrypt, and connects to **Supabase** for the database.

```bash
# 1. Set up environment
cp .env.production.example .env
# Edit .env with production values

# 2. Create network
docker network create qc-shared-network

# 3. Deploy
docker compose -f docker-compose.prod.yml up -d
```

CI/CD is configured via GitHub Actions — pushing to `main` triggers automatic build, push to Docker Hub, and deploy to VPS.

## Documentation

- [Database Migrations](database/migrations/README.md)
- [n8n Workflows](n8n/README.md)
- [Architecture Docs](docs/)
- [Style Guide](style.md)

## License

[MIT](LICENSE)
