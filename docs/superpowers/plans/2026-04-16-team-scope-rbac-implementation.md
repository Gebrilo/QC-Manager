# Team-Scoped RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing lifecycle system with team-based access control — managers can only see and act on users in the team they manage, enforced at the API level.

**Architecture:** Three new helper functions added to the existing `teamAccess.js` (single source of truth for all team-access logic). The lifecycle service imports `getManagerTeamId` from `teamAccess.js` and replaces its `manager_id` direct-report check with a `team_id` check. Four route files are updated to use the new helpers. No new files, no schema changes.

**Tech Stack:** Node.js/Express, PostgreSQL (`apps/api/src/config/db.js`), Jest (unit tests in `apps/api/__tests__/`)

---

## File Map

| File | Change |
|---|---|
| `apps/api/__tests__/teamAccess.test.js` | **Create** — unit tests for the three new helpers |
| `apps/api/src/middleware/teamAccess.js` | **Modify** — add `requireTeamScope`, `canAccessUser`, `getTeamScopeFilter` + update `module.exports` |
| `apps/api/__tests__/userLifecycle.test.js` | **Modify** — update 4 existing tests; add 4 new tests |
| `apps/api/src/services/userLifecycle.js` | **Modify** — import `getManagerTeamId`, replace `manager_id` checks in `activateUser` + `markReadyForActivation` |
| `apps/api/src/routes/managerView.js` | **Modify** — update imports, replace `GET /team`, fix duplicate route bug, update `GET /eligible-resources`, update journey sub-routes and `POST /make-resource` |
| `apps/api/src/routes/resources.js` | **Modify** — add imports, add team scope to `GET /`, `GET /:id`, `GET /:id/analytics` |

---

### Task 1: New helpers in `teamAccess.js`

**Files:**
- Create: `apps/api/__tests__/teamAccess.test.js`
- Modify: `apps/api/src/middleware/teamAccess.js`

- [ ] **Step 1: Create the test file**

Create `apps/api/__tests__/teamAccess.test.js` with this exact content:

```js
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const {
    requireTeamScope,
    canAccessUser,
    getTeamScopeFilter,
} = require('../src/middleware/teamAccess');

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

afterEach(() => jest.clearAllMocks());

// ── requireTeamScope ──────────────────────────────────────────────────────────

describe('requireTeamScope', () => {
    test('passes admin — sets req.teamId = null', async () => {
        const req = { user: { id: 'admin-1', role: 'admin' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope()(req, res, next);

        expect(req.teamId).toBeNull();
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('passes manager with team — sets req.teamId to team UUID', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'team-abc', name: 'Team A', manager_id: 'mgr-1' }],
        });
        const req = { user: { id: 'mgr-1', role: 'manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope()(req, res, next);

        expect(req.teamId).toBe('team-abc');
        expect(next).toHaveBeenCalledWith();
    });

    test('blocks manager with no team — 403', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const req = { user: { id: 'mgr-2', role: 'manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('not assigned') })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('blocks non-manager non-admin role — 403', async () => {
        const req = { user: { id: 'user-1', role: 'user' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('Manager or admin') })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 if req.user is null', async () => {
        const req = { user: null };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

// ── canAccessUser ─────────────────────────────────────────────────────────────

describe('canAccessUser', () => {
    test('admin returns true without any DB call', async () => {
        const result = await canAccessUser({ id: 'admin-1', role: 'admin' }, 'any-user');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('self-access returns true without any DB call', async () => {
        const result = await canAccessUser({ id: 'user-1', role: 'user' }, 'user-1');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('manager whose team contains target user returns true', async () => {
        // Call 1: getManagerTeamId — teams query
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-x', name: 'X', manager_id: 'mgr-1' }] });
        // Call 2: app_user team check
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'target-user' }] });

        const result = await canAccessUser({ id: 'mgr-1', role: 'manager' }, 'target-user');
        expect(result).toBe(true);
    });

    test('manager whose team does NOT contain target user returns false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-x', name: 'X', manager_id: 'mgr-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // user not in this team

        const result = await canAccessUser({ id: 'mgr-1', role: 'manager' }, 'other-user');
        expect(result).toBe(false);
    });

    test('manager with no team returns false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no team found

        const result = await canAccessUser({ id: 'mgr-2', role: 'manager' }, 'target-user');
        expect(result).toBe(false);
    });

    test('non-manager non-admin non-self returns false without DB call', async () => {
        const result = await canAccessUser({ id: 'user-1', role: 'user' }, 'user-2');
        expect(result).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

// ── getTeamScopeFilter ────────────────────────────────────────────────────────

describe('getTeamScopeFilter', () => {
    test('admin returns empty clause with no DB call', async () => {
        const filter = await getTeamScopeFilter({ role: 'admin' });
        expect(filter).toEqual({ clause: '', params: [], nextIdx: 1, teamId: null });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('manager with team — default alias and startIdx', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-y', name: 'Y', manager_id: 'mgr-1' }] });
        const filter = await getTeamScopeFilter({ id: 'mgr-1', role: 'manager' });
        expect(filter).toEqual({
            clause: 'AND u.team_id = $1',
            params: ['team-y'],
            nextIdx: 2,
            teamId: 'team-y',
        });
    });

    test('manager with team — custom alias and startIdx', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-z', name: 'Z', manager_id: 'mgr-1' }] });
        const filter = await getTeamScopeFilter({ id: 'mgr-1', role: 'manager' }, 'au', 3);
        expect(filter).toEqual({
            clause: 'AND au.team_id = $3',
            params: ['team-z'],
            nextIdx: 4,
            teamId: 'team-z',
        });
    });

    test('manager with no team — returns AND 1=0 guard clause', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const filter = await getTeamScopeFilter({ id: 'mgr-3', role: 'manager' });
        expect(filter).toEqual({ clause: 'AND 1=0', params: [], nextIdx: 1, teamId: null });
    });
});
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
cd apps/api && npx jest --testPathPattern=teamAccess --no-coverage
```

Expected: all 15 tests FAIL with `TypeError: requireTeamScope is not a function` (functions don't exist yet)

- [ ] **Step 3: Add the three functions to `teamAccess.js`**

In `apps/api/src/middleware/teamAccess.js`, add the following block after the existing `canAccessTeamMember` function (before the `attachTeamScope` function):

```js
/**
 * Middleware: Enforce team scope. Admins pass unrestricted (req.teamId = null).
 * Managers must have a team; req.teamId is set to their team UUID.
 * Managers with no team and non-manager/non-admin roles receive 403.
 * Supersedes attachTeamScope (which silently passes null for unassigned managers).
 */
function requireTeamScope() {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (req.user.role === 'admin') {
            req.teamId = null;
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

/**
 * Check whether requestUser can access a target user record.
 * Admin → always true. Self-access → true. Manager → checks team_id match via DB.
 * Other roles → false.
 *
 * @param {object} requestUser - req.user
 * @param {string} targetUserId - UUID of the user being accessed
 * @returns {Promise<boolean>}
 */
async function canAccessUser(requestUser, targetUserId) {
    if (requestUser.role === 'admin') return true;
    if (requestUser.id === targetUserId) return true;
    if (requestUser.role !== 'manager') return false;

    const teamId = await getManagerTeamId(requestUser.id);
    if (!teamId) return false;

    const result = await db.query(
        `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
        [targetUserId, teamId]
    );
    return result.rows.length > 0;
}

/**
 * Build a SQL WHERE clause fragment scoping app_user queries to a manager's team.
 * Follows the same pattern as projectTeamClause / taskTeamClause.
 * Use this in routes that do NOT use requireTeamScope middleware (e.g. resources.js).
 * Routes that already use requireTeamScope should read req.teamId directly.
 *
 * @param {object} user - req.user
 * @param {string} tableAlias - SQL alias for app_user table (default 'u')
 * @param {number} startIdx - first $N parameter index (default 1)
 * @returns {Promise<{ clause: string, params: any[], nextIdx: number, teamId: string|null }>}
 */
async function getTeamScopeFilter(user, tableAlias = 'u', startIdx = 1) {
    if (user.role === 'admin') {
        return { clause: '', params: [], nextIdx: startIdx, teamId: null };
    }
    const teamId = await getManagerTeamId(user.id);
    if (!teamId) {
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

- [ ] **Step 4: Update `module.exports` in `teamAccess.js`**

Find the existing `module.exports` block at the bottom of the file:

```js
module.exports = {
    getManagerTeam,
    getManagerTeamId,
    getUserTeamId,
    canAccessProject,
    canAccessTask,
    canAccessTeamMember,
    attachTeamScope,
    projectTeamClause,
    taskTeamClause,
};
```

Replace with:

```js
module.exports = {
    getManagerTeam,
    getManagerTeamId,
    getUserTeamId,
    canAccessProject,
    canAccessTask,
    canAccessTeamMember,
    attachTeamScope,
    projectTeamClause,
    taskTeamClause,
    requireTeamScope,
    canAccessUser,
    getTeamScopeFilter,
};
```

- [ ] **Step 5: Run tests — expect all to pass**

```bash
cd apps/api && npx jest --testPathPattern=teamAccess --no-coverage
```

Expected: all 15 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/__tests__/teamAccess.test.js apps/api/src/middleware/teamAccess.js
git commit -m "feat(rbac): add requireTeamScope, canAccessUser, getTeamScopeFilter to teamAccess"
```

---

### Task 2: Lifecycle service — switch to `team_id` checks

**Files:**
- Modify: `apps/api/__tests__/userLifecycle.test.js`
- Modify: `apps/api/src/services/userLifecycle.js`

**Context:** `activateUser` currently checks `user.manager_id !== actorId`. After this task it calls `getManagerTeamId(actorId)` and checks whether the returned `team_id` matches the user's `team_id`. This adds one extra DB call (the teams query) in non-admin paths. Four existing tests break; four new tests are added.

- [ ] **Step 1: Add new failing tests to `userLifecycle.test.js`**

Inside the existing `describe('activateUser', ...)` block, add these two tests after the existing 403 test:

```js
    test('throws 403 when manager belongs to a different team', async () => {
        // Call 1: user lookup
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: userId, name: 'Test', email: 't@t.com', role: 'user',
                     status: 'PREPARATION', team_id: 'team-A',
                     ready_for_activation: true, manager_id: 'other-mgr' }],
        });
        // Call 2: getManagerTeamId — actor manages team-B (mismatch with team-A)
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403, message: 'You can only activate users in your team',
        });
    });

    test('throws 403 when manager has no team assigned', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: userId, name: 'Test', email: 't@t.com', role: 'user',
                     status: 'PREPARATION', team_id: 'team-A',
                     ready_for_activation: true, manager_id: null }],
        });
        // getManagerTeamId → no team found
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });
```

Inside the existing `describe('markReadyForActivation', ...)` block, add these two tests after the existing 403 test:

```js
    test('throws 403 when manager belongs to a different team', async () => {
        // user SELECT now returns team_id instead of manager_id
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A' }] });
        // getManagerTeamId → actor manages team-B (mismatch)
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });

    test('throws 403 when manager has no team assigned', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no team

        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd apps/api && npx jest --testPathPattern=userLifecycle --no-coverage
```

Expected: 4 new tests FAIL. The 4 existing tests below will also break once the implementation changes (expected).

- [ ] **Step 3: Update 4 existing tests in `userLifecycle.test.js`**

**Update 1:** The `activateUser` test `'throws 403 when manager does not manage user (non-admin)'`.

Replace the entire test with:

```js
    test('throws 403 when manager does not manage user (non-admin)', async () => {
        // User is in team-A; actor's team will be team-B → mismatch
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A',
                     ready_for_activation: true, manager_id: 'other-manager' }],
        });
        // getManagerTeamId → actor manages team-B
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403, message: 'You can only activate users in your team',
        });
    });
```

**Update 2:** The `activateUser` test `'activates user and returns updated row'`.

This is the non-admin success path. Insert one extra `mockResolvedValueOnce` call (the `getManagerTeamId` teams query) between the user-lookup mock and the BEGIN mock:

```js
    test('activates user and returns updated row', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, name: 'Sara', email: 's@x.com', role: 'contributor', status: 'PREPARATION', team_id: 't1', ready_for_activation: true, manager_id: managerId }] })
            // NEW: getManagerTeamId — actor manages team 't1' (matches user's team_id)
            .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Team A', manager_id: managerId }] })
            .mockResolvedValueOnce({ rows: [] })                              // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE' }] }) // UPDATE app_user
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })                 // INSERT resources
            .mockResolvedValueOnce({ rows: [] })                              // INSERT notification
            .mockResolvedValueOnce({ rows: [] });                             // COMMIT
        const result = await activateUser(userId, managerId, {}, 'manager');
        expect(result).toMatchObject({ id: userId, status: 'ACTIVE' });
    });
```

**Update 3:** The `markReadyForActivation` test `'throws 403 when manager does not manage user (non-admin)'`.

Replace the entire test:

```js
    test('throws 403 when manager does not manage user (non-admin)', async () => {
        // User is in team-A; actor's team will be team-B
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });
```

**Update 4:** The `markReadyForActivation` test `'sets ready_for_activation flag'`.

Insert one extra `mockResolvedValueOnce` after the user-lookup mock:

```js
    test('sets ready_for_activation flag', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 't1' }] })
            // NEW: getManagerTeamId — actor manages team 't1' (match)
            .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Team A', manager_id: managerId }] })
            .mockResolvedValueOnce({ rows: [{ id: userId, ready_for_activation: true }] }); // UPDATE
        const result = await markReadyForActivation(userId, managerId, true, 'manager');
        expect(result.ready_for_activation).toBe(true);
    });
```

- [ ] **Step 4: Implement the changes in `userLifecycle.js`**

At the top of `apps/api/src/services/userLifecycle.js`, add the import after the `'use strict';` line and before the existing `const db = require('../config/db');`:

```js
const { getManagerTeamId } = require('../middleware/teamAccess');
```

In `activateUser`, find and replace the actor scope check block:

```js
// REMOVE this block:
    if (actorRole !== 'admin' && user.manager_id !== actorId) {
        throw lifecycleError(403, 'You can only activate users directly managed by you');
    }

// REPLACE with:
    if (actorRole !== 'admin') {
        const actorTeamId = await getManagerTeamId(actorId);
        if (!actorTeamId || actorTeamId !== user.team_id) {
            throw lifecycleError(403, 'You can only activate users in your team');
        }
    }
```

In `markReadyForActivation`, update the user SELECT query:

```js
// CHANGE:
    const userResult = await db.query(
        `SELECT id, status, manager_id FROM app_user WHERE id = $1`,
        [userId]
    );

// TO:
    const userResult = await db.query(
        `SELECT id, status, team_id FROM app_user WHERE id = $1`,
        [userId]
    );
```

Then in the same function, find and replace the actor scope check block:

```js
// REMOVE this block:
    if (actorRole !== 'admin' && user.manager_id !== actorId) {
        throw lifecycleError(403, 'You can only update users directly managed by you');
    }

// REPLACE with:
    if (actorRole !== 'admin') {
        const actorTeamId = await getManagerTeamId(actorId);
        if (!actorTeamId || actorTeamId !== user.team_id) {
            throw lifecycleError(403, 'You can only update users in your team');
        }
    }
```

- [ ] **Step 5: Run all lifecycle tests — verify all pass**

```bash
cd apps/api && npx jest --testPathPattern=userLifecycle --no-coverage
```

Expected: all tests PASS (including the 4 new ones and the 4 updated ones)

- [ ] **Step 6: Commit**

```bash
git add apps/api/__tests__/userLifecycle.test.js apps/api/src/services/userLifecycle.js
git commit -m "feat(rbac): switch activateUser + markReadyForActivation to team_id scope check"
```

---

### Task 3: `managerView.js` — `GET /team` list

**Files:**
- Modify: `apps/api/src/routes/managerView.js`

- [ ] **Step 1: Update the imports at the top of `managerView.js`**

Find this line:

```js
const { getManagerTeam, getManagerTeamId } = require('../middleware/teamAccess');
```

Replace with:

```js
const { getManagerTeam, getManagerTeamId, requireTeamScope, canAccessUser } = require('../middleware/teamAccess');
```

- [ ] **Step 2: Replace the entire `GET /team` route**

Find the entire `GET /team` route (starts at `router.get('/team', requirePermission(...)`, ends at the closing `});` after `res.json(result.rows);`). Replace it entirely with:

```js
// GET /manager/team — List members of the manager's team (team_id scoped for managers)
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

            // req.teamId is null for admins (no filter) and a UUID for managers
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

- [ ] **Step 3: Verify syntax**

```bash
cd apps/api && node -e "require('./src/routes/managerView')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/managerView.js
git commit -m "feat(rbac): scope GET /manager/team to manager's team_id via requireTeamScope"
```

---

### Task 4: `managerView.js` — fix duplicate route + `GET /team/:userId`

**Files:**
- Modify: `apps/api/src/routes/managerView.js`

**Context:** `GET /team/:userId` appears twice. Express always matches the first definition (uses `manager_id` filter — stale). The second definition (uses `getManagerTeam` + `team_id`) is unreachable. Remove the first; update the second to use `canAccessUser`.

- [ ] **Step 1: Remove the first `GET /team/:userId` definition**

Find and delete this entire block (approximately 30 lines starting right after the `PATCH /ready-for-activation` route):

```js
// GET /manager/team/:userId — Get a single team member
router.get('/team/:userId', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        let query = `
            SELECT u.id, u.name, u.email, u.role, u.active, u.status,
                   u.team_membership_active, u.ready_for_activation,
                   u.onboarding_completed, u.team_id, u.manager_id,
                   CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_resource,
                   -- Fetch total XP by summing valid journey XP
                   (SELECT COALESCE(SUM(uja.total_xp), 0) 
                    FROM user_journey_assignments uja 
                    JOIN journeys j ON uja.journey_id = j.id AND j.deleted_at IS NULL 
                    WHERE uja.user_id = u.id) AS total_xp
            FROM app_user u
            LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
            WHERE u.id = $1 AND u.active = true
        `;
        const params = [userId];

        if (req.user.role !== 'admin') {
            query += ` AND u.manager_id = $2`;
            params.push(req.user.id);
        }

        const result = await db.query(query, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found in your team' });

        res.json({ ...result.rows[0], total_xp: parseInt(result.rows[0].total_xp) || 0 });
    } catch (err) { next(err); }
});
```

- [ ] **Step 2: Update the second (now-only) `GET /team/:userId` definition**

Find the second `GET /team/:userId` route near the bottom of the file (it starts with `// GET /manager/team/:userId — Profile + summary for one team member`). Replace the entire route with:

```js
// GET /manager/team/:userId — Profile + summary for one team member
router.get('/team/:userId', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
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
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

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
});
```

Note: returns 404 (not 403) on denied access — avoids leaking the existence of users outside the manager's team.

- [ ] **Step 3: Verify syntax**

```bash
cd apps/api && node -e "require('./src/routes/managerView')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/managerView.js
git commit -m "fix(rbac): remove duplicate GET /team/:userId, use canAccessUser for team scope"
```

---

### Task 5: `managerView.js` — `GET /eligible-resources` and `POST /make-resource`

**Files:**
- Modify: `apps/api/src/routes/managerView.js`

- [ ] **Step 1: Replace the `GET /eligible-resources` route**

Find the entire `GET /eligible-resources` route. Replace it with:

```js
// GET /manager/eligible-resources — Users ready for activation, scoped to manager's team
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

- [ ] **Step 2: Update the `POST /team/:userId/make-resource` access check**

Find the `POST /team/:userId/make-resource` route. Inside it, find this `userQuery` block and the checks that follow:

```js
        const userQuery = await db.query(`
            SELECT id, name, email, role, probation_completed, manager_id 
            FROM app_user 
            WHERE id = $1 AND active = true
        `, [userId]);

        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or inactive.' });
        }

        const user = userQuery.rows[0];

        // Validations
        if (req.user.role !== 'admin' && user.manager_id !== req.user.id) {
            return res.status(403).json({ error: 'This user is not directly managed by you.' });
        }

        if (!user.probation_completed) {
            return res.status(400).json({ error: 'User probation is not yet completed. Cannot assign as a resource.' });
        }
```

Replace that entire block with:

```js
        const userQuery = await db.query(
            `SELECT id, name, email, role FROM app_user WHERE id = $1 AND active = true`,
            [userId]
        );

        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or inactive.' });
        }

        const user = userQuery.rows[0];

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) {
            return res.status(403).json({ error: 'This user is not in your team.' });
        }
```

- [ ] **Step 3: Verify syntax**

```bash
cd apps/api && node -e "require('./src/routes/managerView')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/managerView.js
git commit -m "feat(rbac): scope eligible-resources to team, fix make-resource access check"
```

---

### Task 6: `managerView.js` — journey sub-routes

**Files:**
- Modify: `apps/api/src/routes/managerView.js`

**Context:** Three routes repeat the same inline team-scope check (`getManagerTeam` + DB query). Replace all three with `canAccessUser`. The inline pattern to replace in each is:

```js
        if (req.user.role !== 'admin') {
            const team = await getManagerTeam(req.user.id);
            if (!team) return res.status(403).json({ error: 'You are not assigned as a manager of any team' });

            const check = await db.query(
                `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
                [userId, team.id]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'This user is not in your team' });
            }
        }
```

Replace with:

```js
        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(404).json({ error: 'User not found in your team' });
```

- [ ] **Step 1: Update `GET /team/:userId/journeys`**

Find the handler for `GET /team/:userId/journeys`. Replace the inline team-scope block (shown above) with the `canAccessUser` pattern.

- [ ] **Step 2: Update `GET /team/:userId/journeys/:journeyId`**

Find the handler for `GET /team/:userId/journeys/:journeyId`. Replace the same inline block.

- [ ] **Step 3: Update the attachment download route**

Find the handler for `GET /team/:userId/journeys/:journeyId/tasks/:taskId/attachment`. Replace the same inline block.

- [ ] **Step 4: Verify syntax**

```bash
cd apps/api && node -e "require('./src/routes/managerView')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/managerView.js
git commit -m "refactor(rbac): replace inline team checks with canAccessUser in journey routes"
```

---

### Task 7: `resources.js` — team scope

**Files:**
- Modify: `apps/api/src/routes/resources.js`

- [ ] **Step 1: Add imports**

In `apps/api/src/routes/resources.js`, find the line that imports from `authMiddleware`:

```js
const { requireAuth, requirePermission, requireRole, requireStatus } = require('../middleware/authMiddleware');
```

Add this line immediately after it:

```js
const { canAccessUser, getTeamScopeFilter } = require('../middleware/teamAccess');
```

- [ ] **Step 2: Replace the `GET /` route handler**

Find the existing `GET /` route (line 15). Replace it entirely with:

```js
// GET all resources — admins/non-managers see all; managers see their team only
router.get('/', requireAuth, requireStatus('ACTIVE'), requirePermission('page:resources'), async (req, res, next) => {
    try {
        if (req.user.role !== 'manager') {
            const result = await db.query(
                `SELECT * FROM v_resources_with_utilization ORDER BY resource_name ASC`
            );
            return res.json(result.rows);
        }

        // Manager: scope to team. Resources with no user_id are excluded (inner JOIN is intentional).
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
});
```

- [ ] **Step 3: Update the `GET /:id/analytics` route handler**

Find the `GET /:id/analytics` route. After the line `const resource = profileResult.rows[0];`, add the following team scope check:

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

- [ ] **Step 4: Update the `GET /:id` route handler**

Find the `GET /:id` route (single resource by id). After the "not found" check and before `res.json(result.rows[0])`, add:

```js
        const resource = result.rows[0];

        if (req.user.role === 'manager') {
            if (!resource.user_id) {
                return res.status(403).json({ error: 'Access restricted to your team' });
            }
            const allowed = await canAccessUser(req.user, resource.user_id);
            if (!allowed) {
                return res.status(403).json({ error: 'Access restricted to your team' });
            }
        }

        res.json(resource);
```

(Remove the original `res.json(result.rows[0]);` line — it is replaced by `res.json(resource);` above.)

- [ ] **Step 5: Verify syntax**

```bash
cd apps/api && node -e "require('./src/routes/resources')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 6: Run the full test suite**

```bash
cd apps/api && npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/resources.js
git commit -m "feat(rbac): scope resources routes to manager's team"
```
