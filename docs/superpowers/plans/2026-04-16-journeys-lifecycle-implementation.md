# User Lifecycle State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `app_user.activated` boolean with a `status` ENUM state machine (`PREPARATION`/`ACTIVE`/`SUSPENDED`/`ARCHIVED`), add an atomic `userLifecycle` service, enforce access at the API level via `requireStatus` middleware, and update the frontend to show dynamic labels and the "Activate Resource" flow.

**Architecture:** A new `userLifecycle.js` service owns all state transitions as DB transactions. `requireStatus` middleware (added to `authMiddleware.js`) guards routes. The frontend reads `status` from `AuthProvider` and gates navigation + UI conditionally. Two DB migrations: 020 adds columns and migrates data, 021 drops deprecated columns (run separately after production verification).

**Tech Stack:** PostgreSQL, Node.js/Express, Jest/supertest, Next.js 14/React/TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-16-journeys-lifecycle-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `database/migrations/020_user_lifecycle_status.sql` | Create | Add status, team_membership_active, ready_for_activation; migrate data |
| `database/migrations/021_drop_deprecated_lifecycle_columns.sql` | Create | Drop activated, probation_completed (run after verification) |
| `apps/api/src/services/userLifecycle.js` | Create | Atomic state transitions: activate, rollback, markReady |
| `apps/api/__tests__/userLifecycle.test.js` | Create | Unit tests for lifecycle service |
| `apps/api/src/middleware/authMiddleware.js` | Modify | Add requireStatus(); update requireAuth SELECT to fetch status |
| `apps/api/src/routes/auth.js` | Modify | Return status instead of activated from /sync and /me |
| `apps/api/src/routes/managerView.js` | Modify | Replace /probation with /ready-for-activation; add /activate |
| `apps/api/src/routes/users.js` | Modify | Add /:userId/rollback; update GET / SELECT to include status |
| `apps/api/src/routes/resources.js` | Modify | Add requireStatus('ACTIVE') to GET / |
| `apps/api/src/routes/projects.js` | Modify | Add requireStatus('ACTIVE') to GET / |
| `apps/web/src/components/providers/AuthProvider.tsx` | Modify | Replace activated with status in User type; expose userStatus |
| `apps/web/src/config/routes.ts` | Modify | Replace activated check with status in getLandingPage |
| `apps/web/app/journeys/page.tsx` | Modify | Dynamic title, description, status badge by userStatus |
| `apps/web/app/settings/team-journeys/page.tsx` | Modify | Filter to PREPARATION; replace probation with ready_for_activation; add Activate modal |
| `apps/web/app/resources/page.tsx` | Modify | Add empty state for 0 active + preparation users |

---

## Task 1: DB Migration 020

**Files:**
- Create: `database/migrations/020_user_lifecycle_status.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 020: User lifecycle state machine
-- Adds status ENUM, team_membership_active, ready_for_activation to app_user
-- Migrates data from activated / probation_completed booleans
-- activated and probation_completed are kept here and dropped in migration 021
-- after production data is verified.

BEGIN;

-- 1. Add status column (TEXT with CHECK — same pattern as valid_role constraint)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PREPARATION'
        CHECK (status IN ('PREPARATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'));

-- 2. Add team_membership_active (replaces is_active on a future team_memberships table)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS team_membership_active BOOLEAN NOT NULL DEFAULT false;

-- 3. Add ready_for_activation (replaces probation_completed)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS ready_for_activation BOOLEAN NOT NULL DEFAULT false;

-- 4. Migrate existing data
UPDATE app_user SET
    status               = CASE WHEN activated = true THEN 'ACTIVE' ELSE 'PREPARATION' END,
    team_membership_active = COALESCE(activated, false),
    ready_for_activation   = COALESCE(probation_completed, false);

-- 5. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_app_user_status
    ON app_user(status);
CREATE INDEX IF NOT EXISTS idx_app_user_team_membership_active
    ON app_user(team_membership_active);

COMMIT;
```

- [ ] **Step 2: Apply the migration to the local Supabase database**

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < database/migrations/020_user_lifecycle_status.sql
```

Expected: no errors, `ALTER TABLE` and `CREATE INDEX` messages.

- [ ] **Step 3: Verify data migrated correctly**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT status, team_membership_active, ready_for_activation, COUNT(*) FROM app_user GROUP BY 1,2,3;"
```

Expected: all previously-activated users show `status='ACTIVE'`, `team_membership_active=true`; all others show `status='PREPARATION'`.

- [ ] **Step 4: Write migration 021 (do NOT apply yet)**

```sql
-- Migration 021: Drop deprecated lifecycle columns
-- Run ONLY after verifying migration 020 data in production.
-- activated and probation_completed are replaced by status and ready_for_activation.

BEGIN;

ALTER TABLE app_user
    DROP COLUMN IF EXISTS activated,
    DROP COLUMN IF EXISTS probation_completed;

COMMIT;
```

- [ ] **Step 5: Commit**

```bash
git add database/migrations/020_user_lifecycle_status.sql \
        database/migrations/021_drop_deprecated_lifecycle_columns.sql
git commit -m "feat(db): add status ENUM and lifecycle columns to app_user (migration 020)"
```

---

## Task 2: Lifecycle Service (TDD)

**Files:**
- Create: `apps/api/src/services/userLifecycle.js`
- Create: `apps/api/__tests__/userLifecycle.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// apps/api/__tests__/userLifecycle.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const { activateUser, rollbackUser, markReadyForActivation } = require('../src/services/userLifecycle');

afterEach(() => jest.clearAllMocks());

// ─── activateUser ────────────────────────────────────────────────────────────

describe('activateUser', () => {
    const managerId = 'manager-1';
    const userId    = 'user-1';

    test('throws 400 when user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] }); // user lookup
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 404, message: 'User not found',
        });
    });

    test('throws 409 when user is already ACTIVE', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE', team_id: 't1', ready_for_activation: true, manager_id: managerId }] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 409, message: 'User is already active',
        });
    });

    test('throws 400 when user has no team', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: null, ready_for_activation: true, manager_id: managerId }] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 400, message: 'User must be assigned to a team before activation',
        });
    });

    test('throws 400 when ready_for_activation is false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 't1', ready_for_activation: false, manager_id: managerId }] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 400, message: 'User is not marked as ready for activation',
        });
    });

    test('throws 403 when manager does not manage user (non-admin)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 't1', ready_for_activation: true, manager_id: 'other-manager' }] });
        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403, message: 'You can only activate users directly managed by you',
        });
    });

    test('succeeds for admin regardless of manager_id', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, name: 'Sara', email: 's@x.com', role: 'contributor', status: 'PREPARATION', team_id: 't1', ready_for_activation: true, manager_id: 'other-manager' }] })
            .mockResolvedValueOnce({ rows: [] })  // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: userId }] }) // UPDATE app_user
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })  // INSERT resources
            .mockResolvedValueOnce({ rows: [] })  // INSERT notifications
            .mockResolvedValueOnce({ rows: [] });  // COMMIT
        await expect(activateUser(userId, 'any-admin', {}, 'admin')).resolves.toMatchObject({ id: userId });
    });

    test('activates user and returns updated row', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, name: 'Sara', email: 's@x.com', role: 'contributor', status: 'PREPARATION', team_id: 't1', ready_for_activation: true, manager_id: managerId }] })
            .mockResolvedValueOnce({ rows: [] })  // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE' }] }) // UPDATE app_user
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })  // INSERT resources
            .mockResolvedValueOnce({ rows: [] })  // INSERT notifications
            .mockResolvedValueOnce({ rows: [] });  // COMMIT
        const result = await activateUser(userId, managerId, {}, 'manager');
        expect(result).toMatchObject({ id: userId, status: 'ACTIVE' });
    });
});

// ─── rollbackUser ────────────────────────────────────────────────────────────

describe('rollbackUser', () => {
    const adminId = 'admin-1';
    const userId  = 'user-1';

    test('throws 404 when user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(rollbackUser(userId, adminId)).rejects.toMatchObject({ status: 404 });
    });

    test('throws 409 when user is not ACTIVE', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION' }] });
        await expect(rollbackUser(userId, adminId)).rejects.toMatchObject({
            status: 409, message: 'User is not currently active',
        });
    });

    test('rolls back ACTIVE user to PREPARATION', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE' }] })
            .mockResolvedValueOnce({ rows: [] })  // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION' }] }) // UPDATE app_user
            .mockResolvedValueOnce({ rows: [] })  // UPDATE resources
            .mockResolvedValueOnce({ rows: [] });  // COMMIT
        const result = await rollbackUser(userId, adminId);
        expect(result).toMatchObject({ id: userId, status: 'PREPARATION' });
    });
});

// ─── markReadyForActivation ──────────────────────────────────────────────────

describe('markReadyForActivation', () => {
    const managerId = 'manager-1';
    const userId    = 'user-1';

    test('throws 404 when user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(markReadyForActivation(userId, managerId, true)).rejects.toMatchObject({ status: 404 });
    });

    test('throws 400 when user is not in PREPARATION', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE', manager_id: managerId }] });
        await expect(markReadyForActivation(userId, managerId, true)).rejects.toMatchObject({
            status: 400, message: 'Can only update ready_for_activation for users in PREPARATION status',
        });
    });

    test('throws 403 when manager does not manage user (non-admin)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', manager_id: 'other' }] });
        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({ status: 403 });
    });

    test('sets ready_for_activation flag', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', manager_id: managerId }] })
            .mockResolvedValueOnce({ rows: [{ id: userId, ready_for_activation: true }] });
        const result = await markReadyForActivation(userId, managerId, true, 'manager');
        expect(result.ready_for_activation).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx jest __tests__/userLifecycle.test.js --no-coverage 2>&1 | tail -5
```

Expected: `Cannot find module '../src/services/userLifecycle'`

- [ ] **Step 3: Implement the lifecycle service**

```js
// apps/api/src/services/userLifecycle.js
'use strict';

const db = require('../config/db');

function lifecycleError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

/**
 * Activate a PREPARATION user → ACTIVE.
 * Atomic: updates status, team_membership_active, upserts resource record, creates notification.
 * @param {string} userId
 * @param {string} actorId - ID of the manager/admin performing the action
 * @param {object} options - { weekly_capacity_hrs, department }
 * @param {string} actorRole - role of the actor ('admin'|'manager')
 */
async function activateUser(userId, actorId, options = {}, actorRole = 'manager') {
    const { weekly_capacity_hrs = 40, department = null } = options;

    // Pre-flight checks
    const userResult = await db.query(
        `SELECT id, name, email, role, status, team_id, ready_for_activation, manager_id
         FROM app_user WHERE id = $1`,
        [userId]
    );
    if (userResult.rows.length === 0) throw lifecycleError(404, 'User not found');

    const user = userResult.rows[0];

    if (user.status === 'ACTIVE')       throw lifecycleError(409, 'User is already active');
    if (!user.team_id)                  throw lifecycleError(400, 'User must be assigned to a team before activation');
    if (!user.ready_for_activation)     throw lifecycleError(400, 'User is not marked as ready for activation');
    if (actorRole !== 'admin' && user.manager_id !== actorId) {
        throw lifecycleError(403, 'You can only activate users directly managed by you');
    }

    // Atomic transaction
    await db.query('BEGIN');
    try {
        const updated = await db.query(
            `UPDATE app_user
             SET status = 'ACTIVE', team_membership_active = true, updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, email, role, status, team_membership_active`,
            [userId]
        );

        await db.query(
            `INSERT INTO resources (resource_name, user_id, email, role, department, weekly_capacity_hrs)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) WHERE deleted_at IS NULL
             DO UPDATE SET is_active = true, updated_at = NOW()`,
            [user.name, userId, user.email, user.role, department, weekly_capacity_hrs]
        );

        await db.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'LIFECYCLE_ACTIVATED', 'You are now an Active Resource',
                     'Your account has been activated. You now have full system access.')`,
            [userId]
        );

        await db.query('COMMIT');
        return updated.rows[0];
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    }
}

/**
 * Roll back an ACTIVE user → PREPARATION (admin only).
 * @param {string} userId
 * @param {string} actorId
 */
async function rollbackUser(userId, actorId) {
    const userResult = await db.query(
        `SELECT id, status FROM app_user WHERE id = $1`,
        [userId]
    );
    if (userResult.rows.length === 0) throw lifecycleError(404, 'User not found');
    if (userResult.rows[0].status !== 'ACTIVE') throw lifecycleError(409, 'User is not currently active');

    await db.query('BEGIN');
    try {
        const updated = await db.query(
            `UPDATE app_user
             SET status = 'PREPARATION', team_membership_active = false, updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, email, role, status, team_membership_active`,
            [userId]
        );

        await db.query(
            `UPDATE resources SET is_active = false, updated_at = NOW()
             WHERE user_id = $1 AND deleted_at IS NULL`,
            [userId]
        );

        await db.query('COMMIT');
        return updated.rows[0];
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    }
}

/**
 * Set the ready_for_activation flag on a PREPARATION user.
 * @param {string} userId
 * @param {string} actorId
 * @param {boolean} ready
 * @param {string} actorRole
 */
async function markReadyForActivation(userId, actorId, ready, actorRole = 'manager') {
    const userResult = await db.query(
        `SELECT id, status, manager_id FROM app_user WHERE id = $1`,
        [userId]
    );
    if (userResult.rows.length === 0) throw lifecycleError(404, 'User not found');

    const user = userResult.rows[0];
    if (user.status !== 'PREPARATION') {
        throw lifecycleError(400, 'Can only update ready_for_activation for users in PREPARATION status');
    }
    if (actorRole !== 'admin' && user.manager_id !== actorId) {
        throw lifecycleError(403, 'You can only update users directly managed by you');
    }

    const result = await db.query(
        `UPDATE app_user SET ready_for_activation = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, ready_for_activation`,
        [!!ready, userId]
    );
    return result.rows[0];
}

// Future stubs — ENUM values exist in DB, logic deferred
async function suspendUser(_userId, _actorId, _reason) {
    throw lifecycleError(501, 'SUSPENDED state is not yet implemented');
}

async function archiveUser(_userId, _actorId) {
    throw lifecycleError(501, 'ARCHIVED state is not yet implemented');
}

module.exports = { activateUser, rollbackUser, markReadyForActivation, suspendUser, archiveUser };
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd apps/api && npx jest __tests__/userLifecycle.test.js --no-coverage
```

Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/userLifecycle.js apps/api/__tests__/userLifecycle.test.js
git commit -m "feat(api): add userLifecycle service with atomic state transitions"
```

---

## Task 3: requireStatus Middleware (TDD)

**Files:**
- Modify: `apps/api/src/middleware/authMiddleware.js`

- [ ] **Step 1: Write the failing test**

Add to a new test file:

```js
// apps/api/__tests__/requireStatus.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-123' }),
}));

const express = require('express');
const request = require('supertest');
const { requireAuth, requireStatus } = require('../src/middleware/authMiddleware');

function makeApp(statuses) {
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth, requireStatus(...statuses), (_req, res) => res.json({ ok: true }));
    return app;
}

afterEach(() => jest.clearAllMocks());

test('allows request when user status matches', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'ACTIVE', team_membership_active: true }],
    });
    const res = await request(makeApp(['ACTIVE']))
        .get('/test')
        .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
});

test('returns 403 when user status does not match', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'PREPARATION', team_membership_active: false }],
    });
    const res = await request(makeApp(['ACTIVE']))
        .get('/test')
        .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(403);
    expect(res.body.current).toBe('PREPARATION');
});

test('allows when one of multiple statuses matches', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'PREPARATION', team_membership_active: false }],
    });
    const res = await request(makeApp(['PREPARATION', 'ACTIVE']))
        .get('/test')
        .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest __tests__/requireStatus.test.js --no-coverage 2>&1 | tail -8
```

Expected: fails — `requireStatus is not a function` (not exported yet).

- [ ] **Step 3: Update `authMiddleware.js`**

Two changes: update the SELECT in `requireAuth` to fetch `status` instead of `activated`, and export `requireStatus`.

In `requireAuth`, change both SELECT queries (Supabase path and legacy path) from:
```js
'SELECT id, email, name, role, active, activated FROM app_user WHERE supabase_id = $1'
```
to:
```js
'SELECT id, email, name, role, active, status, team_membership_active FROM app_user WHERE supabase_id = $1'
```

And do the same for the legacy path:
```js
'SELECT id, email, name, role, active, status, team_membership_active FROM app_user WHERE id = $1'
```

Update `req.user` assignment (two places — Supabase path and legacy path):
```js
req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    status: user.status,
    team_membership_active: user.team_membership_active,
};
```

Do the same for `optionalAuth` (both SELECT queries and the `req.user` assignment).

Then add `requireStatus` before `module.exports`:

```js
/**
 * Middleware: Check user has one of the required lifecycle statuses.
 * Must be placed after requireAuth (depends on req.user.status).
 * @param {string[]} statuses - Allowed status values
 */
function requireStatus(...statuses) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
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

Add `requireStatus` to the `module.exports` line:
```js
module.exports = { requireAuth, requireRole, requirePermission, requireAnyPermission, optionalAuth, requireStatus };
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd apps/api && npx jest __tests__/requireStatus.test.js --no-coverage
```

Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/authMiddleware.js apps/api/__tests__/requireStatus.test.js
git commit -m "feat(api): add requireStatus middleware; update requireAuth to fetch status"
```

---

## Task 4: Update auth.js — Return `status` Instead of `activated`

**Files:**
- Modify: `apps/api/src/routes/auth.js`

- [ ] **Step 1: Update `/auth/sync` — three response sites**

In `auth.js`, every `return res.json({ user: { ... activated: user.activated ... } })` must change. There are three places (existing user, legacy link, new user). Replace `activated: user.activated` with `status: user.status` in all three user response objects:

```js
// Before (three occurrences):
role: user.role, activated: user.activated,

// After (three occurrences):
role: user.role, status: user.status,
```

- [ ] **Step 2: Update new-user INSERT and initial status logic**

Find the new-user creation block (around line 283). Currently:
```js
const activated = isFirstUser;
// ...
`INSERT INTO app_user (name, email, phone, role, active, activated, supabase_id, auth_provider)
 VALUES ($1, $2, $3, $4, true, $5, $6, $7)`,
[name, ..., activated, supabaseId, authProvider]
```

Replace with:
```js
const initialStatus = isFirstUser ? 'ACTIVE' : 'PREPARATION';
// ...
const result = await db.query(
    `INSERT INTO app_user (name, email, phone, role, active, status, supabase_id, auth_provider)
     VALUES ($1, $2, $3, $4, true, $5, $6, $7)
     RETURNING id, name, email, phone, role, active, status, created_at`,
    [name, email ? email.toLowerCase() : null, phone || null, role, initialStatus, supabaseId, authProvider]
);
const user = result.rows[0];

if (initialStatus === 'ACTIVE') {
    await setDefaultPermissions(user.id, user.role);
} else {
    await setInactivePermissions(user.id);
}
```

Also update the final new-user `res.status(201).json(...)` to use `status: user.status` instead of `activated: user.activated`.

- [ ] **Step 3: Update `/auth/me` SELECT**

Find the SELECT in `GET /auth/me` (line 344):
```js
'SELECT id, name, display_name, email, phone, role, active, activated, onboarding_completed, preferences, avatar_url, avatar_type, created_at, last_login FROM app_user WHERE id = $1'
```

Replace with:
```js
'SELECT id, name, display_name, email, phone, role, active, status, team_membership_active, onboarding_completed, preferences, avatar_url, avatar_type, created_at, last_login FROM app_user WHERE id = $1'
```

- [ ] **Step 4: Restart API and smoke-test**

```bash
docker restart qc-api && sleep 3
curl -s https://api.gebrils.cloud/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(api): return status instead of activated from /auth/sync and /auth/me"
```

---

## Task 5: Manager Routes — /ready-for-activation + /activate

**Files:**
- Modify: `apps/api/src/routes/managerView.js`

- [ ] **Step 1: Add the import at the top of managerView.js**

After the existing `require` lines, add:
```js
const { activateUser, markReadyForActivation } = require('../services/userLifecycle');
```

- [ ] **Step 2: Replace the `/probation` endpoint with `/ready-for-activation`**

Find the existing block:
```js
// PATCH /manager/team/:userId/probation — Toggle probation status
router.patch('/team/:userId/probation', ...
```

Replace the entire route handler (from `router.patch` to its closing `});`) with:

```js
// PATCH /manager/team/:userId/ready-for-activation — Set the ready_for_activation flag
router.patch('/team/:userId/ready-for-activation', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { ready } = req.body;
        if (typeof ready !== 'boolean') {
            return res.status(400).json({ error: '"ready" must be a boolean' });
        }
        const result = await markReadyForActivation(userId, req.user.id, ready, req.user.role);
        res.json(result);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});
```

- [ ] **Step 3: Add the `/activate` endpoint after `/ready-for-activation`**

```js
// POST /manager/team/:userId/activate — Activate a PREPARATION user as a resource
router.post('/team/:userId/activate', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { weekly_capacity_hrs, department } = req.body;
        const result = await activateUser(
            userId,
            req.user.id,
            { weekly_capacity_hrs, department },
            req.user.role
        );
        res.json(result);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});
```

- [ ] **Step 4: Update `GET /manager/team` to support optional `?status=` filter**

In the `GET /manager/team` handler, find the admin path and manager path queries. Add status filtering to both:

```js
router.get('/team', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { status } = req.query; // optional filter: 'PREPARATION' | 'ACTIVE' etc.
        const statusClause = status ? `AND u.status = '${status.toUpperCase()}'` : '';
        // NOTE: status value is validated below to prevent SQL injection
        const VALID_STATUSES = ['PREPARATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];
        const safeStatus = status ? status.toUpperCase() : null;
        if (safeStatus && !VALID_STATUSES.includes(safeStatus)) {
            return res.status(400).json({ error: 'Invalid status filter' });
        }
```

Then use parameterised query instead of string interpolation. Replace the admin query:

```js
        if (req.user.role === 'admin') {
            const params = [];
            let where = 'u.active = true';
            if (safeStatus) { where += ` AND u.status = $1`; params.push(safeStatus); }
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
            return res.json(result.rows);
        }
        // Manager path
        const params = [req.user.id];
        let where = 'u.manager_id = $1 AND u.active = true';
        if (safeStatus) { where += ` AND u.status = $2`; params.push(safeStatus); }
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
});
```

Also update `GET /manager/team/:userId` (single member) to return `status`, `team_membership_active`, `ready_for_activation` instead of `activated`, `probation_completed`. Replace the SELECT:

```js
SELECT u.id, u.name, u.email, u.role, u.active, u.status,
       u.team_membership_active, u.ready_for_activation,
       u.onboarding_completed, u.team_id, u.manager_id,
       CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_resource,
       (SELECT COALESCE(SUM(uja.total_xp), 0)
        FROM user_journey_assignments uja
        JOIN journeys j ON uja.journey_id = j.id AND j.deleted_at IS NULL
        WHERE uja.user_id = u.id) AS total_xp
FROM app_user u
LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
WHERE u.id = $1 AND u.active = true
```

- [ ] **Step 5: Also remove `/eligible-resources` endpoint's `probation_completed` reference**

Find `GET /manager/eligible-resources`. The query currently filters by `u.probation_completed = true`. Replace with `u.ready_for_activation = true AND u.status = 'PREPARATION'`:

```js
WHERE u.ready_for_activation = true
  AND u.status = 'PREPARATION'
  AND u.active = true
  AND r.id IS NULL
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/managerView.js
git commit -m "feat(api): replace /probation with /ready-for-activation; add /activate endpoint"
```

---

## Task 6: Admin Rollback Endpoint

**Files:**
- Modify: `apps/api/src/routes/users.js`

- [ ] **Step 1: Add lifecycle import**

After the existing `require` lines in `users.js`:
```js
const { rollbackUser } = require('../services/userLifecycle');
```

- [ ] **Step 2: Add the rollback endpoint at the end of the file (before `module.exports`)**

```js
// POST /users/:id/rollback — Admin-only: revert ACTIVE user to PREPARATION
router.post('/:id/rollback', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot rollback your own account' });
        }
        const result = await rollbackUser(id, req.user.id);
        res.json(result);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});
```

- [ ] **Step 3: Update `GET /users/` SELECT to include `status` and `ready_for_activation`**

In the `GET /` handler, find the SELECT and add `status, ready_for_activation, team_membership_active` to the column list:

```js
SELECT u.id, u.name, u.email, u.phone, u.role, u.active,
       u.status, u.ready_for_activation, u.team_membership_active,
       u.created_at, u.updated_at, u.last_login,
       u.manager_id, u.team_id,
       t.name AS team_name,
       m.name AS manager_name
FROM app_user u
LEFT JOIN teams t ON t.id = u.team_id AND t.deleted_at IS NULL
LEFT JOIN app_user m ON m.id = u.manager_id
ORDER BY u.created_at DESC
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/users.js
git commit -m "feat(api): add admin rollback endpoint; expose status in user list"
```

---

## Task 7: Route Protection — Resources + Projects

**Files:**
- Modify: `apps/api/src/routes/resources.js`
- Modify: `apps/api/src/routes/projects.js`

- [ ] **Step 1: Import `requireStatus` in resources.js**

Find the existing import:
```js
const { requireAuth, requirePermission, requireRole } = require('../middleware/authMiddleware');
```

Replace with:
```js
const { requireAuth, requirePermission, requireRole, requireStatus } = require('../middleware/authMiddleware');
```

- [ ] **Step 2: Add `requireStatus('ACTIVE')` to the resources list endpoint**

Find:
```js
router.get('/', requireAuth, requirePermission('page:resources'), async (req, res, next) => {
```

Replace with:
```js
router.get('/', requireAuth, requireStatus('ACTIVE'), requirePermission('page:resources'), async (req, res, next) => {
```

- [ ] **Step 3: Apply the same two changes to projects.js**

In `projects.js`, update the import:
```js
const { requireAuth, requirePermission, requireStatus } = require('../middleware/authMiddleware');
```

Find the main list route:
```js
router.get('/', requireAuth, requirePermission('page:projects'), async (req, res, next) => {
```

Replace with:
```js
router.get('/', requireAuth, requireStatus('ACTIVE'), requirePermission('page:projects'), async (req, res, next) => {
```

- [ ] **Step 4: Run existing tests to check no regressions**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (the mocked `requireAuth` in tests injects `req.user` without a status field — update the mock in affected test files to include `status: 'ACTIVE'` if any tests fail).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/resources.js apps/api/src/routes/projects.js
git commit -m "feat(api): protect resources and projects routes with requireStatus('ACTIVE')"
```

---

## Task 8: AuthProvider — Expose `status`

**Files:**
- Modify: `apps/web/src/components/providers/AuthProvider.tsx`

- [ ] **Step 1: Update the `User` interface**

Find:
```ts
interface User {
    // ...
    activated: boolean;
```

Replace `activated: boolean;` with:
```ts
status: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
team_membership_active: boolean;
```

- [ ] **Step 2: Update `AuthContextType` to expose `userStatus`**

Add `userStatus` to the interface:
```ts
interface AuthContextType {
    // existing fields...
    userStatus: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | null;
    isAdmin: boolean;
    isManager: boolean;
}
```

- [ ] **Step 3: Update `syncWithBackend` and `fetchCurrentUser` to map status**

In `syncWithBackend`, the data comes from `/auth/sync`. The backend now returns `status` instead of `activated`. Update the return:
```ts
return {
    user: { ...data.user },  // status is now in data.user directly
    permissions: data.permissions || [],
};
```

Remove the `activated: data.user.activated ?? true` fallback that was patching the old boolean.

In `fetchCurrentUser`, replace:
```ts
setUser({ ...data.user, activated: data.user.activated ?? true });
```
with:
```ts
setUser({ ...data.user });
```

- [ ] **Step 4: Add `userStatus` and `isManager` to the context value**

Near the bottom of `AuthProvider`, before `return`:
```ts
const userStatus = user?.status ?? null;
const isAdmin   = user?.role === 'admin';
const isManager = user?.role === 'manager';
```

Update the `AuthContext.Provider value` to include `userStatus` and `isManager`:
```tsx
<AuthContext.Provider value={{
    user, permissions, token, loading,
    signInWithPassword, signUp,
    logout, hasPermission,
    isAdmin, isManager, userStatus,
    refreshUser,
}}>
```

- [ ] **Step 5: Update `useAuth` return type (TypeScript)**

The exported `AuthContextType` is already updated in Step 2. TypeScript will surface any remaining `user.activated` references in other components — fix them by replacing `user.activated` with `user.status === 'ACTIVE'` wherever they appear.

Run:
```bash
cd apps/web && grep -r "user\.activated\|\.activated" --include="*.tsx" --include="*.ts" -l
```

For each file found, replace `user.activated` with `user.status === 'ACTIVE'` (or `userStatus === 'ACTIVE'` if using the context helper).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/providers/AuthProvider.tsx
git commit -m "feat(web): replace activated boolean with status in AuthProvider"
```

---

## Task 9: Routes Config + Sidebar — Use `status` for Activation Gate

**Files:**
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `UserForLanding` interface in routes.ts**

Find:
```ts
interface UserForLanding {
    activated: boolean;
```

Replace with:
```ts
interface UserForLanding {
    status: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
```

- [ ] **Step 2: Update `getLandingPage` to use status**

Find:
```ts
if (!user.activated) return '/my-tasks';
```

Replace with:
```ts
if (user.status !== 'ACTIVE') return '/my-tasks';
```

- [ ] **Step 3: Update Sidebar.tsx to filter routes by `status`**

In `Sidebar.tsx`, find:
```ts
if (route.requiresActivation && !user.activated) return false;
```

Replace with:
```ts
if (route.requiresActivation && user.status !== 'ACTIVE') return false;
```

`user` here comes from `useAuth()` — after Task 8, `user.status` is the string ENUM. No other Sidebar changes needed.

- [ ] **Step 4: Build check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no TypeScript errors related to `activated` (fix any that appear by replacing remaining `activated` references with `status === 'ACTIVE'`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/config/routes.ts apps/web/src/components/layout/Sidebar.tsx
git commit -m "feat(web): use user.status to gate requiresActivation routes in sidebar and landing"
```

---

## Task 10: Journeys Page — Dynamic Title and Badge

**Files:**
- Modify: `apps/web/app/journeys/page.tsx`

- [ ] **Step 1: Import `useAuth` at the top of the file**

The file already imports from `../../src/lib/api`. Add:
```ts
import { useAuth } from '../../src/components/providers/AuthProvider';
```

- [ ] **Step 2: Read `userStatus` inside the component**

At the top of the `JourneysPage` function body, after existing state declarations, add:
```ts
const { userStatus } = useAuth();

const pageTitle   = userStatus === 'ACTIVE' ? 'My Development Plan' : 'My Journeys';
const pageSubtitle = userStatus === 'ACTIVE'
    ? 'Your ongoing development journey as an active resource.'
    : 'Track your onboarding progress and complete assigned tasks.';
const statusBadge = userStatus === 'ACTIVE'
    ? { label: 'Active',         classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' }
    : { label: 'In Preparation', classes: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' };
```

- [ ] **Step 3: Replace static title and description with dynamic values**

Find:
```tsx
<h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Journeys</h1>
<p className="text-slate-500 dark:text-slate-400 mt-1">Track your onboarding progress and complete assigned tasks.</p>
```

Replace with:
```tsx
<div className="flex items-center gap-3">
    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{pageTitle}</h1>
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadge.classes}`}>
        {statusBadge.label}
    </span>
</div>
<p className="text-slate-500 dark:text-slate-400 mt-1">{pageSubtitle}</p>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/journeys/page.tsx
git commit -m "feat(web): dynamic title and status badge on journeys page based on lifecycle status"
```

---

## Task 11: Team Journeys Page — Activate Flow

**Files:**
- Modify: `apps/web/app/settings/team-journeys/page.tsx`

- [ ] **Step 1: Update TypeScript interface for `TeamMember`**

Find:
```ts
interface TeamMember {
    // ...
    onboarding_completed: boolean;
    probation_completed: boolean;
    is_resource: boolean;
```

Replace those three lines with:
```ts
    onboarding_completed: boolean;
    status: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    team_membership_active: boolean;
    ready_for_activation: boolean;
    is_resource: boolean;
```

- [ ] **Step 2: Add activation modal state**

At the top of `TeamJourneysPage`, after existing `useState` declarations, add:
```ts
const [activateTarget, setActivateTarget] = useState<TeamMember | null>(null);
const [activating, setActivating] = useState(false);
const [activateError, setActivateError] = useState('');
```

- [ ] **Step 3: Update the data fetch to filter by PREPARATION**

In `useEffect`, change:
```ts
fetchApi<TeamMember[]>('/manager/team')
```
to:
```ts
fetchApi<TeamMember[]>('/manager/team?status=PREPARATION')
```

- [ ] **Step 4: Replace `handleCompleteProbation` and `handleAssignResource` with new handlers**

Remove `handleCompleteProbation` and `handleAssignResource`. Replace with:

```ts
const handleMarkReady = async (userId: string, ready: boolean) => {
    try {
        await fetchApi(`/manager/team/${userId}/ready-for-activation`, {
            method: 'PATCH',
            body: JSON.stringify({ ready }),
        });
        setTeam(prev => prev.map(m => m.id === userId ? { ...m, ready_for_activation: ready } : m));
        if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, ready_for_activation: ready } : prev);
    } catch (err: any) {
        alert(err.message || 'Failed to update status');
    }
};

const handleActivate = async () => {
    if (!activateTarget) return;
    setActivating(true);
    setActivateError('');
    try {
        await fetchApi(`/manager/team/${activateTarget.id}/activate`, { method: 'POST' });
        setTeam(prev => prev.filter(m => m.id !== activateTarget.id));
        if (selectedUser?.id === activateTarget.id) setSelectedUser(null);
        setActivateTarget(null);
    } catch (err: any) {
        setActivateError(err.message || 'Activation failed');
    } finally {
        setActivating(false);
    }
};
```

- [ ] **Step 5: Update the user detail panel**

In the user detail section, replace the "Mark Probation Complete" button and the "Promote to Resource" dropdown section with:

```tsx
{/* Ready for activation toggle */}
<div className="flex items-center gap-3 mt-3">
    <button
        onClick={() => handleMarkReady(selectedUser.id, !selectedUser.ready_for_activation)}
        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            selectedUser.ready_for_activation
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
        }`}
    >
        {selectedUser.ready_for_activation ? '✓ Ready for Activation' : 'Mark as Ready'}
    </button>
    <button
        onClick={() => setActivateTarget(selectedUser)}
        disabled={!selectedUser.ready_for_activation}
        className="text-xs font-medium px-4 py-1.5 rounded-lg border-none bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
        Activate Resource →
    </button>
</div>
```

Update the status badge in the user header from `is_resource` / `probation_completed` to `status` / `ready_for_activation`.

- [ ] **Step 6: Add the confirmation modal**

At the bottom of the component return, before the closing `</div>`:

```tsx
{/* Activation confirmation modal */}
{activateTarget && (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Activate {activateTarget.name} as a Resource?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                This will grant full system access, create a resource record, and notify the user.
                This action can only be reversed by an admin.
            </p>
            {activateError && (
                <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">{activateError}</p>
            )}
            <div className="flex justify-end gap-3">
                <button
                    onClick={() => { setActivateTarget(null); setActivateError(''); }}
                    disabled={activating}
                    className="text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleActivate}
                    disabled={activating}
                    className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-60"
                >
                    {activating ? 'Activating…' : 'Yes, Activate'}
                </button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/settings/team-journeys/page.tsx
git commit -m "feat(web): team journeys page — PREPARATION filter, ready-for-activation toggle, activate modal"
```

---

## Task 12: Resource Screen — Empty State

**Files:**
- Modify: `apps/web/app/resources/page.tsx`

- [ ] **Step 1: Read the current resources page**

```bash
head -80 apps/web/app/resources/page.tsx
```

Locate the empty state block (when `resources.length === 0`). It likely renders a generic "No resources" message.

- [ ] **Step 2: Add preparation count fetch**

Near the top of the component, alongside the existing resources fetch, add a parallel fetch for preparation users:

```ts
const [preparationCount, setPreparationCount] = useState(0);

useEffect(() => {
    // Alongside existing resource fetch
    fetchApi<{ count: number }>('/manager/summary')
        .then(data => {
            // manager/summary gives member_count — we need preparation count specifically.
            // Use the team endpoint filtered by status.
        })
        .catch(() => {});
}, []);
```

Actually, add a dedicated call to get preparation count:
```ts
fetchApi<any[]>('/manager/team?status=PREPARATION')
    .then(data => setPreparationCount(data.length))
    .catch(() => setPreparationCount(0));
```

- [ ] **Step 3: Replace the empty state**

Find the current empty state (when `resources.length === 0` or similar) and replace it with:

```tsx
{resources.length === 0 && (
    <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        </div>
        {preparationCount > 0 ? (
            <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Active Resources Yet</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    You have {preparationCount} user{preparationCount !== 1 ? 's' : ''} currently in preparation.
                    Once they are activated, they will appear here.
                </p>
            </>
        ) : (
            <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Resources</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">No active resources found.</p>
            </>
        )}
    </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/resources/page.tsx
git commit -m "feat(web): resource screen empty state shows preparation user count"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Deploy to production**

```bash
git push
```

Wait for CI/CD pipeline to complete (~5 minutes). Then verify:
```bash
docker ps | grep qc-api  # should show "(healthy)"
curl -s https://api.gebrils.cloud/api/health
```

- [ ] **Step 2: Verify auth endpoints return status**

```bash
# Replace TOKEN with a valid user JWT
curl -s -H "Authorization: Bearer TOKEN" https://api.gebrils.cloud/api/auth/me \
  | python3 -m json.tool | grep -E '"status"|"team_membership"'
```

Expected: `"status": "ACTIVE"` (or `"PREPARATION"`) and `"team_membership_active": true/false`.

- [ ] **Step 3: Verify PREPARATION user is blocked from resources**

Log in as a PREPARATION user. Attempt:
```bash
curl -s -H "Authorization: Bearer PREP_USER_TOKEN" https://api.gebrils.cloud/api/resources
```

Expected: `{"error":"Access restricted based on your account status.","required":["ACTIVE"],"current":"PREPARATION"}`

- [ ] **Step 4: Test full activation flow in the UI**

1. Log in as manager → navigate to `/settings/team-journeys`
2. Confirm only PREPARATION users are listed
3. Select a user → click "Mark as Ready" → confirm badge turns green
4. Click "Activate Resource →" → confirm modal appears
5. Confirm → verify user disappears from the list
6. Log in as the activated user → confirm nav shows full menu
7. Navigate to `/journeys` → confirm title reads "My Development Plan" with "Active" badge
8. Navigate to `/resources` → confirm user appears in the resource list

- [ ] **Step 5: Apply migration 021 after production verification**

Only after confirming migration 020 data is correct in production:

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < database/migrations/021_drop_deprecated_lifecycle_columns.sql
```

- [ ] **Step 6: Final commit — update graphify knowledge graph**

```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
git add graphify-out/
git commit -m "chore: rebuild graphify knowledge graph after lifecycle implementation"
```
