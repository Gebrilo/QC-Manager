# Regression Scope

## Definition

Regression testing ensures that changes do not break existing functionality. This document defines what must be tested on each release cycle.

## Critical Path (Must Test Every Release)

| Area | Scope | Priority |
|------|-------|----------|
| Authentication | Login, logout, session expiry, role assignment | Critical |
| RBAC | Each role sees correct pages and can perform allowed actions | Critical |
| Project CRUD | Create, read, update, soft-delete projects | Critical |
| Task CRUD | Create, assign, status flow, soft-delete tasks | High |
| Bug CRUD | Create, classify, link, close bugs | High |
| Test Execution | Create run, execute, record results, upload | High |
| Dashboards | Global, PM, team-manager, member dashboards load | High |
| API Health | `/health` returns 200 | Critical |

## High Priority (Test When Affected Area Changes)

| Area | Scope |
|------|-------|
| Tuleap Sync | Inbound webhook, outbound creation, Tracker Config |
| n8n Workflows | Report generation, webhook mediation |
| IDP / Journeys | Onboarding journey creation, task linking |
| Notifications | In-app notification creation, delivery |
| Landing Page | Public and admin landing page content |
| Audit Log | Before/after state capture, log viewing |
| File Uploads | Attachment upload, avatar upload |

## Medium Priority (Test Periodically)

| Area | Scope |
|------|-------|
| Resource Dashboard | Utilization metrics, workload views |
| Quality Gates | Threshold configuration, evaluation |
| Reports | Generation, download |
| Preferences | User preferences, display density, landing page |
| Search | Global search results |

## Regression Test Execution

### Automated

```bash
# API regression suite
cd apps/api && npm test

# Web E2E regression
cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

### Manual Audit

For each release:
1. Run the full-app audit pack (see `docs/05-qa/full-app-audit/`)
2. Execute role scenario tests for each role
3. Verify critical path items in a staging environment

## Known Regression Risks

| Risk | Mitigation |
|------|------------|
| RBAC changes can silently break permissions | Run role scenario tests for all 6 roles |
| Migration-on-startup can fail silently | Check API logs for "migrations completed" |
| Build-time env vars stale after config changes | Rebuild web image after env changes |
| Tuleap API changes can break sync | Monitor `tuleap_webhook_log` for errors |
