# QC-Manager Documentation Index

Complete documentation for the QC-Manager quality operations and governance platform.

## Reader Paths

### For Business Analysts

1. [Product Overview](docs/business/product-overview.md) — What the product does and why
2. [Business Workflows](docs/business/business-workflows.md) — Core user journeys
3. [Glossary](docs/business/glossary.md) — Domain language and terminology
4. [Stakeholders and Users](docs/business/stakeholders-and-users.md) — Roles and responsibilities

### For Software Engineers

1. [Architecture Overview](docs/technical/architecture-overview.md) — System design and components
2. [System Components](docs/technical/system-components.md) — Subsystem details
3. [API Overview](docs/technical/api-overview.md) — REST API surface
4. [Database Overview](docs/technical/database-overview.md) — Schema and data model
5. [Local Setup](docs/operations/local-setup.md) — Development environment

### For QA Engineers

1. [Feature Documentation](docs/features/) — Per-feature behavior and acceptance criteria
2. [Acceptance Criteria](docs/qa/acceptance-criteria.md) — Feature acceptance standards
3. [E2E Scenarios](docs/qa/e2e-scenarios.md) — End-to-end test scenarios
4. [Regression Scope](docs/qa/regression-scope.md) — Regression test coverage
5. [Role Scenarios](docs/qa/role-scenarios-overview.md) — RBAC-per-role test scenarios

### For DevOps / SRE

1. [Deployment](docs/operations/deployment.md) — Production and staging deployment
2. [Environment Variables](docs/operations/environment-variables.md) — Complete env reference
3. [Monitoring](docs/operations/monitoring.md) — Observability and health checks
4. [Troubleshooting](docs/operations/troubleshooting.md) — Common issues and resolutions
5. [Backup and Restore](docs/operations/backup-and-restore.md) — Data protection procedures

### For Security Reviewers

1. [Authentication](docs/security/authentication.md) — Auth flow and Supabase integration
2. [Authorization / RBAC](docs/security/authorization-rbac.md) — Role-based access control
3. [Secret Management](docs/security/secret-management.md) — Credential and key handling
4. [Audit Logging](docs/security/audit-logging.md) — Audit trail design
5. [Security Review Checklist](docs/security/security-review-checklist.md) — Security assessment checklist

## Documentation Structure

```text
README.md                    — Project overview (start here)
DOCUMENTATION_INDEX.md       — This file

docs/
├── README.md                — Documentation hub and conventions
├── business/                — Product, users, workflows, glossary
├── technical/               — Architecture, API, database, integrations
├── features/                — Per-feature documentation with acceptance criteria
├── qa/                      — Test strategy, E2E, acceptance criteria, role scenarios
├── operations/              — Setup, deployment, monitoring, troubleshooting
├── security/                — Auth, RBAC, secrets, audit, data protection
├── internal/                — ADRs, plans, inventory, validation
└── archive/                 — Deprecated and obsolete documentation
```

## Quick Links

| Topic | Link |
|-------|------|
| Domain language | [docs/technical/domain-language.md](docs/technical/domain-language.md) |
| Architecture decisions | [docs/internal/adr/README.md](docs/internal/adr/README.md) |
| Database schema | [docs/technical/database-overview.md](docs/technical/database-overview.md) |
| API endpoints | [docs/technical/api-overview.md](docs/technical/api-overview.md) |
| Deployment guide | [docs/operations/deployment.md](docs/operations/deployment.md) |
| RBAC model | [docs/security/authorization-rbac.md](docs/security/authorization-rbac.md) |
| Tuleap integration | [docs/features/tuleap-integration.md](docs/features/tuleap-integration.md) |
| Test strategy | [docs/qa/test-strategy.md](docs/qa/test-strategy.md) |
| Open questions | [docs/internal/open-questions.md](docs/internal/open-questions.md) |
| Documentation inventory | [docs/internal/documentation-inventory.md](docs/internal/documentation-inventory.md) |
