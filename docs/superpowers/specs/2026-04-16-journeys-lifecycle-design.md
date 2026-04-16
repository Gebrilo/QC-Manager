---
title: User Lifecycle State Machine — Journeys Redesign
date: 2026-04-16
status: approved
---

# User Lifecycle State Machine

## Overview

Redesign the Journeys feature from a boolean-based activation system into a proper lifecycle state machine. Users transition through defined statuses that control access permissions, UI labels, dashboard visibility, and manager actions. The single source of truth is `app_user.status`.

## Goals

- Replace dual boolean flags (`activated`, `probation_completed`) with a status ENUM
- Enforce access control at the API level, not just the frontend
- Give managers a clear "Activate Resource" workflow with prerequisites
- Keep the Journeys system intact — reuse it with dynamic labels per status
- Design for forward compatibility with a future `team_memberships` table

## Out of Scope (this iteration)

- SUSPENDED and ARCHIVED trigger logic and UI (ENUM values and middleware scaffolded only)
- Multi-team membership
- Email notifications on activation (notification record created, email deferred)

---

## Status ENUM

```
PREPARATION → ACTIVE → (SUSPENDED) → (ARCHIVED)
                ↑____________|  (admin rollback only)
```

| Status | Meaning | Access |
|---|---|---|
| `PREPARATION` | User is onboarding | Tasks + Journeys only |
| `ACTIVE` | Full resource | All features |
| `SUSPENDED` | Temporarily restricted | Scaffolded — future |
| `ARCHIVED` | End of engagement | Scaffolded — future |

---

## Database Schema

### Migration 020 — `app_user` additions

```sql
ALTER TABLE app_user
  ADD COLUMN status TEXT NOT NULL DEFAULT 'PREPARATION'
    CHECK (status IN ('PREPARATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  ADD COLUMN team_membership_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ready_for_activation BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing data
UPDATE app_user SET
  status               = CASE WHEN activated = true THEN 'ACTIVE' ELSE 'PREPARATION' END,
  team_membership_active = COALESCE(activated, false),
  ready_for_activation   = COALESCE(probation_completed, false);

CREATE INDEX idx_app_user_status ON app_user(status);
CREATE INDEX idx_app_user_team_membership_active ON app_user(team_membership_active);
```

### Migration 021 — drop deprecated columns

```sql
ALTER TABLE app_user
  DROP COLUMN IF EXISTS activated,
  DROP COLUMN IF EXISTS probation_completed;
```

Run migration 021 only after verifying migration 020 data in production.

### New columns

| Column | Type | Purpose |
|---|---|---|
| `status` | `TEXT CHECK` | Single source of truth for lifecycle stage |
| `team_membership_active` | `BOOLEAN` | Set true on activation. Forward-compatible `is_active` for future `team_memberships` table |
| `ready_for_activation` | `BOOLEAN` | Manager-set gate (renamed from `probation_completed`). "Activate Resource" button disabled until true |

### Future B→A migration (team_memberships table)

When multi-team support is needed:

```sql
CREATE TABLE team_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_memberships (user_id, team_id, is_active)
SELECT id, team_id, team_membership_active
FROM app_user WHERE team_id IS NOT NULL;
```

Then update helper functions in `teamAccess.js` only — routes do not change.

---

## Backend Architecture

### Lifecycle Service

New file: `apps/api/src/services/userLifecycle.js`

All state transitions run as atomic DB transactions. No partial activation is possible.

#### `activateUser(userId, actorId, options)`

Prerequisites (validated before transaction):
- `app_user.status = 'PREPARATION'`
- `app_user.team_id IS NOT NULL`
- `app_user.ready_for_activation = true`
- No existing active `resources` record for this user

Transaction (all-or-nothing):
1. `UPDATE app_user SET status='ACTIVE', team_membership_active=true WHERE id=$userId`
2. `INSERT INTO resources (...) ON CONFLICT (user_id) WHERE deleted_at IS NULL DO UPDATE SET is_active=true`
3. `INSERT INTO notifications (user_id, type='LIFECYCLE_ACTIVATED', ...)`

#### `rollbackUser(userId, actorId)`

Prerequisites:
- `app_user.status = 'ACTIVE'`
- Actor has role `admin`

Transaction:
1. `UPDATE app_user SET status='PREPARATION', team_membership_active=false WHERE id=$userId`
2. `UPDATE resources SET is_active=false WHERE user_id=$userId AND deleted_at IS NULL`

#### `markReadyForActivation(userId, actorId, ready)`

Prerequisites:
- `app_user.status = 'PREPARATION'`
- Actor manages this user (`manager_id = actorId`) or is admin

Operation:
- `UPDATE app_user SET ready_for_activation=$ready WHERE id=$userId`

#### Future stubs (no-op bodies, signatures defined)

```js
async function suspendUser(userId, actorId, reason) { /* TODO */ }
async function archiveUser(userId, actorId) { /* TODO */ }
```

---

## API Endpoints

### New endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| `PATCH` | `/manager/team/:userId/ready-for-activation` | `action:journeys:view_team_progress` | Set `ready_for_activation` flag (replaces `/probation`) |
| `POST` | `/manager/team/:userId/activate` | `action:journeys:view_team_progress` | Activate user (calls `activateUser()`) |
| `POST` | `/users/:userId/rollback` | role `admin` | Rollback to PREPARATION (calls `rollbackUser()`) |

### Updated `requireAuth` middleware

```js
// apps/api/src/middleware/authMiddleware.js
// Change SELECT to include status and team_membership_active, remove activated
SELECT id, email, name, role, active, status, team_membership_active
FROM app_user WHERE supabase_id = $1
```

`req.user` gains `status` and `team_membership_active`; `activated` is removed.

### New `requireStatus` middleware

```js
// Added to authMiddleware.js — exported alongside requireAuth, requireRole
function requireStatus(...statuses) {
  return (req, res, next) => {
    if (!statuses.includes(req.user.status)) {
      return res.status(403).json({
        error: 'Access restricted based on your account status.',
        required: statuses,
        current: req.user.status,
      });
    }
    next();
  };
}
```

### Route-level access control changes

```js
// Resources routes — ACTIVE only
router.get('/',    requireAuth, requireStatus('ACTIVE'), ...)
router.get('/:id', requireAuth, requireStatus('ACTIVE'), ...)

// Projects routes — ACTIVE only
router.get('/',    requireAuth, requireStatus('ACTIVE'), ...)

// Journeys (my journeys) — both stages
router.get('/my',  requireAuth, requireStatus('PREPARATION', 'ACTIVE'), ...)

// Admin rollback — added to existing apps/api/src/routes/users.js
router.post('/:userId/rollback', requireAuth, requireRole('admin'), ...)
```

### Manager scope validation in `activateUser` and `rollbackUser`

Managers may only activate users where `app_user.manager_id = req.user.id`. Admins bypass this check.

---

## Frontend Changes

### AuthProvider

`/auth/me` response updated — expose `status` and `team_membership_active`:

```ts
interface AuthUser {
  // existing
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'user' | 'contributor' | 'viewer';
  // new
  status: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  teamMembershipActive: boolean;
}
```

`AuthProvider` exposes `userStatus` alongside existing helpers.

### Dynamic Journeys page (`apps/web/app/journeys/page.tsx`)

```tsx
const title       = userStatus === 'ACTIVE' ? 'My Development Plan' : 'My Journeys';
const description = userStatus === 'ACTIVE'
  ? 'Your ongoing development journey as an active resource.'
  : 'Track your onboarding progress and complete assigned tasks.';
const statusBadge = userStatus === 'ACTIVE'
  ? { label: 'Active',         classes: 'bg-emerald-100 text-emerald-700' }
  : { label: 'In Preparation', classes: 'bg-indigo-100 text-indigo-700'  };
```

### Conditional navigation

Sidebar links gated by `userStatus`:

| Route | PREPARATION | ACTIVE |
|---|---|---|
| `/journeys` | Visible | Visible |
| `/my-tasks` | Visible | Visible |
| `/projects` | Hidden | Visible |
| `/resources` | Hidden | Visible |
| `/test-*` | Hidden | Visible |

Hidden in UI **and** blocked at API level via `requireStatus('ACTIVE')`.

### Team Journeys page (`apps/web/app/settings/team-journeys/page.tsx`)

- Member list filtered to `status = 'PREPARATION'` users only. Frontend calls `GET /manager/team?status=PREPARATION` — the route gains an optional `?status=` query param filter (default: no filter, preserving existing callers). ACTIVE users appear in the resource screen, not here.
- `ready_for_activation` badge shown per user ("Ready" / "Not ready")
- "Mark as Ready" button calls `PATCH /manager/team/:userId/ready-for-activation`
- "Activate Resource" button:
  - Disabled (greyed out) when `ready_for_activation = false`
  - On click: opens confirmation modal — "Activate [Name] as a Resource? This will grant full system access and create a resource record."
  - On confirm: calls `POST /manager/team/:userId/activate`
  - On success: removes user from list, shows success toast

### Resource screen (`apps/web/app/resources/page.tsx`)

- Query: `GET /resources` now returns `status = 'ACTIVE'` users only (enforced at API)
- Empty state when no ACTIVE users but PREPARATION users exist:
  > "You have X users currently in preparation. Once they are activated, they will appear here."
- No UI changes needed beyond the empty state — the filter is enforced by the API

---

## Edge Cases

| Case | Handling |
|---|---|
| Activate without team | `activateUser()` throws 400 — "User must be assigned to a team before activation" |
| Activate already ACTIVE user | `activateUser()` throws 409 — "User is already active" |
| Activate without `ready_for_activation` | `activateUser()` throws 400 — "User is not marked as ready for activation" |
| Rollback by non-admin | `POST /admin/users/:userId/rollback` returns 403 |
| PREPARATION user hits resource endpoint | `requireStatus('ACTIVE')` returns 403 |
| Manager tries to activate user from another team | `activateUser()` checks `manager_id`, returns 403 |

---

## UX Details

- **Activation toast**: shown to user on next page load after activation. Frontend reads `notifications` on mount; if a `LIFECYCLE_ACTIVATED` notification exists and is unread, display: "You are now an Active Resource 🎉"
- **Status badges**: displayed on team member cards in Team Journeys page
  - `PREPARATION` → amber badge "In Preparation"
  - `ACTIVE` → green badge "Active" (shown in resource screen)
- **Admin rollback warning**: confirmation modal reads — "Rolling back [Name] to Preparation will revoke full system access. This action cannot be undone automatically."

---

## Files Changed

| File | Change |
|---|---|
| `database/migrations/020_user_lifecycle_status.sql` | New — adds status, team_membership_active, ready_for_activation |
| `database/migrations/021_drop_deprecated_lifecycle_columns.sql` | New — drops activated, probation_completed (run after verification) |
| `apps/api/src/services/userLifecycle.js` | New — lifecycle service with atomic transitions |
| `apps/api/src/middleware/authMiddleware.js` | Add requireStatus(), update requireAuth SELECT |
| `apps/api/src/routes/managerView.js` | Replace /probation with /ready-for-activation, add /activate |
| `apps/api/src/routes/users.js` | Add `POST /:userId/rollback` endpoint |
| `apps/api/src/routes/resources.js` | Add requireStatus('ACTIVE') |
| `apps/api/src/routes/projects.js` | Add requireStatus('ACTIVE') |
| `apps/web/src/components/providers/AuthProvider.tsx` | Expose userStatus |
| `apps/web/src/components/layout/Sidebar.tsx` | Conditional nav links by status |
| `apps/web/app/journeys/page.tsx` | Dynamic title/description/badge by status |
| `apps/web/app/settings/team-journeys/page.tsx` | Filter to PREPARATION, Activate button + modal |
| `apps/web/app/resources/page.tsx` | Empty state for 0 active + preparation users |
