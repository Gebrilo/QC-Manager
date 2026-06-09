# Audit Run — 2026-06-09 (production)

## Environment

- URL: https://gebrils.cloud
- Test users: `wosog33787@aspensif.com` (Admin), `mamojoj825@5nek.com` (Contributor)
- Browser: Chromium (Browserbase)
- Started: 2026-06-09T15:30:00Z
- Finished: 2026-06-09T15:50:00Z
- Run mode: browser automation (Hermes Agent)

## Coverage

| Page | Route | Status | Findings |
| --- | --- | --- | --- |
| Login | `/login` | pass | 0 |
| My Tasks (admin) | `/me/tasks` | pass | 0 |
| Projects | `/work/projects` | pass | 0 |
| Tasks | `/work/tasks` | pass | 0 |
| Bugs | `/work/bugs` | pass | 0 |
| Test Cases | `/test/cases` | pass | 0 |
| Test Runs | `/test/runs` | findings | 1 (no run history table) |
| Governance | `/quality/governance` | pass | 0 |
| Reports | `/quality/reports` | pass | 0 |
| Admin Users | `/admin/users` | pass | 0 |
| Admin Roles | `/admin/roles` | findings | 1 (empty subtitle) |
| Permissions Matrix | `/admin/permissions/matrix` | pass | 0 |
| Contributor My Dashboard | `/me/dashboard` | pass | 0 |
| Contributor My Tasks | `/me/tasks` | pass | 0 |
| Contributor My Journeys | `/me/journeys` | pass | 0 |
| Contributor restricted: /work/tasks | `/work/tasks` | pass | 0 |
| Contributor restricted: /admin/users | `/admin/users` | pass | 0 |
| Contributor restricted: /quality/reports | `/quality/reports` | pass | 0 |

## Admin Sweep Results

### Passes (27 sidebar routes, all major sections verified)
- **My Work**: My Dashboard, Member Dashboard, My Tasks, My Journeys, My Development Plan, Plan History — all load
- **Quality**: Projects (3 projects), Stories, Tasks (24 tasks, table/board view), Bugs (39 bugs, summary cards OK), Cases (120 cases, 95 active), Suites, Test Runs, Results, Governance, Reports (8 types, Generate/Export visible)
- **Manage**: Team Dashboard, Resources, Development Plans, Team Journeys, Task History
- **Admin**: Users (4 users), Teams, Journey Templates, Roles (9 roles), Permissions Matrix (9 roles × 18 actions), Tuleap

### Known issues confirmed (not re-filed)
1. **Roles page empty subtitle**: `<p>` under "Role Management" heading renders empty — known
2. **Test Runs no run history table**: Only upload form visible; "Run History" button exists but no past runs table — known missing feature
3. **Governance empty trend chart**: "No test executions in the last 30 days" — not a bug, just no test data on production
4. **Dark/light mode toggle**: Shows "Switch to light mode" even when already in light mode — filed as #180

### No console errors
All visited admin pages had zero JavaScript errors in console.

### Data baseline
| Entity | Count | Status |
| --- | --- | --- |
| Projects | 3 | ✓ (CST, FRA, PPO) |
| Tasks | 24 | ✓ (mixed status) |
| Bugs | 39 | ✓ (16 open, 23 closed) |
| Test Cases | 120 | ✓ (95 active) |
| Reports | 8 types | ✓ |

## Contributor Sweep Results

### Passes (permission boundaries verified)
| Route | Expected | Actual | Status |
| --- | --- | --- | --- |
| `/work/tasks` | Block | Redirect to My Tasks | ✓ |
| `/admin/users` | Block | Redirect to My Tasks | ✓ |
| `/quality/reports` | Block | Redirect to My Tasks | ✓ |

### Sidebar
- Only "My Work" visible (My Dashboard, My Tasks, My Journeys)
- No Quality, Manage, or Admin sections
- Correct for PREPARATION status (Contributor role)

### Allowed pages
- My Dashboard: GET STARTED state (correct for PREPARATION)
- My Tasks: loads with personal task board
- My Journeys: "No Journeys Assigned" empty state

### No console errors

## Findings filed

None new — all issues observed are either:
- Known and already filed (#180 dark mode toggle)
- Expected behavior (empty trend charts, no run history)
- Correct permission boundaries

## Cleanup gaps

None — no test data created during this audit.

## Notes — needs human eyes

1. **Contributor sidebar is sparse**: Only 3 items under My Work. The Contributor role spec says sidebar should show "My Dashboard, My Tasks, My Journeys" which matches. No Quality section visible means no RBAC quality routes are accessible — this is correct for PREPARATION status.

2. **Test Runs page needs run history**: Currently only an upload form. The "Run History" button likely toggles a view but past runs don't appear — this is a missing feature, not a regression.

3. **Governance charts need test data**: All governance metrics show zeros because no test executions exist. This is a data issue, not an app issue. To make governance meaningful, upload test results first.

4. **Admin account isn't assigned to a team**: Team-scoped pages (Team Dashboard, Development Plans, Team Journeys) may show empty states because admin has no team. Team Manager deep test needs a team-assigned account.
