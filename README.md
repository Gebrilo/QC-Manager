# QC Management Tool

A comprehensive Quality Control Project Management System designed to streamline project tracking, resource allocation, test case management, and governance.

## Features

- **Dashboard**: Real-time metrics with task completion, resource utilization, project health
- **Project Management**: Full CRUD with soft delete, status tracking, timeline management
- **Task Management**: Kanban-style workflow (Backlog → In Progress → Done/Cancelled)
- **Resource Management**: Capacity planning, allocation tracking, utilization metrics
- **Test Management**: Test cases, executions, results tracking with pass/fail metrics
- **Governance**: Quality gates, release readiness, trend analysis
- **Reports**: Async report generation (Excel, CSV, JSON, PDF) via n8n
- **Automation**: n8n integration for workflows and notifications

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, TanStack Table |
| Backend | Node.js 18, Express.js, Zod validation |
| Database | PostgreSQL 15 with views for real-time metrics |
| Automation | n8n for async operations |
| Container | Docker & Docker Compose |

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/Gebrilo/QC-Manager.git
cd QC-Manager

# 2. Create environment file
cp .env.example .env
# Edit .env with your settings

# 3. Start all services
docker-compose up -d

# 4. Access applications
# Frontend: http://localhost:3000
# API: http://localhost:3001
# n8n: http://localhost:5678 (admin/admin)
```

## Project Structure

```
├── apps/
│   ├── api/                 # Express.js Backend API
│   │   └── src/
│   │       ├── routes/      # API endpoints (10 route files)
│   │       ├── schemas/     # Zod validation schemas
│   │       ├── middleware/  # Error handling, audit logging
│   │       └── utils/       # n8n integration, helpers
│   └── web/                 # Next.js Frontend
│       ├── app/             # App Router pages (18 routes)
│       └── src/
│           ├── components/  # React components
│           ├── lib/         # API client, utilities
│           └── types/       # TypeScript interfaces
├── database/
│   ├── schema.sql           # Base database schema
│   └── migrations/          # Incremental migrations
├── n8n/                     # n8n workflow definitions
├── nginx/                   # Reverse proxy config
├── docs/                    # Documentation
│   ├── 01-requirements/
│   ├── 02-architecture/
│   ├── 03-guides/           # Deployment guide
│   └── 04-integrations/
├── docker-compose.yml       # Development setup
└── docker-compose.prod.yml  # Production setup
```

## API Endpoints

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Projects | 5 | CRUD + soft delete |
| Tasks | 5 | CRUD + status validation |
| Resources | 5 | CRUD + utilization metrics |
| Test Cases | 6 | CRUD + bulk import |
| Test Executions | 8 | Test runs management |
| Test Results | 7 | Results upload & metrics |
| Dashboard | 2 | Aggregated metrics |
| Reports | 2 | Async generation |
| Governance | 13 | Quality gates & analysis |

## Development

```bash
# Start only database
docker-compose up -d postgres

# Run API locally
cd apps/api && npm install && npm run dev

# Run frontend locally
cd apps/web && npm install && npm run dev
```

## Production Deployment

See [Deployment Guide](docs/03-guides/DEPLOYMENT.md) for complete instructions.

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

## Documentation

- [Deployment Guide](docs/03-guides/DEPLOYMENT.md)
- [n8n Integration](n8n/README.md)
- [Database Migrations](database/migrations/README.md)

## License

[MIT](LICENSE)
