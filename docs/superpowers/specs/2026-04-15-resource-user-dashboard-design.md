# Resource User Dashboard — Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Route:** `/my-dashboard`  
**Scope:** New personal dashboard for Resource users (non-admin, non-manager); does not replace the existing `/dashboard`.

---

## 1. Architecture Overview

The feature spans four layers:

```
Tuleap
  └─► n8n (tuleap-bug-sync workflow)
        └─► POST /tuleap-webhook/bug          ← add submitted_by_resource_id mapping
              └─► bugs table                  ← add submitted_by_resource_id column

Browser (Resource user)
  └─► GET /me/dashboard                       ← new endpoint, scoped to req.user
        ├─► resources WHERE user_id = me       (resolve resource ID)
        ├─► task_assignments WHERE resource    (tasks + hours variance)
        ├─► bugs WHERE submitted_by = me       (bugs submitted by this user)
        └─► aggregate per project              (tasks per project breakdown)

/my-dashboard (new Next.js route)
  └─► MyDashboardClient.tsx
        ├─► MyStatCards (tasks, projects, hours variance)
        ├─► TaskDistributionChart (by status)
        ├─► TasksByProjectTable
        └─► MyBugsTable (submitted bugs)
```

**Key constraints:**
- `GET /resources/:id/analytics` is untouched — admin/manager flow unchanged.
- `GET /me/dashboard` resolves resource ID server-side from `req.user.id` — no user-supplied ID, no IDOR risk.
- `submitted_by_resource_id` is populated at webhook ingestion time by n8n, same pattern as `owner_resource_id`.
- `/my-dashboard` is permission-gated by `page:my-dashboard`, added to defaults for `user`, `viewer`, and `contributor` roles.
- The route is opt-in — each role's default landing page is unchanged. Admins can configure it as default per role.

---

## 2. Data Model Changes

### 2a. `bug` table — new column

```sql
ALTER TABLE bug
  ADD COLUMN submitted_by_resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX idx_bug_submitted_by ON bug(submitted_by_resource_id) WHERE deleted_at IS NULL;
```

**Why not reuse `owner_resource_id`?**  
`owner_resource_id` was intended to track the reporter but its population in the n8n workflow is unreliable (UUID fix pending re-import). `submitted_by_resource_id` provides a clean, explicitly-named column with correct semantics — "who submitted this bug in Tuleap". Both columns coexist; `owner_resource_id` continues to serve existing admin views.

**Backfill:** Best-effort by email match against `resources.email` for existing bugs. New syncs populate the column correctly after n8n re-import. Historical gaps are acceptable since the dashboard is new.

### 2b. `user_permissions` — new permission key

No schema change needed. Add `page:my-dashboard` to `DEFAULT_PERMISSIONS` in `apps/api/src/routes/auth.js` for roles: `user`, `viewer`, `contributor`.

**Existing users:** `POST /auth/sync` re-seeds permissions on next login automatically. No manual migration required.

### Migration file

`database/migrations/XXX_resource_dashboard.sql`

---

## 3. Backend — `GET /me/dashboard`

**New file:** `apps/api/src/routes/me.js`  
**Registered at:** `/me` in `apps/api/src/index.js`

### Endpoint

```
GET /me/dashboard
Authorization: Bearer <token>
Permission: page:my-dashboard
```

### Response shape

```json
{
  "profile": {
    "resource_id": "uuid",
    "resource_name": "string",
    "department": "string"
  },
  "summary": {
    "total_tasks": 12,
    "total_projects": 3,
    "hours_variance": -2.5
  },
  "task_distribution": {
    "Backlog": 4,
    "In Progress": 5,
    "Done": 3
  },
  "tasks_by_project": [
    { "project_id": "uuid", "project_name": "CST", "total": 7, "done": 3, "in_progress": 2, "backlog": 2 }
  ],
  "submitted_bugs": [
    {
      "id": "uuid",
      "bug_id": "string",
      "title": "string",
      "status": "string",
      "severity": "string",
      "project_name": "string",
      "creation_date": "timestamp"
    }
  ]
}
```

### Resolution logic

```
1. Resolve resource: SELECT id FROM resources WHERE user_id = req.user.id AND deleted_at IS NULL
2. If no resource linked → 404 { error: 'No resource linked to your account' }
3. Query tasks: WHERE (resource1_id = resourceId OR resource2_id = resourceId)
4. Compute summary:
   - total_tasks: COUNT(tasks)
   - total_projects: COUNT(DISTINCT project_id)
   - hours_variance: SUM(actual_hrs) - SUM(estimate_hrs)
5. Aggregate task_distribution and tasks_by_project in application layer
6. Query bugs: WHERE submitted_by_resource_id = resourceId AND deleted_at IS NULL
   LIMIT 100 (pagination flag reserved for future)
```

### RBAC

- Middleware: `requireAuth` + `requirePermission('page:my-dashboard')`
- No `requireRole` — any role with the permission key can access their own dashboard
- Resource ID is always derived from `req.user.id` — never accepted as a query parameter

---

## 4. Frontend — `/my-dashboard`

### New files

```
apps/web/app/my-dashboard/
  ├── page.tsx                         ← route entry, auth gate, data fetch
  └── my-dashboard-client.tsx          ← client component, all widgets

apps/web/src/components/my-dashboard/
  ├── MyStatCards.tsx                  ← 3 stat cards
  ├── TaskDistributionChart.tsx        ← donut chart by status (Recharts)
  ├── TasksByProjectTable.tsx          ← project breakdown table
  └── MyBugsTable.tsx                  ← submitted bugs table
```

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Total Tasks    │  Total Projects  │  Hours Variance │  ← 3-col StatCard grid
├─────────────────┴──────────────────┴─────────────────┤
│  Task Distribution (donut)  │  Tasks by Project       │  ← 2-col row
├─────────────────────────────┴─────────────────────────┤
│  Submitted Bugs                                       │  ← full-width table
└───────────────────────────────────────────────────────┘
```

### Implementation notes

- Follows the existing dashboard card/grid design system (Tailwind, StatCard component patterns).
- **Hours Variance card:** positive = over budget (red), negative = under budget (green), zero = neutral — matches existing trend widget color convention.
- **Empty states:** Each widget renders a neutral empty state when data is absent. No crashes for new/unassigned users.
- **No "Create Project" or "Create Task" buttons** — this is a personal view only.
- **Route config (`routes.ts`):** Add entry with `permission: 'page:my-dashboard'`, `showInNavbar: true`, `navOrder` after `/my-tasks`.
- **No-resource guard:** If API returns 404 (no linked resource), show a banner: "Your account is not linked to a resource yet — contact your administrator."
- **Admin/Manager banner:** When an admin or manager visits `/my-dashboard`, show a soft info banner: "This is your personal view. For organisation analytics, visit Dashboard."

### Existing Bugs screen update

The existing `apps/web/app/bugs/` table view gets one new column: **Submitted By** — resolved as a resource name from `submitted_by_resource_id` via a JOIN in `GET /bugs/`. Non-breaking addition; shows "—" for NULL values.

---

## 5. n8n Workflow Changes

**Workflow file:** `n8n-workflows/tuleap-bug-sync.json`

### Tuleap submitter field

```json
{
  "artifact": {
    "submitted_by": {
      "id": 42,
      "username": "john.doe",
      "real_name": "John Doe",
      "email": "john.doe@company.com"
    }
  }
}
```

### n8n Code node change

In the node that builds the request body for `POST /tuleap-webhook/bug`, add:

```js
submitted_by_email: artifact.submitted_by?.email ?? null,
submitted_by_username: artifact.submitted_by?.username ?? null,
```

Resolution uses email (not Tuleap integer user ID) — same pattern used for reporter linking throughout the system.

### Webhook handler change (`tuleapWebhook.js`)

```js
let submittedByResourceId = null;
if (body.submitted_by_email) {
  const res = await db.query(
    `SELECT id FROM resources WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
    [body.submitted_by_email]
  );
  submittedByResourceId = res.rows[0]?.id ?? null;
}
// Include in INSERT/UPSERT:
// submitted_by_resource_id: submittedByResourceId
```

### Re-import also fixes UUID issue

This re-import is the right moment to activate the pending UUID fix (`linked_test_case_ids: []`). One re-import, two fixes. Re-import during a low-activity window; test with a single Tuleap webhook trigger before declaring live.

---

## 6. RBAC Design

| Permission Key | Roles (default) | Effect |
|---|---|---|
| `page:my-dashboard` | `user`, `viewer`, `contributor`, `admin`, `manager` | Grants access to `/my-dashboard` route |
| `action:tasks:edit` | `user`, `admin`, `manager` | Shows edit controls in task table (resource dashboard respects this) |
| `action:tasks:create` | Hidden on `/my-dashboard` | "Create Task" button never shown on personal dashboard |
| `action:projects:create` | Hidden on `/my-dashboard` | "Create Project" button never shown on personal dashboard |

**Enforcement layers:**
1. **API:** `requirePermission('page:my-dashboard')` on `GET /me/dashboard`
2. **Frontend route config:** `permission: 'page:my-dashboard'` in `routes.ts`
3. **RouteGuard:** Redirects to `/my-tasks` if permission absent
4. **UI:** `hasPermission('action:tasks:edit')` controls edit button visibility in task table

---

## 7. QA Test Plan

### Role-based visibility

| Scenario | Expected |
|---|---|
| `user` role visits `/my-dashboard` | Dashboard renders with their data |
| `viewer` role visits `/my-dashboard` | Dashboard renders, no edit controls |
| `contributor` role visits `/my-dashboard` | Dashboard renders |
| `admin` or `manager` visits `/my-dashboard` | Dashboard renders, info banner shown pointing to org Dashboard |
| User without `page:my-dashboard` permission | Redirected to `/my-tasks` |
| Unauthenticated user visits `/my-dashboard` | Redirected to login |

### Data accuracy

| Scenario | Expected |
|---|---|
| User has 5 tasks across 2 projects | Total Tasks = 5, Total Projects = 2 |
| `SUM(actual_hrs)=10`, `SUM(estimate_hrs)=12` | Hours Variance = −2 (green) |
| `SUM(actual_hrs)=14`, `SUM(estimate_hrs)=12` | Hours Variance = +2 (red) |
| User has tasks in all three statuses | Task Distribution chart reflects correct counts |
| User submitted 3 bugs across 2 projects | Submitted Bugs table shows 3 rows |
| Bug submitted by a different user | Does NOT appear in logged-in user's dashboard |

### Permission-based editing

| Scenario | Expected |
|---|---|
| `viewer` role views task table | No edit controls |
| `action:tasks:edit` absent | Edit button hidden |
| Any role on `/my-dashboard` | No "Create Project" or "Create Task" buttons |

### Bug sync correctness

| Scenario | Expected |
|---|---|
| Tuleap bug submitted by user with matching email | `submitted_by_resource_id` populated |
| Tuleap bug submitted by unknown email | `submitted_by_resource_id` = NULL, bug still syncs |
| Bug appears only in submitter's dashboard | Confirmed — strict resource ID filter |
| Existing bugs page | "Submitted By" column shows name or "—" for NULL |

### Edge cases

| Scenario | Expected |
|---|---|
| User not linked to any resource | 404 from API; frontend shows "contact your administrator" message |
| User has no tasks assigned | All stat cards = 0, empty states shown, no crash |
| User assigned to 10+ projects | `tasks_by_project` renders all rows, table scrolls |
| Resource deactivated mid-session | Next API call returns 404, frontend redirects to `/my-tasks` |
| `page:my-dashboard` revoked mid-session | Next navigation check redirects to `/my-tasks` |
| `submitted_by_resource_id` is NULL on a bug | Bug excluded from dashboard; Bugs screen shows "—" |

---

## 8. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User account not linked to a resource | Medium | High — dashboard unusable | Clear 404 + frontend message; admin uses `POST /resources/auto-map` to batch-link by email |
| `submitted_by_resource_id` NULL for existing bugs | High | Low — historical data gap acceptable | Backfill script (best-effort by email); new syncs populate correctly after re-import |
| n8n re-import breaks active bug sync | Medium | High | Re-import during low-activity window; test with single Tuleap webhook trigger |
| Tuleap `submitted_by` field absent or malformed | Low | Medium | Null-safe access (`?.email ?? null`); bug still ingests, column stays NULL |
| Performance on large datasets | Low now | Medium | All queries use indexed columns; `LIMIT 100` on submitted bugs with pagination reserved |
| `page:my-dashboard` not seeded for existing users | High | Medium | `POST /auth/sync` re-seeds on next login automatically |
| Admin confusion visiting personal view | Low | Low | Info banner: "This is your personal view. For organisation analytics, visit Dashboard." |
