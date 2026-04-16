---
title: Team-Scoped RBAC — Access Control Extension
date: 2026-04-16
status: approved
---

# Team-Scoped RBAC — Access Control Extension

## Overview

Extend the existing lifecycle system with team-based access control (RBAC-lite). Managers are restricted to seeing and acting on users in the team they manage. Admins retain global access. No schema changes, no new tables, no lifecycle logic refactored — additive changes only.

## Goals

- Enforce team-based visibility at the API level for all user-facing routes
- Provide reusable helpers so team-scope logic is never duplicated across routes
- Standardize the codebase on a single canonical check: team membership via `getManagerTeamId` (not the legacy `manager_id` direct-report check)
- Fix a pre-existing duplicate route bug in `managerView.js` as part of this work

## Out of Scope

- Schema changes
- Introduction of `team_memberships` table
- Refactoring lifecycle transitions (`suspendUser`, `archiveUser`)
- Frontend changes — API enforcement is sufficient

---

## Canonical Access Model

The single source of truth for team membership is:

```
teams.manager_id = req.user.id  →  team.id
app_user.team_id = team.id      →  user is in this manager's team
```

Lookup helper: `getManagerTeamId(managerId)` (already exists in `teamAccess.js`).

The legacy `manager_id` field on `app_user` (direct-report relationship) is **not** the canonical team-scope check. Routes currently using it will be updated.

### Role matrix

| Role | Visibility |
|---|---|
| `admin` | All users, all teams, all resources |
| `manager` | Users whose `app_user.team_id` matches the team managed by this manager |
| `manager` with no team assigned | Blocked — 403 |
| `user` / `contributor` / `viewer` | Self only (for user routes); full list for resource/project routes with correct permissions (unchanged) |

---

## New Exports — `teamAccess.js`

All three additions go into `apps/api/src/middleware/teamAccess.js`. No new files.

### `requireTeamScope()` — middleware factory

Replaces the currently unused `attachTeamScope`. Blocks managers with no team instead of silently passing `null`. Sets `req.teamId` for downstream use.

```js
function requireTeamScope() {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (req.user.role === 'admin') {
            req.teamId = null; // admin sees all
            return next();
        }
        if (req.user.role !== 'manager') {
            return res.status(403).json({ error: 'Manager or admin access required' });
        }
        try {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) {
                return res.status(403).json({
                    error: 'You are not assigned as a manager of any team',
                });
            }
            req.teamId = teamId;
            next();
        } catch (err) {
            next(err);
        }
    };
}
```

`req.teamId` is `null` for admins and a UUID for managers. Routes read it directly — no second `getManagerTeamId` call needed.

### `canAccessUser(requestUser, targetUserId)` — async predicate

Single-record access check. Used for `GET /team/:userId`, `GET /resources/:id`, `GET /resources/:id/analytics`.

```js
async function canAccessUser(requestUser, targetUserId) {
    if (requestUser.role === 'admin') return true;
    if (requestUser.id === targetUserId) return true; // self-access always allowed
    if (requestUser.role !== 'manager') return false;

    const teamId = await getManagerTeamId(requestUser.id);
    if (!teamId) return false;

    const result = await db.query(
        `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
        [targetUserId, teamId]
    );
    return result.rows.length > 0;
}
```

### `getTeamScopeFilter(user, tableAlias, startIdx)` — async clause builder

Follows the same pattern as the existing `projectTeamClause` and `taskTeamClause`. Used in routes that do not go through `requireTeamScope` middleware (i.e., `resources.js`).

```js
async function getTeamScopeFilter(user, tableAlias = 'u', startIdx = 1) {
    if (user.role === 'admin') {
        return { clause: '', params: [], nextIdx: startIdx, teamId: null };
    }
    const teamId = await getManagerTeamId(user.id);
    if (!teamId) {
        // Manager with no team — empty result set, not an error
        return { clause: 'AND 1=0', params: [], nextIdx: startIdx, teamId: null };
    }
    return {
        clause: `AND ${tableAlias}.team_id = $${startIdx}`,
        params: [teamId],
        nextIdx: startIdx + 1,
        teamId,
    };
}
```

### Exports

Add all three to `module.exports`:

```js
module.exports = {
    // existing
    getManagerTeam, getManagerTeamId, getUserTeamId,
    canAccessProject, canAccessTask, canAccessTeamMember,
    attachTeamScope, projectTeamClause, taskTeamClause,
    // new
    requireTeamScope, canAccessUser, getTeamScopeFilter,
};
```

`attachTeamScope` is kept in exports for backwards compatibility but is superseded by `requireTeamScope` for new usage.

---

## Lifecycle Service — `userLifecycle.js`

### Import

Add at top of file:

```js
const { getManagerTeamId } = require('../middleware/teamAccess');
```

No circular dependency risk — `teamAccess.js` only imports `db`.

### `activateUser` — replace `manager_id` check

The user SELECT already fetches `team_id`. Only the validation block changes.

**Before:**
```js
if (actorRole !== 'admin' && user.manager_id !== actorId) {
    throw lifecycleError(403, 'You can only activate users directly managed by you');
}
```

**After:**
```js
if (actorRole !== 'admin') {
    const actorTeamId = await getManagerTeamId(actorId);
    if (!actorTeamId || actorTeamId !== user.team_id) {
        throw lifecycleError(403, 'You can only activate users in your team');
    }
}
```

### `markReadyForActivation` — replace `manager_id` check

The user SELECT must be updated to fetch `team_id` instead of `manager_id`.

**SELECT change:**
```js
// Before:
`SELECT id, status, manager_id FROM app_user WHERE id = $1`

// After:
`SELECT id, status, team_id FROM app_user WHERE id = $1`
```

**Validation change:**
```js
// Before:
if (actorRole !== 'admin' && user.manager_id !== actorId) {
    throw lifecycleError(403, 'You can only update users directly managed by you');
}

// After:
if (actorRole !== 'admin') {
    const actorTeamId = await getManagerTeamId(actorId);
    if (!actorTeamId || actorTeamId !== user.team_id) {
        throw lifecycleError(403, 'You can only update users in your team');
    }
}
```

---

## Route Changes — `managerView.js`

### Imports added

```js
const { requireTeamScope, canAccessUser } = require('../middleware/teamAccess');
```

### Duplicate route bug fix

`GET /team/:userId` is defined twice. Express always matches the first (lines 60–88, `manager_id`-based, stale). The second (lines 436–470, `team_id`-based, correct) is unreachable.

**Fix:** Remove the first definition entirely. Update the second definition (lines 436–470) to use `canAccessUser` and become the single handler.

### `GET /team` — standardize to `team_id`

Add `requireTeamScope()` to the middleware chain. Replace manual admin/manager branching with `req.teamId`:

```js
router.get('/team',
    requirePermission('action:journeys:view_team_progress'),
    requireTeamScope(),
    async (req, res, next) => {
        try {
            const { status } = req.query;
            const VALID_STATUSES = ['PREPARATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];
            const safeStatus = status ? status.toUpperCase() : null;
            if (safeStatus && !VALID_STATUSES.includes(safeStatus)) {
                return res.status(400).json({ error: 'Invalid status filter' });
            }

            const params = [];
            let where = 'u.active = true';

            if (req.teamId) {
                where += ` AND u.team_id = $${params.length + 1}`;
                params.push(req.teamId);
            }
            if (safeStatus) {
                where += ` AND u.status = $${params.length + 1}`;
                params.push(safeStatus);
            }

            const result = await db.query(`
                SELECT u.id, u.name, u.email, u.role, u.active, u.status,
                       u.team_membership_active, u.ready_for_activation,
                       u.onboarding_completed, u.team_id, u.manager_id,
                       CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_resource
                FROM app_user u
                LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
                WHERE ${where}
                ORDER BY u.name
            `, params);
            res.json(result.rows);
        } catch (err) { next(err); }
    }
);
```

### `GET /team/:userId` — consolidated single handler

Replaces both prior definitions. Uses `canAccessUser`:

```js
router.get('/team/:userId',
    requirePermission('action:journeys:view_team_progress'),
    async (req, res, next) => {
        try {
            const { userId } = req.params;

            const allowed = await canAccessUser(req.user, userId);
            if (!allowed) {
                return res.status(404).json({ error: 'User not found in your team' });
            }

            const userResult = await db.query(
                `SELECT id, name, email, role, active, status, team_membership_active,
                        ready_for_activation, onboarding_completed, manager_id, team_id
                 FROM app_user WHERE id = $1`,
                [userId]
            );
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const xpResult = await db.query(
                `SELECT COALESCE(SUM(total_xp), 0) AS total_xp
                 FROM user_journey_assignments WHERE user_id = $1`,
                [userId]
            );

            res.json({
                ...userResult.rows[0],
                total_xp: parseInt(xpResult.rows[0].total_xp) || 0,
            });
        } catch (err) { next(err); }
    }
);
```

Note: returns 404 (not 403) on access denied — avoids leaking the existence of users outside the team.

### `GET /eligible-resources` — standardize to `team_id`

Add `requireTeamScope()`. Replace `AND u.manager_id = $1` with `AND u.team_id = $1` using `req.teamId`:

```js
router.get('/eligible-resources',
    requirePermission('action:journeys:view_team_progress'),
    requireTeamScope(),
    async (req, res, next) => {
        try {
            const params = [];
            let teamFilter = '';
            if (req.teamId) {
                teamFilter = `AND u.team_id = $${params.length + 1}`;
                params.push(req.teamId);
            }

            const result = await db.query(`
                SELECT u.id, u.name, u.email, u.role
                FROM app_user u
                LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
                WHERE u.ready_for_activation = true
                  AND u.status = 'PREPARATION'
                  AND u.active = true
                  AND r.id IS NULL
                  ${teamFilter}
                ORDER BY u.name
            `, params);
            res.json(result.rows);
        } catch (err) { next(err); }
    }
);
```

### `POST /team/:userId/make-resource` — access check only

This endpoint references the deprecated `probation_completed` column (dropped in migration 021) and will fail at runtime — that is a pre-existing issue outside this scope. The **only change** in this PR is replacing the `manager_id` access check with `canAccessUser`:

```js
const allowed = await canAccessUser(req.user, userId);
if (!allowed) {
    return res.status(403).json({ error: 'This user is not in your team.' });
}
```

### Journey sub-routes

`GET /team/:userId/journeys`, `GET /team/:userId/journeys/:journeyId`, and the attachment download route already use `getManagerTeam` + `team_id` checks — they are correct today. The inline pattern is replaced with `canAccessUser` to remove duplication:

```js
// Before (inline in each route):
const team = await getManagerTeam(req.user.id);
if (!team) return res.status(403).json({ error: '...' });
const check = await db.query(`SELECT id FROM app_user WHERE id = $1 AND team_id = $2`, [userId, team.id]);
if (check.rows.length === 0) return res.status(403).json({ error: '...' });

// After:
const allowed = await canAccessUser(req.user, userId);
if (!allowed) return res.status(404).json({ error: 'User not found in your team' });
```

---

## Route Changes — `resources.js`

### Import added

```js
const { canAccessUser, getTeamScopeFilter } = require('../middleware/teamAccess');
```

### `GET /` — team-scoped list for managers

Non-manager roles retain the existing global query. Managers get a JOIN-filtered query. Resources with no `user_id` are excluded for managers (inner JOIN).

```js
router.get('/', requireAuth, requireStatus('ACTIVE'), requirePermission('page:resources'),
    async (req, res, next) => {
        try {
            if (req.user.role !== 'manager') {
                const result = await db.query(
                    `SELECT * FROM v_resources_with_utilization ORDER BY resource_name ASC`
                );
                return res.json(result.rows);
            }

            const { teamId } = await getTeamScopeFilter(req.user);
            if (!teamId) return res.json([]);

            const result = await db.query(`
                SELECT v.* FROM v_resources_with_utilization v
                JOIN app_user u ON u.id = v.user_id
                WHERE u.team_id = $1
                ORDER BY v.resource_name ASC
            `, [teamId]);
            res.json(result.rows);
        } catch (err) { next(err); }
    }
);
```

### `GET /:id` — single resource access check for managers

After fetching from the view, verify team membership:

```js
if (req.user.role === 'manager') {
    if (!resource.user_id) {
        return res.status(403).json({ error: 'Access restricted to your team' });
    }
    const allowed = await canAccessUser(req.user, resource.user_id);
    if (!allowed) {
        return res.status(403).json({ error: 'Access restricted to your team' });
    }
}
```

### `GET /:id/analytics` — same pattern

After fetching the resource profile:

```js
if (req.user.role === 'manager') {
    const allowed = resource.user_id
        ? await canAccessUser(req.user, resource.user_id)
        : false;
    if (!allowed) {
        return res.status(403).json({ error: 'Access restricted to your team' });
    }
}
```

---

## Edge Cases

| Case | Handling |
|---|---|
| Manager with no team hits `/manager/team` | `requireTeamScope()` → 403 |
| Manager tries to activate user from another team | `activateUser()` team_id check → 403 |
| Manager tries `GET /team/:userId` for another team's user | `canAccessUser()` returns false → 404 (no existence leak) |
| Manager hits `GET /resources/:id` for unlinked resource | `user_id IS NULL` check → 403 |
| Admin hits any route | Always passes all checks, sees all data |
| User moved between teams | `team_id` on `app_user` reflects the change immediately — no caching |
| `req.teamId` set by `requireTeamScope`, then route calls `getTeamScopeFilter` | Don't do both — routes with `requireTeamScope` use `req.teamId` directly; `getTeamScopeFilter` is only for routes without the middleware (i.e., `resources.js`) |

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/middleware/teamAccess.js` | Add `requireTeamScope()`, `canAccessUser()`, `getTeamScopeFilter()` — export all three |
| `apps/api/src/services/userLifecycle.js` | Import `getManagerTeamId`, switch `activateUser` + `markReadyForActivation` to team_id check |
| `apps/api/src/routes/managerView.js` | Remove duplicate `GET /team/:userId`, add `requireTeamScope()` to list + eligible-resources, replace inline team checks with `canAccessUser` |
| `apps/api/src/routes/resources.js` | Import helpers, add team scope to `GET /`, `GET /:id`, `GET /:id/analytics` |
