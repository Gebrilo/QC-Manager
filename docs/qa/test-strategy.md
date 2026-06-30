# Test Strategy

## Testing Levels

| Level | Tool | Scope | Location |
|-------|------|-------|----------|
| Unit | Jest | API route handlers, services, middleware | `apps/api/tests/` |
| Integration | Jest + Supertest | API endpoints with real DB | `apps/api/tests/` |
| E2E | Playwright | Full browser flows | `apps/web/` (Playwright config) |
| Manual / Exploratory | Audit pack | Full-app UX sweep | `docs/05-qa/full-app-audit/` |

## Test Environments

| Environment | Purpose | Database |
|-------------|---------|----------|
| Local Docker | Dev testing | Local PostgreSQL container |
| Staging | Pre-production validation | Staging PostgreSQL |
| Production | Smoke tests only | Supabase cloud |

## Key Test Areas

### API Testing

- Route handler logic with mocked DB
- Zod schema validation (valid and invalid inputs)
- Auth middleware (JWT verification, role extraction)
- Access Engine permission resolution
- Tuleap persister/emitter logic

### Web E2E Testing

- Authentication flows (login, session expiry)
- RBAC route guarding (each role sees correct pages)
- Core CRUD operations (projects, tasks, bugs)
- Test execution workflow
- Dashboard data rendering

### Role-Based Testing

Systematically verify each role's permissions:
- Admin: full access, user management, RBAC config
- PM: project management, governance, dashboards
- Team Manager: resource views, IDPs, team dashboards
- Tester: test execution, bug reporting, personal tasks
- Viewer: read-only access across app
- Contributor: limited data entry in team scope

## Audit Process

The full-app audit pack defines a structured QA sweep:

1. **Setup**: Admin user, baseline data (see `audit-setup.md`)
2. **Per-Page Audit**: Every route tested against control inventory
3. **UX Heuristics**: Global UX checklist applied to every page
4. **Bug Reporting**: Standardized GitHub issue format with severity rubric
5. **Run Report**: Per-audit findings documented with evidence

## Test Execution Commands

```bash
# API tests
cd apps/api && npm test

# Web E2E tests
cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

# Full-app audit (manual/agent-driven)
# Follow docs/05-qa/full-app-audit/README.md
```

## Known Gaps

> [!WARNING]
> **Needs Validation:** The following gaps are identified from documentation and code review.

| Gap | Impact | Priority |
|-----|--------|----------|
| No frontend unit tests | UI regressions undetected | High |
| Limited E2E coverage | Real-user flows not automated | Medium |
| No performance testing | Load/scale risks unknown | Medium |
| No accessibility testing | WCAG compliance unknown | Low |
