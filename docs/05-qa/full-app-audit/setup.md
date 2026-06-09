# Setup — Full-App Audit

Read this before any audit run. Same setup applies whether the agent uses Playwright, raw API calls, or a human tester walks through manually.

## Environments

| Env | Web URL | API URL | When to use |
| --- | --- | --- | --- |
| Production | https://gebrils.cloud | https://api.gebrils.cloud | Quarterly full sweeps; spot-checks after a production deploy |
| Staging | https://staging.gebrils.cloud (if provisioned) | matching staging API | Pre-release validation |

**Current audit target:** Production (https://gebrils.cloud)

API health check (run before starting any audit):
```bash
curl -s https://api.gebrils.cloud/api/health
```
Expected: `{"status":"ok"}` or similar 200 body. **Note:** the health endpoint is `/api/health`, not `/health`.

## Admin test user

- **Email:** `wosog33787@aspensif.com`
- **Password:** `Password123!`
- **Role:** Admin (wildcard access `*` per `apps/shared/rbac/catalog.ts`)

## Contributor test user

- **Email:** `mamojoj825@5nek.com`
- **Password:** `QCTest2024!`
- **Role:** Contributor (read + limited mutations, no admin/manager access)

The contributor user is used for permission-boundary cross-check: any control visible to contributor that should be admin-only is a finding.

## Baseline data prerequisites

Before sweeping, confirm the target environment has enough data for the per-page scenarios to be meaningful.

| Entity | Minimum count | Notes |
| --- | --- | --- |
| Projects | 2 | At least one with active tasks and one with bugs |
| Tasks | 10 | Mixed status / priority / project |
| Bugs | 5 | Mixed `status` and `severity` |
| Test cases | 5 | Linked to at least one task |
| Test executions | 3 | Across different dates |
| Resources | 3 | At least one with owner assigned |

## Browser / Playwright configuration

- Default browser: Chromium (latest). Mobile breakpoint tests use viewport 375×812.
- Time zone: UTC for run reports.
- Disable browser auto-fill for forms; auto-fill can mask validation bugs.
- Capture console errors and failed network requests for the entire run.

## Test data isolation

Any data the agent creates during a run **must** use a recognisable prefix:

- Bugs / tasks / stories: title starts with `[AUDIT-2026-06-09]`
- Resources / users: name starts with `audit-`
- Files uploaded: filename starts with `audit-`

At end of run, the agent attempts to delete every record it created.

## Stop conditions

The audit agent must stop and surface for human review if:

- The login flow itself fails
- More than three consecutive pages return 5xx
- A finding looks security-sensitive (auth bypass, exposed PII, leaked secrets)
