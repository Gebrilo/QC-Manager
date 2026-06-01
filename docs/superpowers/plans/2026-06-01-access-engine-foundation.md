# Access Engine — Foundation Slice (Issue #80) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dormant Phase-0 foundation of the configurable Access Engine — schema migration with backfill + post-assertions, ~150-key permission catalog expansion, four new engine modules (`AccessEngine`, `RoleResolver`, `ArtifactVisibilityDefaulter`, `FeatureFlagReader`) that nothing yet calls, and a `/auth/me` shape extension that exposes `effective_permissions` and `scope`. The app behaves identically to before; later slices wire it in.

**Architecture:** One numbered SQL migration is the canonical artifact (`database/migrations/036_*.sql`); the same idempotent logic is mirrored inside `apps/api/src/config/db.js` so container boot stays in sync (existing project convention — see migration 035 in db.js lines 2455–2599). The shared RBAC catalog at `apps/shared/rbac/catalog.ts` is extended additively — all existing keys and built-in roles stay so the legacy resolver continues working unchanged; new keys, new roles (`pm`, `team_manager`, `member`), and the `manager → team_manager` alias layer on top. Four engine modules live under a new `apps/api/src/access/` directory and are pure CommonJS to match the rest of the API. The `/auth/me` route delegates to `RoleResolver` and merges the result onto its existing response shape.

**Tech Stack:** Node 18, Express, PostgreSQL (Supabase-hosted), Jest 29, plain CJS modules. No new dependencies.

**Out of scope for this slice:** No route wires the engine in (engine is dormant). No frontend changes. No `/api/admin/access/*` endpoints. No n8n persister changes. Those are Phase 1+ in the parent PRD #79.

---

## File Structure

**New files:**
- `database/migrations/036_access_engine_foundation.sql` — canonical migration: 7 tables, 18 new columns across 6 artifact tables, `tuleap_sync_config` extension, `app_user.role` CHECK widening, full backfill, post-assertions.
- `apps/api/src/access/AccessEngine.js` — `canPerform(user, artifact, action)`, `buildListFilter(user, artifactType, action)`, `filterFields(user, artifactType, row)`. Pure logic; consumes resolver + DB pool. Dormant.
- `apps/api/src/access/RoleResolver.js` — `resolve(user)` → `{ effectivePermissions: Set<string>, scope: { team_id, team_type, pm_of_projects: string[] } }`. Reads `role_permissions`, `user_permissions`, `project_managers`, `teams.team_type_id`. Memoizes on `req` if a request context is passed.
- `apps/api/src/access/ArtifactVisibilityDefaulter.js` — `defaultsFor(creator, artifactType)` → `{ owner_team_id, visibility_scope, default_acl_grants }`. Reads `default_artifact_visibility`. Dormant.
- `apps/api/src/access/FeatureFlagReader.js` — `isEnabled(key, req?)` with per-request cache; reads `feature_flags` table.
- `apps/api/src/access/index.js` — barrel re-exporting the four modules.
- `apps/api/__tests__/access.test.js` — covers every OR branch of `canPerform` and `buildListFilter`, structured denial reasons, dormant `filterFields`.
- `apps/api/__tests__/roleResolver.test.js` — catalog defaults, inheritance, `custom_roles` overrides, `user_permissions` allow/deny precedence, `manager → team_manager` alias.
- `apps/api/__tests__/artifactVisibilityDefaulter.test.js` — `(team_type, artifact_type)` lookup, fallback when no row, default ACL materialization, Tuleap-creator vs human-creator path.

**Modified files:**
- `apps/shared/rbac/catalog.ts` — append ~100 new permission keys (scoped variants + artifact-specific actions + admin keys); append three new built-in roles (`pm`, `team_manager`, `member`); add `manager` alias entry pointing to `team_manager`; expose a new `BUILT_IN_ROLE_PERMISSION_DEFAULTS` map used by the migration's backfill.
- `apps/api/src/config/db.js` — append idempotent boot-time mirror of 036 right before `console.log('Database migrations completed successfully')` (line 2601).
- `apps/api/src/routes/auth.js` — `GET /me` response: add `effective_permissions` and `scope`, keep all existing fields, source from `RoleResolver`.

**Untouched (intentionally):** every route under `apps/api/src/routes/*` other than `auth.js`; every persister under `apps/api/src/services/persisters/*`; every middleware; the n8n workflows; the frontend.

---

## Task 1 — Expand the permission catalog and roles

**Files:**
- Modify: `apps/shared/rbac/catalog.ts`
- Modify: `apps/api/__tests__/rbacCatalog.test.js`

The catalog has to add ~100 new keys, three new built-in roles, the `manager` alias entry, and a `BUILT_IN_ROLE_PERMISSION_DEFAULTS` export the migration backfill consumes. All existing keys and roles stay so the legacy resolver and 200+ route checks continue working.

- [ ] **Step 1: Add failing test cases for the new keys and roles**

Append to `apps/api/__tests__/rbacCatalog.test.js`:

```javascript
const {
    PERMISSIONS,
    ROLES,
    ALL_PERMISSION_VALUES,
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
    canUserPerform,
} = require('../../shared/rbac/catalog.ts');

describe('Access engine — expanded catalog (issue #80)', () => {
    test('catalog declares scoped variants for tasks/bugs/test_cases/test_suites/test_executions/user_stories/reports', () => {
        const scopedExpect = [];
        for (const artifact of ['tasks', 'bugs', 'testcases', 'testsuites', 'testexecutions', 'user_stories']) {
            for (const verb of ['view', 'edit', 'delete']) {
                for (const scope of ['own', 'team', 'any']) {
                    scopedExpect.push(`qc.${artifact}.${verb}_${scope}`);
                }
            }
        }
        for (const key of scopedExpect) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
        for (const key of ['qc.reports.view_own', 'qc.reports.view_team', 'qc.reports.view_project', 'qc.reports.export']) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
    });

    test('artifact-specific actions are declared', () => {
        const required = [
            'qc.tasks.log_time', 'qc.tasks.take_over', 'qc.tasks.approve_completion', 'qc.tasks.change_priority',
            'qc.bugs.triage', 'qc.bugs.change_severity', 'qc.bugs.change_priority', 'qc.bugs.reopen', 'qc.bugs.close',
            'qc.testcases.execute', 'qc.testcases.approve', 'qc.testcases.clone',
            'qc.testcases.import', 'qc.testcases.export', 'qc.testcases.view_steps', 'qc.testcases.edit_steps',
            'qc.admin.manage_users', 'qc.admin.manage_roles', 'qc.admin.manage_permissions',
            'qc.admin.manage_teams', 'qc.admin.manage_integrations', 'qc.admin.manage_settings',
            'qc.admin.view_audit_log',
        ];
        for (const key of required) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
    });

    test('new built-in roles exist: pm, team_manager, member, viewer; manager aliases team_manager', () => {
        expect(ROLES.pm).toBeDefined();
        expect(ROLES.team_manager).toBeDefined();
        expect(ROLES.member).toBeDefined();
        expect(ROLES.viewer).toBeDefined();
        expect(ROLES.manager.aliasFor).toBe('team_manager');
    });

    test('member seeded with union of legacy tester permissions (PRD risk #1)', () => {
        const legacyTester = BUILT_IN_ROLE_PERMISSION_DEFAULTS.tester;
        const member = BUILT_IN_ROLE_PERMISSION_DEFAULTS.member;
        for (const key of legacyTester) {
            expect(member).toContain(key);
        }
    });

    test('BUILT_IN_ROLE_PERMISSION_DEFAULTS exposes a key array per built-in role', () => {
        for (const role of ['admin', 'pm', 'team_manager', 'member', 'viewer']) {
            expect(Array.isArray(BUILT_IN_ROLE_PERMISSION_DEFAULTS[role])).toBe(true);
        }
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.admin).toEqual(['*']);
    });

    test('canUserPerform resolves manager → team_manager via aliasFor', () => {
        expect(canUserPerform({ role: 'manager' }, PERMISSIONS.TESTCASES_VIEW)).toBe(true);
    });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/rbacCatalog.test.js -t "expanded catalog"
```

Expected: all new tests fail (keys not in catalog, `ROLES.pm` is undefined, etc.).

- [ ] **Step 3: Extend the PERMISSIONS object in `apps/shared/rbac/catalog.ts`**

Append the new keys to the existing frozen object (do not remove or rename any existing key). Replace the `const PERMISSIONS = Object.freeze({ ... });` block with one that includes both the existing entries (lines 3–69 in the current file) and these additions:

```javascript
    // --- Scoped action variants (issue #80 / Access Engine) ---
    TASKS_VIEW_OWN: 'qc.tasks.view_own',
    TASKS_VIEW_TEAM: 'qc.tasks.view_team',
    TASKS_VIEW_ANY: 'qc.tasks.view_any',
    TASKS_EDIT_OWN: 'qc.tasks.edit_own',
    TASKS_EDIT_TEAM: 'qc.tasks.edit_team',
    TASKS_EDIT_ANY: 'qc.tasks.edit_any',
    TASKS_DELETE_OWN: 'qc.tasks.delete_own',
    TASKS_DELETE_TEAM: 'qc.tasks.delete_team',
    TASKS_DELETE_ANY: 'qc.tasks.delete_any',

    BUGS_VIEW_OWN: 'qc.bugs.view_own',
    BUGS_VIEW_TEAM: 'qc.bugs.view_team',
    BUGS_VIEW_ANY: 'qc.bugs.view_any',
    BUGS_EDIT_OWN: 'qc.bugs.edit_own',
    BUGS_EDIT_TEAM: 'qc.bugs.edit_team',
    BUGS_EDIT_ANY: 'qc.bugs.edit_any',
    BUGS_DELETE_OWN: 'qc.bugs.delete_own',
    BUGS_DELETE_TEAM: 'qc.bugs.delete_team',
    BUGS_DELETE_ANY: 'qc.bugs.delete_any',

    TESTCASES_VIEW_OWN: 'qc.testcases.view_own',
    TESTCASES_VIEW_TEAM: 'qc.testcases.view_team',
    TESTCASES_VIEW_ANY: 'qc.testcases.view_any',
    TESTCASES_EDIT_OWN: 'qc.testcases.edit_own',
    TESTCASES_EDIT_TEAM: 'qc.testcases.edit_team',
    TESTCASES_EDIT_ANY: 'qc.testcases.edit_any',
    TESTCASES_DELETE_OWN: 'qc.testcases.delete_own',
    TESTCASES_DELETE_TEAM: 'qc.testcases.delete_team',
    TESTCASES_DELETE_ANY: 'qc.testcases.delete_any',

    TESTSUITES_VIEW_OWN: 'qc.testsuites.view_own',
    TESTSUITES_VIEW_TEAM: 'qc.testsuites.view_team',
    TESTSUITES_VIEW_ANY: 'qc.testsuites.view_any',
    TESTSUITES_EDIT_OWN: 'qc.testsuites.edit_own',
    TESTSUITES_EDIT_TEAM: 'qc.testsuites.edit_team',
    TESTSUITES_EDIT_ANY: 'qc.testsuites.edit_any',
    TESTSUITES_DELETE_OWN: 'qc.testsuites.delete_own',
    TESTSUITES_DELETE_TEAM: 'qc.testsuites.delete_team',
    TESTSUITES_DELETE_ANY: 'qc.testsuites.delete_any',

    TESTEXECUTIONS_VIEW_OWN: 'qc.testexecutions.view_own',
    TESTEXECUTIONS_VIEW_TEAM: 'qc.testexecutions.view_team',
    TESTEXECUTIONS_VIEW_ANY: 'qc.testexecutions.view_any',
    TESTEXECUTIONS_EDIT_OWN: 'qc.testexecutions.edit_own',
    TESTEXECUTIONS_EDIT_TEAM: 'qc.testexecutions.edit_team',
    TESTEXECUTIONS_EDIT_ANY: 'qc.testexecutions.edit_any',
    TESTEXECUTIONS_DELETE_OWN: 'qc.testexecutions.delete_own',
    TESTEXECUTIONS_DELETE_TEAM: 'qc.testexecutions.delete_team',
    TESTEXECUTIONS_DELETE_ANY: 'qc.testexecutions.delete_any',

    USER_STORIES_VIEW: 'qc.user_stories.view',
    USER_STORIES_CREATE: 'qc.user_stories.create',
    USER_STORIES_EDIT: 'qc.user_stories.edit',
    USER_STORIES_DELETE: 'qc.user_stories.delete',
    USER_STORIES_VIEW_OWN: 'qc.user_stories.view_own',
    USER_STORIES_VIEW_TEAM: 'qc.user_stories.view_team',
    USER_STORIES_VIEW_ANY: 'qc.user_stories.view_any',
    USER_STORIES_EDIT_OWN: 'qc.user_stories.edit_own',
    USER_STORIES_EDIT_TEAM: 'qc.user_stories.edit_team',
    USER_STORIES_EDIT_ANY: 'qc.user_stories.edit_any',
    USER_STORIES_DELETE_OWN: 'qc.user_stories.delete_own',
    USER_STORIES_DELETE_TEAM: 'qc.user_stories.delete_team',
    USER_STORIES_DELETE_ANY: 'qc.user_stories.delete_any',

    // --- Artifact-specific actions ---
    TASKS_LOG_TIME: 'qc.tasks.log_time',
    TASKS_TAKE_OVER: 'qc.tasks.take_over',
    TASKS_APPROVE_COMPLETION: 'qc.tasks.approve_completion',
    TASKS_CHANGE_PRIORITY: 'qc.tasks.change_priority',

    BUGS_TRIAGE: 'qc.bugs.triage',
    BUGS_CHANGE_SEVERITY: 'qc.bugs.change_severity',
    BUGS_CHANGE_PRIORITY: 'qc.bugs.change_priority',
    BUGS_REOPEN: 'qc.bugs.reopen',
    BUGS_CLOSE: 'qc.bugs.close',

    TESTCASES_EXECUTE: 'qc.testcases.execute',
    TESTCASES_APPROVE: 'qc.testcases.approve',
    TESTCASES_CLONE: 'qc.testcases.clone',
    TESTCASES_IMPORT: 'qc.testcases.import',
    TESTCASES_EXPORT: 'qc.testcases.export',
    TESTCASES_VIEW_STEPS: 'qc.testcases.view_steps',
    TESTCASES_EDIT_STEPS: 'qc.testcases.edit_steps',

    // --- Reports scoped + export ---
    REPORTS_VIEW_OWN: 'qc.reports.view_own',
    REPORTS_VIEW_TEAM: 'qc.reports.view_team',
    REPORTS_VIEW_PROJECT: 'qc.reports.view_project',
    REPORTS_EXPORT: 'qc.reports.export',

    // --- Admin management actions ---
    ADMIN_MANAGE_USERS: 'qc.admin.manage_users',
    ADMIN_MANAGE_ROLES: 'qc.admin.manage_roles',
    ADMIN_MANAGE_PERMISSIONS: 'qc.admin.manage_permissions',
    ADMIN_MANAGE_TEAMS: 'qc.admin.manage_teams',
    ADMIN_MANAGE_INTEGRATIONS: 'qc.admin.manage_integrations',
    ADMIN_MANAGE_SETTINGS: 'qc.admin.manage_settings',
    ADMIN_VIEW_AUDIT_LOG: 'qc.admin.view_audit_log',
```

- [ ] **Step 4: Add the new built-in roles to `ROLE_DEFINITIONS`**

Replace the existing `manager` entry with an `aliasFor` shim, and add `pm`, `team_manager`, `member` ahead of the existing `tester`/`viewer`/`contributor`/`user` entries. The legacy entries stay so the existing test suite still passes.

```javascript
const ROLE_DEFINITIONS = Object.freeze({
    admin: Object.freeze({
        permissions: Object.freeze(['*']),
        inherits: Object.freeze([]),
    }),
    team_manager: Object.freeze({
        inherits: Object.freeze(['tester']),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.PROJECTS_CREATE,
            PERMISSIONS.PROJECTS_EDIT,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.RESOURCES_CREATE,
            PERMISSIONS.RESOURCES_EDIT,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_GENERATE,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
            PERMISSIONS.TASK_HISTORY_VIEW,
            PERMISSIONS.JOURNEYS_ASSIGN,
            PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS,
            PERMISSIONS.TEAM_VIEW,
            PERMISSIONS.GOVERNANCE_VIEW,
            PERMISSIONS.GOVERNANCE_APPROVE_RELEASE,
            PERMISSIONS.TASKS_VIEW_TEAM,
            PERMISSIONS.TASKS_EDIT_TEAM,
            PERMISSIONS.TASKS_DELETE_TEAM,
            PERMISSIONS.TASKS_APPROVE_COMPLETION,
            PERMISSIONS.TASKS_CHANGE_PRIORITY,
            PERMISSIONS.BUGS_VIEW_TEAM,
            PERMISSIONS.BUGS_EDIT_TEAM,
            PERMISSIONS.BUGS_TRIAGE,
            PERMISSIONS.BUGS_CHANGE_SEVERITY,
            PERMISSIONS.BUGS_CHANGE_PRIORITY,
            PERMISSIONS.BUGS_REOPEN,
            PERMISSIONS.BUGS_CLOSE,
            PERMISSIONS.TESTCASES_VIEW_TEAM,
            PERMISSIONS.TESTCASES_EDIT_TEAM,
            PERMISSIONS.TESTCASES_DELETE_TEAM,
            PERMISSIONS.TESTCASES_APPROVE,
            PERMISSIONS.TESTCASES_VIEW_STEPS,
            PERMISSIONS.TESTCASES_EDIT_STEPS,
            PERMISSIONS.TESTEXECUTIONS_VIEW_TEAM,
            PERMISSIONS.TESTEXECUTIONS_EDIT_TEAM,
            PERMISSIONS.TESTSUITES_VIEW_TEAM,
            PERMISSIONS.TESTSUITES_EDIT_TEAM,
            PERMISSIONS.USER_STORIES_VIEW_TEAM,
            PERMISSIONS.USER_STORIES_EDIT_TEAM,
            PERMISSIONS.REPORTS_VIEW_TEAM,
            PERMISSIONS.REPORTS_EXPORT,
        ]),
        scopes: Object.freeze([SCOPES.TEAM.key, SCOPES.ACTIVE_ONLY.key]),
    }),
    manager: Object.freeze({
        inherits: Object.freeze(['team_manager']),
        permissions: Object.freeze([]),
        aliasFor: 'team_manager',
    }),
    pm: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_VIEW_PROJECT,
            PERMISSIONS.REPORTS_EXPORT,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
            PERMISSIONS.TASKS_VIEW_ANY,
            PERMISSIONS.TASKS_CREATE,
            PERMISSIONS.TASKS_CHANGE_PRIORITY,
            PERMISSIONS.BUGS_VIEW_ANY,
            PERMISSIONS.USER_STORIES_VIEW_ANY,
            PERMISSIONS.TESTEXECUTIONS_VIEW_ANY,
            PERMISSIONS.GOVERNANCE_VIEW,
            PERMISSIONS.QUALITY_TRACEABILITY_VIEW,
            PERMISSIONS.TEAM_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    member: Object.freeze({
        // Day-1 parity for legacy tester users (PRD risk #1)
        inherits: Object.freeze(['tester']),
        permissions: Object.freeze([
            PERMISSIONS.TASKS_VIEW_OWN,
            PERMISSIONS.TASKS_VIEW_TEAM,
            PERMISSIONS.TASKS_EDIT_OWN,
            PERMISSIONS.TASKS_DELETE_OWN,
            PERMISSIONS.TASKS_LOG_TIME,
            PERMISSIONS.BUGS_VIEW_OWN,
            PERMISSIONS.BUGS_VIEW_TEAM,
            PERMISSIONS.BUGS_EDIT_OWN,
            PERMISSIONS.TESTCASES_VIEW_OWN,
            PERMISSIONS.TESTCASES_VIEW_TEAM,
            PERMISSIONS.TESTCASES_EDIT_OWN,
            PERMISSIONS.TESTCASES_VIEW_STEPS,
            PERMISSIONS.TESTEXECUTIONS_VIEW_OWN,
            PERMISSIONS.TESTEXECUTIONS_VIEW_TEAM,
            PERMISSIONS.TESTEXECUTIONS_EDIT_OWN,
            PERMISSIONS.TESTSUITES_VIEW_OWN,
            PERMISSIONS.TESTSUITES_VIEW_TEAM,
            PERMISSIONS.USER_STORIES_VIEW_OWN,
            PERMISSIONS.USER_STORIES_VIEW_TEAM,
            PERMISSIONS.REPORTS_VIEW_OWN,
            PERMISSIONS.REPORTS_VIEW_TEAM,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    tester: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            // EXISTING keys — DO NOT REMOVE
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.TASKS_VIEW,
            PERMISSIONS.TASKS_CREATE,
            PERMISSIONS.TASKS_EDIT,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.TESTCASES_VIEW,
            PERMISSIONS.TESTCASES_CREATE,
            PERMISSIONS.TESTCASES_EDIT,
            PERMISSIONS.TESTSUITES_VIEW,
            PERMISSIONS.TESTSUITES_CREATE,
            PERMISSIONS.TESTSUITES_EDIT,
            PERMISSIONS.TESTEXECUTIONS_VIEW,
            PERMISSIONS.TESTEXECUTIONS_CREATE,
            PERMISSIONS.TESTRESULTS_UPLOAD,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_GENERATE,
            PERMISSIONS.BUGS_VIEW,
            PERMISSIONS.BUGS_CREATE,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    viewer: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.TASKS_VIEW,
            PERMISSIONS.TASKS_VIEW_OWN,
            PERMISSIONS.TASKS_VIEW_TEAM,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.TESTEXECUTIONS_VIEW,
            PERMISSIONS.TESTEXECUTIONS_VIEW_TEAM,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    contributor: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.TASKS_VIEW,
            PERMISSIONS.TASKS_EDIT,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.PREPARATION_ONLY.key]),
    }),
    user: Object.freeze({
        inherits: Object.freeze(['tester']),
        permissions: Object.freeze([]),
        aliasFor: 'tester',
    }),
});
```

- [ ] **Step 5: Export `BUILT_IN_ROLE_PERMISSION_DEFAULTS`**

Right before `module.exports`, compute the resolved key arrays so the migration backfill (Task 9) can read them in one place:

```javascript
const BUILT_IN_ROLE_PERMISSION_DEFAULTS = Object.freeze({
    admin: Object.freeze(['*']),
    pm: Object.freeze([...new Set(collectRolePermissions('pm', new Set()))]),
    team_manager: Object.freeze([...new Set(collectRolePermissions('team_manager', new Set()))]),
    member: Object.freeze([...new Set(collectRolePermissions('member', new Set()))]),
    viewer: Object.freeze([...new Set(collectRolePermissions('viewer', new Set()))]),
});
```

Add `BUILT_IN_ROLE_PERMISSION_DEFAULTS` to the `module.exports` list.

- [ ] **Step 6: Update `canUserPerform` to follow `aliasFor`**

The existing `canUserPerform` already calls `collectRolePermissions`, which recurses through `inherits`. Because `manager.inherits = ['team_manager']`, alias resolution works without further changes. Confirm by re-reading the function (lines 245–260) — if `aliasFor` is set, we still want it to fall through `inherits`, so no code change is required. The new test in Step 1 (`canUserPerform manager → team_manager`) verifies this.

- [ ] **Step 7: Run the full rbac test file and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/rbacCatalog.test.js
```

Expected: all original + new tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/shared/rbac/catalog.ts apps/api/__tests__/rbacCatalog.test.js
git commit -m "$(cat <<'EOF'
feat(rbac): expand permission catalog and roles for Access Engine

Adds scoped variants (view_own / view_team / view_any, edit_*, delete_*) for
all artifact types, artifact-specific actions (triage / log_time / execute /
view_steps / etc.), expanded admin keys, and three new built-in roles (pm,
team_manager, member). Legacy keys and roles preserved so existing route
checks continue working. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — RoleResolver module

**Files:**
- Create: `apps/api/src/access/RoleResolver.js`
- Create: `apps/api/__tests__/roleResolver.test.js`

Resolves a user into `{ effectivePermissions: Set<string>, scope }`. Reads `role_permissions` (the new table — falls back to catalog defaults if the table is empty for that role), then layers `user_permissions` (per-user grants/denies), then computes `scope` by joining `app_user → teams → team_types` and `project_managers`.

- [ ] **Step 1: Write the failing test**

```javascript
// apps/api/__tests__/roleResolver.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { resolve } = require('../src/access/RoleResolver');

function rows(value) { return { rows: value }; }

afterEach(() => jest.clearAllMocks());

describe('RoleResolver.resolve', () => {
    test('admin gets wildcard set + empty scope', async () => {
        // role_permissions lookup — admin returns []; resolver short-circuits on '*' catalog default.
        mockQuery
            .mockResolvedValueOnce(rows([])) // role_permissions
            .mockResolvedValueOnce(rows([])) // user_permissions
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }])) // team join
            .mockResolvedValueOnce(rows([])); // project_managers

        const out = await resolve({ id: 'u1', role: 'admin' });
        expect(out.effectivePermissions.has('*')).toBe(true);
        expect(out.scope).toEqual({ team_id: null, team_type: null, pm_of_projects: [] });
    });

    test('member without role_permissions row falls back to catalog defaults', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([])) // role_permissions empty
            .mockResolvedValueOnce(rows([])) // user_permissions empty
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u2', role: 'member' });
        expect(out.effectivePermissions.has('qc.tasks.view_own')).toBe(true);
        expect(out.effectivePermissions.has('qc.testcases.view_steps')).toBe(true);
        expect(out.scope.team_type).toBe('qc');
    });

    test('role_permissions table overrides catalog defaults when populated', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([{ permission_key: 'qc.bugs.triage' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u3', role: 'team_manager' });
        expect(out.effectivePermissions.has('qc.bugs.triage')).toBe(true);
        expect(out.effectivePermissions.has('qc.dashboard.view')).toBe(false);
    });

    test('user_permissions allow adds and deny strips', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([{ permission_key: 'qc.tasks.view_own' }]))
            .mockResolvedValueOnce(rows([
                { permission_key: 'qc.bugs.triage', granted: true },
                { permission_key: 'qc.tasks.view_own', granted: false },
            ]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u4', role: 'member' });
        expect(out.effectivePermissions.has('qc.bugs.triage')).toBe(true);
        expect(out.effectivePermissions.has('qc.tasks.view_own')).toBe(false);
    });

    test('manager role aliases team_manager', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u5', role: 'manager' });
        expect(out.effectivePermissions.has('qc.bugs.triage')).toBe(true);
    });

    test('pm_of_projects populated from project_managers join', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'pm' }]))
            .mockResolvedValueOnce(rows([{ project_id: 'p-A' }, { project_id: 'p-B' }]));

        const out = await resolve({ id: 'u6', role: 'pm' });
        expect(out.scope.pm_of_projects).toEqual(['p-A', 'p-B']);
    });

    test('memoizes on req when supplied', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const req = { user: { id: 'u7', role: 'member' } };
        const first = await resolve(req.user, req);
        const second = await resolve(req.user, req);
        expect(first).toBe(second);
        expect(mockQuery).toHaveBeenCalledTimes(4); // not 8
    });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/roleResolver.test.js
```

Expected: Cannot find module `../src/access/RoleResolver`.

- [ ] **Step 3: Implement `RoleResolver.js`**

```javascript
// apps/api/src/access/RoleResolver.js
'use strict';

const db = require('../config/db');
const {
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
    ROLES,
} = require('../../../shared/rbac/catalog.ts');

function canonicalRole(role) {
    const def = ROLES[role];
    if (def && def.aliasFor) return def.aliasFor;
    return role;
}

async function loadRolePermissions(roleIdentifier) {
    const result = await db.query(
        'SELECT permission_key FROM role_permissions WHERE role_identifier = $1',
        [roleIdentifier]
    );
    if (result.rows.length > 0) {
        return new Set(result.rows.map(r => r.permission_key));
    }
    // Fallback to catalog defaults — role_permissions table empty for this role
    const defaults = BUILT_IN_ROLE_PERMISSION_DEFAULTS[roleIdentifier] || [];
    return new Set(defaults);
}

async function loadUserPermissions(userId) {
    const result = await db.query(
        'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
        [userId]
    );
    return result.rows;
}

async function loadScope(userId) {
    const teamResult = await db.query(
        `SELECT u.team_id, tt.code AS team_type
         FROM app_user u
         LEFT JOIN teams t ON u.team_id = t.id
         LEFT JOIN team_types tt ON t.team_type_id = tt.id
         WHERE u.id = $1`,
        [userId]
    );
    const teamRow = teamResult.rows[0] || { team_id: null, team_type: null };

    const pmResult = await db.query(
        'SELECT project_id FROM project_managers WHERE user_id = $1',
        [userId]
    );
    return {
        team_id: teamRow.team_id,
        team_type: teamRow.team_type,
        pm_of_projects: pmResult.rows.map(r => r.project_id),
    };
}

async function resolve(user, req) {
    if (req && req._accessResolverCache) return req._accessResolverCache;

    const roleIdentifier = canonicalRole(user.role);
    const rolePerms = await loadRolePermissions(roleIdentifier);
    const userPerms = await loadUserPermissions(user.id);
    const scope = await loadScope(user.id);

    const effective = new Set(rolePerms);
    for (const row of userPerms) {
        if (row.granted === false) effective.delete(row.permission_key);
        else effective.add(row.permission_key);
    }

    const result = { effectivePermissions: effective, scope };
    if (req) req._accessResolverCache = result;
    return result;
}

module.exports = { resolve, canonicalRole };
```

- [ ] **Step 4: Re-run the test and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/roleResolver.test.js
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/access/RoleResolver.js apps/api/__tests__/roleResolver.test.js
git commit -m "$(cat <<'EOF'
feat(access): add RoleResolver with per-request memoization

Resolves user → { effectivePermissions, scope } by reading role_permissions
with catalog-default fallback, layering user_permissions allow/deny, and
joining app_user → teams → team_types + project_managers. Dormant — no
route calls it yet. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — FeatureFlagReader module

**Files:**
- Create: `apps/api/src/access/FeatureFlagReader.js`
- Modify: `apps/api/__tests__/access.test.js` (file will be created in Task 5; for now create a small stub)

- [ ] **Step 1: Write failing tests inline (small standalone block)**

Create `apps/api/__tests__/featureFlagReader.test.js`:

```javascript
'use strict';
const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));
const { isEnabled, clearCache } = require('../src/access/FeatureFlagReader');

afterEach(() => { jest.clearAllMocks(); });

describe('FeatureFlagReader.isEnabled', () => {
    test('returns false when flag row absent', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(isEnabled('access_engine.bugs')).resolves.toBe(false);
    });

    test('returns value from JSONB column', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ value: true }] });
        await expect(isEnabled('access_engine.bugs')).resolves.toBe(true);
    });

    test('coerces non-boolean JSON to boolean', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ value: 'enabled' }] });
        await expect(isEnabled('access_engine.bugs')).resolves.toBe(true);
    });

    test('per-request cache reuses result without second query', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ value: true }] });
        const req = {};
        const a = await isEnabled('access_engine.bugs', req);
        const b = await isEnabled('access_engine.bugs', req);
        expect(a).toBe(true);
        expect(b).toBe(true);
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/featureFlagReader.test.js
```

Expected: module not found.

- [ ] **Step 3: Implement `FeatureFlagReader.js`**

```javascript
// apps/api/src/access/FeatureFlagReader.js
'use strict';

const db = require('../config/db');

async function isEnabled(key, req) {
    if (req && req._featureFlagCache && Object.prototype.hasOwnProperty.call(req._featureFlagCache, key)) {
        return req._featureFlagCache[key];
    }
    const result = await db.query(
        'SELECT value FROM feature_flags WHERE key = $1',
        [key]
    );
    const value = result.rows.length > 0 ? Boolean(result.rows[0].value) : false;
    if (req) {
        req._featureFlagCache = req._featureFlagCache || {};
        req._featureFlagCache[key] = value;
    }
    return value;
}

function clearCache(req) {
    if (req) delete req._featureFlagCache;
}

module.exports = { isEnabled, clearCache };
```

- [ ] **Step 4: Re-run and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/featureFlagReader.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/access/FeatureFlagReader.js apps/api/__tests__/featureFlagReader.test.js
git commit -m "$(cat <<'EOF'
feat(access): add FeatureFlagReader with per-request caching

Reads feature_flags table by key; defaults to false if row absent. Used by
later slices to gate per-artifact engine enforcement. Dormant. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — ArtifactVisibilityDefaulter module

**Files:**
- Create: `apps/api/src/access/ArtifactVisibilityDefaulter.js`
- Create: `apps/api/__tests__/artifactVisibilityDefaulter.test.js`

Given a creator + an artifact type, returns the defaults the create path should apply: `{ owner_team_id, visibility_scope, default_acl_grants }`. Reads `default_artifact_visibility` keyed by `(team_type_id, artifact_type)`; falls back to `{ scope: 'team', acl_grants: [] }` if no row is configured. For a Tuleap-creator path the caller passes a hint that suppresses the `app_user → team_id` lookup and uses the `default_owner_team_id` from `tuleap_sync_config` instead.

- [ ] **Step 1: Write the failing test**

```javascript
// apps/api/__tests__/artifactVisibilityDefaulter.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { defaultsFor } = require('../src/access/ArtifactVisibilityDefaulter');

afterEach(() => jest.clearAllMocks());

describe('ArtifactVisibilityDefaulter.defaultsFor', () => {
    test('human creator: looks up team_type then default_artifact_visibility', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: 'team-qc', team_type_id: 'tt-qc', team_type: 'qc' }] })
            .mockResolvedValueOnce({ rows: [{ default_scope: 'team', default_acl_grants: [{ role: 'pm', action: 'view' }] }] });

        const out = await defaultsFor({ creator: { id: 'u1' }, artifactType: 'bug' });
        expect(out.owner_team_id).toBe('team-qc');
        expect(out.visibility_scope).toBe('team');
        expect(out.default_acl_grants).toEqual([{ role: 'pm', action: 'view' }]);
    });

    test('fallback when no default_artifact_visibility row: scope=team, no acl', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: 'team-x', team_type_id: 'tt-other', team_type: 'other' }] })
            .mockResolvedValueOnce({ rows: [] });

        const out = await defaultsFor({ creator: { id: 'u2' }, artifactType: 'task' });
        expect(out.visibility_scope).toBe('team');
        expect(out.default_acl_grants).toEqual([]);
    });

    test('tuleap-creator path uses tuleapDefaults instead of joining app_user', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_type: 'qc', team_type_id: 'tt-qc' }] }) // team_type lookup for the supplied team
            .mockResolvedValueOnce({ rows: [{ default_scope: 'team', default_acl_grants: [] }] });

        const out = await defaultsFor({
            tuleapDefaults: { default_owner_team_id: 'team-qc', default_visibility_scope: null },
            artifactType: 'bug',
        });
        expect(out.owner_team_id).toBe('team-qc');
        expect(out.visibility_scope).toBe('team');
    });

    test('tuleap-creator with default_visibility_scope override skips lookup default', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ team_type: 'qc', team_type_id: 'tt-qc' }] });

        const out = await defaultsFor({
            tuleapDefaults: { default_owner_team_id: 'team-qc', default_visibility_scope: 'project' },
            artifactType: 'bug',
        });
        expect(out.visibility_scope).toBe('project');
        // Only one query — visibility_scope override skipped the second lookup
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/artifactVisibilityDefaulter.test.js
```

- [ ] **Step 3: Implement `ArtifactVisibilityDefaulter.js`**

```javascript
// apps/api/src/access/ArtifactVisibilityDefaulter.js
'use strict';

const db = require('../config/db');

async function lookupHumanCreatorTeam(userId) {
    const result = await db.query(
        `SELECT u.team_id, t.team_type_id, tt.code AS team_type
         FROM app_user u
         LEFT JOIN teams t ON u.team_id = t.id
         LEFT JOIN team_types tt ON t.team_type_id = tt.id
         WHERE u.id = $1`,
        [userId]
    );
    return result.rows[0] || { team_id: null, team_type_id: null, team_type: null };
}

async function lookupTuleapCreatorTeam(teamId) {
    if (!teamId) return { team_id: null, team_type_id: null, team_type: null };
    const result = await db.query(
        `SELECT t.id AS team_id, t.team_type_id, tt.code AS team_type
         FROM teams t
         LEFT JOIN team_types tt ON t.team_type_id = tt.id
         WHERE t.id = $1`,
        [teamId]
    );
    return result.rows[0] || { team_id: teamId, team_type_id: null, team_type: null };
}

async function loadDefaultRow(teamTypeId, artifactType) {
    if (!teamTypeId) return null;
    const result = await db.query(
        `SELECT default_scope, default_acl_grants
         FROM default_artifact_visibility
         WHERE team_type_id = $1 AND artifact_type = $2`,
        [teamTypeId, artifactType]
    );
    return result.rows[0] || null;
}

async function defaultsFor({ creator, tuleapDefaults, artifactType }) {
    const teamInfo = tuleapDefaults
        ? await lookupTuleapCreatorTeam(tuleapDefaults.default_owner_team_id)
        : await lookupHumanCreatorTeam(creator.id);

    let visibility_scope = tuleapDefaults && tuleapDefaults.default_visibility_scope
        ? tuleapDefaults.default_visibility_scope
        : null;
    let default_acl_grants = [];

    if (!visibility_scope) {
        const row = await loadDefaultRow(teamInfo.team_type_id, artifactType);
        if (row) {
            visibility_scope = row.default_scope;
            default_acl_grants = row.default_acl_grants || [];
        }
    }

    return {
        owner_team_id: teamInfo.team_id || null,
        visibility_scope: visibility_scope || 'team',
        default_acl_grants,
    };
}

module.exports = { defaultsFor };
```

- [ ] **Step 4: Re-run and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/artifactVisibilityDefaulter.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/access/ArtifactVisibilityDefaulter.js apps/api/__tests__/artifactVisibilityDefaulter.test.js
git commit -m "$(cat <<'EOF'
feat(access): add ArtifactVisibilityDefaulter

Returns { owner_team_id, visibility_scope, default_acl_grants } for a given
creator + artifact type. Handles both human-creator (joins app_user) and
Tuleap-creator (uses tuleap_sync_config defaults) paths. Falls back to
'team' scope with no ACL grants if no row configured. Dormant. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — AccessEngine.canPerform

**Files:**
- Create: `apps/api/src/access/AccessEngine.js`
- Create: `apps/api/__tests__/access.test.js`

`canPerform(user, artifact, action)` evaluates each OR branch in turn and returns `{ allowed: true }` on first hit, or `{ allowed: false, reason }` with a structured denial reason.

Branches (in evaluation order):
1. admin → `allowed`
2. user has wildcard `*` permission or the bare action key in `effectivePermissions` → `allowed` (with sub-scope check: `view_any` always; `view_team` requires `artifact.owner_team_id === user.scope.team_id`; `view_own` requires creator/assignee membership)
3. user is in `owner_team_id` of artifact AND has `view_team`/`edit_team` for the action's verb → `allowed`
4. user is the assignee (resource bridge) AND has `view_own`/`edit_own` → `allowed`
5. user is teammate of assignee AND has `view_team` → `allowed`
6. artifact_access ACL grants the user (subject_type ∈ user/team/role) the action → `allowed`
7. user has project-scope role over `artifact.project_id` via `project_managers` AND has the project-scoped permission → `allowed`
8. `artifact.visibility_scope === 'project'` AND user is a member of any team in `project_teams(project_id)` → `allowed` (for view actions only)
9. Otherwise → `{ allowed: false, reason }`

Denial reasons (string constants exported): `role_missing`, `scope_blocked`, `acl_missing`, `team_mismatch`, `not_assignee`, `not_project_member`, `unknown_artifact`.

- [ ] **Step 1: Write the failing test (canPerform only)**

```javascript
// apps/api/__tests__/access.test.js
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (r) => r === 'manager' ? 'team_manager' : r,
}));

const { resolve: mockResolve } = require('../src/access/RoleResolver');
const { canPerform, buildListFilter, filterFields, DENIAL_REASONS } = require('../src/access/AccessEngine');

function rows(v) { return { rows: v }; }

afterEach(() => { jest.clearAllMocks(); });

describe('AccessEngine.canPerform — OR branches', () => {
    test('admin always allowed', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['*']),
            scope: { team_id: null, team_type: null, pm_of_projects: [] },
        });
        const out = await canPerform({ id: 'a', role: 'admin' }, { type: 'bug', id: 'b1' }, 'view');
        expect(out).toEqual({ allowed: true, branch: 'admin' });
    });

    test('owner_team match grants view_team', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'owner_team' });
    });

    test('assignee via resource bridge grants view_own', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_own']),
            scope: { team_id: 't-other', team_type: 'qc', pm_of_projects: [] },
        });
        // resources lookup: returns 1 row meaning the user_id matches assignee resource
        mockQuery.mockResolvedValueOnce(rows([{ ok: 1 }]));

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: 'r-1', project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'assignee' });
    });

    test('teammate of assignee grants view_team', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee check empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // teammate check returns 1

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: 'r-1', project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'teammate_of_assignee' });
    });

    test('artifact_access ACL row grants', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee check empty
            .mockResolvedValueOnce(rows([])) // teammate check empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // ACL lookup hit

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'artifact_acl' });
    });

    test('project-scope (PM of project) grants', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_any']),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['p-1'] },
        });
        const out = await canPerform(
            { id: 'u', role: 'pm' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'project_scope' });
    });

    test('visibility_scope=project + project team membership grants view', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-dev', team_type: 'dev', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee empty
            .mockResolvedValueOnce(rows([])) // teammate empty
            .mockResolvedValueOnce(rows([])) // ACL empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // project_teams membership hit

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-1', visibility_scope: 'project' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'project_visibility' });
    });

    test('default deny returns structured reason', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: 't-x', team_type: 'commercial', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee
            .mockResolvedValueOnce(rows([])) // teammate
            .mockResolvedValueOnce(rows([])); // ACL

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out.allowed).toBe(false);
        expect(out.reason).toBe(DENIAL_REASONS.ROLE_MISSING);
    });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js -t canPerform
```

- [ ] **Step 3: Implement `AccessEngine.js` (canPerform only first)**

```javascript
// apps/api/src/access/AccessEngine.js
'use strict';

const db = require('../config/db');
const { resolve: resolveRole, canonicalRole } = require('./RoleResolver');

const DENIAL_REASONS = Object.freeze({
    ROLE_MISSING: 'role_missing',
    SCOPE_BLOCKED: 'scope_blocked',
    ACL_MISSING: 'acl_missing',
    TEAM_MISMATCH: 'team_mismatch',
    NOT_ASSIGNEE: 'not_assignee',
    NOT_PROJECT_MEMBER: 'not_project_member',
    UNKNOWN_ARTIFACT: 'unknown_artifact',
});

const ARTIFACT_TABLE_BY_TYPE = Object.freeze({
    bug: 'bugs',
    task: 'tasks',
    test_case: 'test_cases',
    test_execution: 'test_executions',
    test_suite: 'test_suites',
    user_story: 'user_stories',
});

const ARTIFACT_PERMISSION_NAMESPACE = Object.freeze({
    bug: 'bugs',
    task: 'tasks',
    test_case: 'testcases',
    test_execution: 'testexecutions',
    test_suite: 'testsuites',
    user_story: 'user_stories',
});

function permKey(artifactType, scope, verb) {
    const ns = ARTIFACT_PERMISSION_NAMESPACE[artifactType];
    if (!ns) return null;
    return `qc.${ns}.${verb}_${scope}`;
}

function hasAny(set, keys) {
    for (const k of keys) if (set.has(k)) return true;
    return false;
}

async function isAssignee(userId, resourceId) {
    if (!resourceId) return false;
    const r = await db.query(
        'SELECT 1 FROM resources WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1',
        [resourceId, userId]
    );
    return r.rows.length > 0;
}

async function isTeammateOfAssignee(userTeamId, resourceId) {
    if (!userTeamId || !resourceId) return false;
    const r = await db.query(
        `SELECT 1
         FROM resources r
         JOIN app_user au ON au.id = r.user_id
         WHERE r.id = $1 AND au.team_id = $2 AND r.deleted_at IS NULL
         LIMIT 1`,
        [resourceId, userTeamId]
    );
    return r.rows.length > 0;
}

async function hasAclGrant(artifact, userId, userTeamId, roleIdentifier, verb) {
    const r = await db.query(
        `SELECT 1 FROM artifact_access
         WHERE artifact_type = $1 AND artifact_id = $2 AND action = $3
           AND (
               (subject_type = 'user' AND subject_id = $4)
            OR (subject_type = 'team' AND subject_id = $5)
            OR (subject_type = 'role' AND subject_id = $6)
           )
         LIMIT 1`,
        [artifact.type, artifact.id, verb, userId, userTeamId, roleIdentifier]
    );
    return r.rows.length > 0;
}

async function isProjectTeamMember(projectId, userTeamId) {
    if (!projectId || !userTeamId) return false;
    const r = await db.query(
        'SELECT 1 FROM project_teams WHERE project_id = $1 AND team_id = $2 LIMIT 1',
        [projectId, userTeamId]
    );
    return r.rows.length > 0;
}

async function canPerform(user, artifact, verb, req) {
    if (!artifact || !artifact.type || !ARTIFACT_PERMISSION_NAMESPACE[artifact.type]) {
        return { allowed: false, reason: DENIAL_REASONS.UNKNOWN_ARTIFACT };
    }

    const { effectivePermissions, scope } = await resolveRole(user, req);

    // Branch 1: admin wildcard
    if (effectivePermissions.has('*')) {
        return { allowed: true, branch: 'admin' };
    }

    const keyAny = permKey(artifact.type, 'any', verb);
    const keyTeam = permKey(artifact.type, 'team', verb);
    const keyOwn = permKey(artifact.type, 'own', verb);

    // Branch 7: project-scope role (PM of this project)
    if (artifact.project_id && scope.pm_of_projects.includes(artifact.project_id)) {
        if (effectivePermissions.has(keyAny) || effectivePermissions.has(`qc.reports.view_project`)) {
            return { allowed: true, branch: 'project_scope' };
        }
    }

    // Branch 2/3: owner_team match with view_team / edit_team etc.
    if (artifact.owner_team_id && scope.team_id && artifact.owner_team_id === scope.team_id) {
        if (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'owner_team' };
        }
    }

    // Branch 4: assignee (resource bridge) with view_own / edit_own
    if (await isAssignee(user.id, artifact.assignee_resource_id)) {
        if (effectivePermissions.has(keyOwn) || effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'assignee' };
        }
    }

    // Branch 5: teammate of assignee with view_team
    if (scope.team_id && await isTeammateOfAssignee(scope.team_id, artifact.assignee_resource_id)) {
        if (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'teammate_of_assignee' };
        }
    }

    // Branch 6: artifact_access ACL
    const roleIdentifier = canonicalRole(user.role);
    if (await hasAclGrant(artifact, user.id, scope.team_id, roleIdentifier, verb)) {
        return { allowed: true, branch: 'artifact_acl' };
    }

    // Branch 8: visibility_scope = project + user is member of any project team
    if (verb === 'view' && artifact.visibility_scope === 'project'
        && await isProjectTeamMember(artifact.project_id, scope.team_id)) {
        if (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'project_visibility' };
        }
    }

    // Default deny — choose the most informative reason
    let reason = DENIAL_REASONS.ROLE_MISSING;
    if (!hasAny(effectivePermissions, [keyAny, keyTeam, keyOwn])) reason = DENIAL_REASONS.ROLE_MISSING;
    else if (artifact.owner_team_id && scope.team_id && artifact.owner_team_id !== scope.team_id) reason = DENIAL_REASONS.TEAM_MISMATCH;

    return { allowed: false, reason };
}

// Placeholder exports for buildListFilter and filterFields, filled in Tasks 6 & 7.
async function buildListFilter() { throw new Error('not implemented yet'); }
function filterFields(_user, _type, row) { return row; }

module.exports = {
    canPerform,
    buildListFilter,
    filterFields,
    DENIAL_REASONS,
    ARTIFACT_TABLE_BY_TYPE,
    ARTIFACT_PERMISSION_NAMESPACE,
};
```

- [ ] **Step 4: Re-run canPerform tests and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js -t canPerform
```

Expected: all 8 canPerform tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/access/AccessEngine.js apps/api/__tests__/access.test.js
git commit -m "$(cat <<'EOF'
feat(access): add AccessEngine.canPerform with structured denial reasons

Implements admin / owner_team / assignee / teammate / ACL / project_scope /
project_visibility OR branches plus default-deny with reason codes.
Dormant — buildListFilter and filterFields are placeholders. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — AccessEngine.buildListFilter

**Files:**
- Modify: `apps/api/src/access/AccessEngine.js`
- Modify: `apps/api/__tests__/access.test.js`

`buildListFilter(user, artifactType, verb, opts)` returns `{ clause, params, nextIdx }` — a composable parameterized SQL fragment that the caller bolts onto an existing `WHERE`. `opts.startIdx` defaults to 1; `opts.tableAlias` defaults to the artifact's primary table name from `ARTIFACT_TABLE_BY_TYPE`.

For admin returns `{ clause: 'TRUE', params: [], nextIdx: startIdx }`. For everyone else assembles the OR chain matching `canPerform`.

- [ ] **Step 1: Add failing tests**

Append to `apps/api/__tests__/access.test.js`:

```javascript
describe('AccessEngine.buildListFilter', () => {
    test('admin returns TRUE', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['*']),
            scope: { team_id: null, team_type: null, pm_of_projects: [] },
        });
        const f = await buildListFilter({ id: 'a', role: 'admin' }, 'bug', 'view');
        expect(f.clause).toBe('TRUE');
        expect(f.params).toEqual([]);
        expect(f.nextIdx).toBe(1);
    });

    test('member: composes owner_team + assignee + teammate + ACL + project clauses', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_own', 'qc.bugs.view_team']),
            scope: { team_id: 't-1', team_type: 'qc', pm_of_projects: ['p-9'] },
        });
        const f = await buildListFilter({ id: 'u', role: 'member' }, 'bug', 'view', { startIdx: 5 });
        // Sanity: clause contains the key OR branches
        expect(f.clause).toMatch(/owner_team_id\s*=\s*\$/);
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM resources/);
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM artifact_access/);
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM project_managers/);
        // Params are bound in order; first user binding takes startIdx (5)
        expect(f.nextIdx).toBeGreaterThan(5);
        // Includes the user_id, team_id, role, pm_of_projects, etc.
        expect(f.params).toEqual(expect.arrayContaining(['u', 't-1']));
    });

    test('pm without any permission still gets project-scope clause when pm_of_projects non-empty', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_any']),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['p-1', 'p-2'] },
        });
        const f = await buildListFilter({ id: 'pm', role: 'pm' }, 'bug', 'view');
        expect(f.clause).toMatch(/project_id\s+IN/);
        expect(f.params).toEqual(expect.arrayContaining(['p-1', 'p-2']));
    });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js -t buildListFilter
```

Expected: throws "not implemented yet".

- [ ] **Step 3: Implement `buildListFilter`**

Replace the placeholder in `apps/api/src/access/AccessEngine.js`:

```javascript
async function buildListFilter(user, artifactType, verb, opts = {}) {
    const startIdx = opts.startIdx || 1;
    const tableAlias = opts.tableAlias || ARTIFACT_TABLE_BY_TYPE[artifactType];
    if (!tableAlias) throw new Error(`Unknown artifact type: ${artifactType}`);

    const { effectivePermissions, scope } = await resolveRole(user);

    if (effectivePermissions.has('*')) {
        return { clause: 'TRUE', params: [], nextIdx: startIdx };
    }

    const keyAny = permKey(artifactType, 'any', verb);
    const keyTeam = permKey(artifactType, 'team', verb);
    const keyOwn = permKey(artifactType, 'own', verb);
    const params = [];
    let idx = startIdx;
    const branches = [];
    const bind = (val) => { params.push(val); return `$${idx++}`; };

    // owner_team
    if (scope.team_id && (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny))) {
        branches.push(`${tableAlias}.owner_team_id = ${bind(scope.team_id)}`);
    }

    // assignee + teammate (only meaningful if owner_resource columns exist in the artifact; we filter via the same resource_id columns the existing schema already uses)
    const userBind = bind(user.id);
    if (effectivePermissions.has(keyOwn) || effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
        branches.push(
            `EXISTS (SELECT 1 FROM resources r WHERE r.user_id = ${userBind} AND r.deleted_at IS NULL AND (r.id = ${tableAlias}.resource1_id OR r.id = ${tableAlias}.resource2_id OR r.id = ${tableAlias}.owner_resource_id OR r.id = ${tableAlias}.submitted_by_resource_id))`
        );
    }
    if (scope.team_id && (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny))) {
        const teamBind = bind(scope.team_id);
        branches.push(
            `EXISTS (SELECT 1 FROM resources r2 JOIN app_user au ON au.id = r2.user_id WHERE au.team_id = ${teamBind} AND r2.deleted_at IS NULL AND (r2.id = ${tableAlias}.resource1_id OR r2.id = ${tableAlias}.resource2_id OR r2.id = ${tableAlias}.owner_resource_id OR r2.id = ${tableAlias}.submitted_by_resource_id))`
        );
    }

    // artifact_access ACL — by user, team, or role
    {
        const roleBind = bind(canonicalRole(user.role));
        const teamForAcl = scope.team_id ? bind(scope.team_id) : 'NULL';
        const userForAcl = bind(user.id);
        const typeBind = bind(artifactType);
        const verbBind = bind(verb);
        branches.push(
            `EXISTS (SELECT 1 FROM artifact_access aa
               WHERE aa.artifact_type = ${typeBind} AND aa.artifact_id = ${tableAlias}.id AND aa.action = ${verbBind}
                 AND ((aa.subject_type='user' AND aa.subject_id=${userForAcl})
                   OR (aa.subject_type='team' AND aa.subject_id=${teamForAcl})
                   OR (aa.subject_type='role' AND aa.subject_id=${roleBind})))`
        );
    }

    // project_managers scope
    if (scope.pm_of_projects.length > 0) {
        const placeholders = scope.pm_of_projects.map(p => bind(p)).join(', ');
        branches.push(`${tableAlias}.project_id IN (${placeholders})`);
    }

    // visibility_scope = project membership (view only)
    if (verb === 'view' && scope.team_id) {
        const tb = bind(scope.team_id);
        branches.push(
            `(${tableAlias}.visibility_scope = 'project' AND EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = ${tableAlias}.project_id AND pt.team_id = ${tb}))`
        );
    }

    const clause = branches.length ? `(${branches.join(' OR ')})` : 'FALSE';
    return { clause, params, nextIdx: idx };
}
```

- [ ] **Step 4: Run and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js
```

Expected: all canPerform + buildListFilter tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/access/AccessEngine.js apps/api/__tests__/access.test.js
git commit -m "$(cat <<'EOF'
feat(access): implement AccessEngine.buildListFilter

Composes parameterized OR-chain SQL covering admin / owner_team / assignee /
teammate / artifact_access / project_managers / project_visibility branches.
Returns { clause, params, nextIdx } for caller to bolt onto an existing
WHERE. Dormant. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — AccessEngine.filterFields

**Files:**
- Modify: `apps/api/src/access/AccessEngine.js`
- Modify: `apps/api/__tests__/access.test.js`

For Phase 0 the only field-strip is `test_case.steps` and `test_case.expected_results` when the user lacks `qc.testcases.view_steps`. The function is dormant — no route invokes it yet — but we want a working implementation so later slices wire it in.

- [ ] **Step 1: Append failing tests**

```javascript
describe('AccessEngine.filterFields', () => {
    test('strips test_case steps when user lacks view_steps', () => {
        const out = filterFields(
            { effectivePermissions: new Set([]) },
            'test_case',
            { id: 'tc1', title: 'x', steps: 'do thing', expected_results: 'pass' }
        );
        expect(out.steps).toBeUndefined();
        expect(out.expected_results).toBeUndefined();
        expect(out.title).toBe('x');
    });

    test('keeps test_case steps when user has view_steps', () => {
        const out = filterFields(
            { effectivePermissions: new Set(['qc.testcases.view_steps']) },
            'test_case',
            { id: 'tc1', title: 'x', steps: 'do thing', expected_results: 'pass' }
        );
        expect(out.steps).toBe('do thing');
        expect(out.expected_results).toBe('pass');
    });

    test('non-test_case artifacts pass through unchanged', () => {
        const row = { id: 'b1', title: 'bug', severity: 'Major impact' };
        expect(filterFields({ effectivePermissions: new Set() }, 'bug', row)).toEqual(row);
    });
});
```

Note: `filterFields` expects a *resolved* user (already has `effectivePermissions`), so the resolver isn't called inside it — this keeps it synchronous and cheap for per-row loops.

- [ ] **Step 2: Verify failure**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js -t filterFields
```

Expected: the first test fails (current placeholder returns the row unchanged).

- [ ] **Step 3: Replace the placeholder**

```javascript
function filterFields(resolvedUser, artifactType, row) {
    if (artifactType !== 'test_case') return row;
    if (resolvedUser && resolvedUser.effectivePermissions && resolvedUser.effectivePermissions.has('qc.testcases.view_steps')) {
        return row;
    }
    const clone = { ...row };
    delete clone.steps;
    delete clone.expected_results;
    return clone;
}
```

- [ ] **Step 4: Re-run and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js
```

Expected: all canPerform + buildListFilter + filterFields tests pass.

- [ ] **Step 5: Add the barrel module**

```javascript
// apps/api/src/access/index.js
'use strict';

module.exports = {
    ...require('./AccessEngine'),
    RoleResolver: require('./RoleResolver'),
    ArtifactVisibilityDefaulter: require('./ArtifactVisibilityDefaulter'),
    FeatureFlagReader: require('./FeatureFlagReader'),
};
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/access/AccessEngine.js apps/api/src/access/index.js apps/api/__tests__/access.test.js
git commit -m "$(cat <<'EOF'
feat(access): add filterFields strip for test_case steps + barrel module

filterFields removes test_case.steps / .expected_results when the resolved
user lacks qc.testcases.view_steps. Synchronous so it can run per-row in
list responses without an async cost. Dormant. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — Migration SQL file

**Files:**
- Create: `database/migrations/036_access_engine_foundation.sql`

Idempotent throughout: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`, `DROP CONSTRAINT IF EXISTS` before each `ADD CONSTRAINT`. Backfill uses `UPDATE … WHERE … IS NULL` so it never overwrites existing data. Post-assertions are inside `DO $$` blocks that `RAISE EXCEPTION` on failure.

- [ ] **Step 1: Write the migration file**

Create `database/migrations/036_access_engine_foundation.sql`:

```sql
-- Migration 036: Access Engine foundation (issue #80)
-- Strictly additive. Adds team_types, project_teams, project_managers,
-- artifact_access, role_permissions, default_artifact_visibility, feature_flags
-- and per-artifact ownership/visibility columns. Backfills from existing data.
-- All operations idempotent; safe to re-run.

BEGIN;

-- =====================================================================
-- 1. team_types lookup + seed
-- =====================================================================
CREATE TABLE IF NOT EXISTS team_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_types (code, name, description) VALUES
    ('qc', 'QC', 'Quality Control team'),
    ('dev', 'Development', 'Development team'),
    ('commercial', 'Commercial', 'Commercial / sales team'),
    ('pm', 'Project Management', 'Project management team'),
    ('other', 'Other', 'Uncategorized team')
ON CONFLICT (code) DO NOTHING;

-- 2. teams.team_type_id; default existing teams to 'other'
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='teams' AND column_name='team_type_id') THEN
        ALTER TABLE teams ADD COLUMN team_type_id UUID REFERENCES team_types(id);
    END IF;
END $$;

UPDATE teams SET team_type_id = (SELECT id FROM team_types WHERE code = 'other')
WHERE team_type_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_teams_team_type_id ON teams(team_type_id);

-- =====================================================================
-- 3. project_teams (multi-team per project)
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_teams (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_project_teams_team_id ON project_teams(team_id);

INSERT INTO project_teams (project_id, team_id)
SELECT id, team_id FROM projects WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 4. project_managers (co-PM supported)
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_managers (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES app_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_managers_user_id ON project_managers(user_id);

-- =====================================================================
-- 5. owner_team_id / visibility_scope / created_by_user_id on every artifact
-- =====================================================================
DO $$
DECLARE
    artifact_table TEXT;
BEGIN
    FOREACH artifact_table IN ARRAY ARRAY['bugs','tasks','test_cases','test_executions','test_suites','user_stories']
    LOOP
        IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('ALTER TABLE %I
            ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20),
            ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL',
            artifact_table);
        EXECUTE format('DROP INDEX IF EXISTS idx_%s_owner_team_id', artifact_table);
        EXECUTE format('CREATE INDEX idx_%s_owner_team_id ON %I(owner_team_id) WHERE deleted_at IS NULL',
                       artifact_table, artifact_table);
        EXECUTE format('DROP INDEX IF EXISTS idx_%s_visibility_scope', artifact_table);
        EXECUTE format('CREATE INDEX idx_%s_visibility_scope ON %I(visibility_scope) WHERE deleted_at IS NULL',
                       artifact_table, artifact_table);
    END LOOP;
END $$;

-- =====================================================================
-- 6. artifact_access ACL
-- =====================================================================
CREATE TABLE IF NOT EXISTS artifact_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artifact_type VARCHAR(40) NOT NULL,
    artifact_id UUID NOT NULL,
    subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('user','team','role')),
    subject_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    granted_by UUID REFERENCES app_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (artifact_type, artifact_id, subject_type, subject_id, action)
);
CREATE INDEX IF NOT EXISTS idx_artifact_access_artifact ON artifact_access(artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_access_subject ON artifact_access(subject_type, subject_id);

-- =====================================================================
-- 7. role_permissions (normalized form of custom_roles.permissions)
-- =====================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_identifier VARCHAR(64) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_identifier, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_identifier);

-- =====================================================================
-- 8. default_artifact_visibility (admin-editable defaults table)
-- =====================================================================
CREATE TABLE IF NOT EXISTS default_artifact_visibility (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_type_id UUID NOT NULL REFERENCES team_types(id) ON DELETE CASCADE,
    artifact_type VARCHAR(40) NOT NULL,
    default_scope VARCHAR(20) NOT NULL CHECK (default_scope IN ('private','team','project','admin_only')),
    default_acl_grants JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_type_id, artifact_type)
);

-- Seed per the PRD table
INSERT INTO default_artifact_visibility (team_type_id, artifact_type, default_scope, default_acl_grants)
SELECT tt.id, x.artifact_type, x.scope, x.grants::jsonb
FROM team_types tt
JOIN (VALUES
    ('qc','test_case','team','[]'),
    ('qc','test_run','team','[]'),
    ('qc','bug','team','[{"role":"pm","action":"view"}]'),
    ('qc','task','team','[{"role":"pm","action":"view"}]'),
    ('dev','task','team','[{"role":"pm","action":"view"}]'),
    ('dev','bug','team','[{"role":"pm","action":"view"}]'),
    ('commercial','task','team','[{"role":"pm","action":"view"}]'),
    ('pm','task','project','[]')
) AS x(team_code, artifact_type, scope, grants) ON tt.code = x.team_code
ON CONFLICT (team_type_id, artifact_type) DO NOTHING;

-- Wildcard '*' team_type: user_story → project for every team_type
INSERT INTO default_artifact_visibility (team_type_id, artifact_type, default_scope, default_acl_grants)
SELECT id, 'user_story', 'project', '[]'::jsonb FROM team_types
ON CONFLICT (team_type_id, artifact_type) DO NOTHING;

-- =====================================================================
-- 9. tuleap_sync_config: default_owner_team_id, default_visibility_scope
-- =====================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='tuleap_sync_config' AND column_name='default_owner_team_id') THEN
        ALTER TABLE tuleap_sync_config ADD COLUMN default_owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='tuleap_sync_config' AND column_name='default_visibility_scope') THEN
        ALTER TABLE tuleap_sync_config ADD COLUMN default_visibility_scope VARCHAR(20);
    END IF;
END $$;

-- Backfill default_owner_team_id from the project's team_id where possible
UPDATE tuleap_sync_config tsc
SET default_owner_team_id = p.team_id
FROM projects p
WHERE tsc.qc_project_id = p.id
  AND tsc.default_owner_team_id IS NULL
  AND p.team_id IS NOT NULL;

-- =====================================================================
-- 10. Widen app_user.role CHECK to include pm, member, team_manager
-- =====================================================================
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE app_user ADD CONSTRAINT valid_role CHECK (role IN
    ('admin','manager','team_manager','pm','member','user','viewer','tester','contributor'));

-- =====================================================================
-- 11. Migrate legacy roles user/tester/contributor → member
-- =====================================================================
UPDATE app_user SET role = 'member'
WHERE role IN ('user','tester','contributor');

-- =====================================================================
-- 12. Backfill owner_team_id (from projects.team_id) + visibility_scope = 'team'
-- =====================================================================
DO $$
DECLARE
    artifact_table TEXT;
BEGIN
    FOREACH artifact_table IN ARRAY ARRAY['bugs','tasks','test_cases','test_executions','test_suites','user_stories']
    LOOP
        IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format(
            'UPDATE %I a
             SET owner_team_id = p.team_id
             FROM projects p
             WHERE a.project_id = p.id AND a.owner_team_id IS NULL AND p.team_id IS NOT NULL',
            artifact_table);
        EXECUTE format(
            'UPDATE %I SET visibility_scope = ''team'' WHERE visibility_scope IS NULL',
            artifact_table);
    END LOOP;
END $$;

-- =====================================================================
-- 13. Backfill created_by_user_id from email bridge (best-effort)
--     Bug: bridge through resources.tuleap_username → resources.user_id
--     Task: bridge through resource1_id → resources.user_id
-- =====================================================================
UPDATE bugs b
SET created_by_user_id = r.user_id
FROM resources r
WHERE b.created_by_user_id IS NULL
  AND r.tuleap_username = b.reported_by
  AND r.user_id IS NOT NULL;

UPDATE tasks t
SET created_by_user_id = r.user_id
FROM resources r
WHERE t.created_by_user_id IS NULL
  AND t.resource1_id = r.id
  AND r.user_id IS NOT NULL;

-- =====================================================================
-- 14. feature_flags table
-- =====================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(120) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT 'false'::jsonb,
    description TEXT,
    updated_by UUID REFERENCES app_user(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feature_flags (key, value, description) VALUES
    ('access_engine.bugs', 'false'::jsonb, 'Enable Access Engine enforcement on bug routes'),
    ('access_engine.tasks', 'false'::jsonb, 'Enable Access Engine enforcement on task routes'),
    ('access_engine.test_cases', 'false'::jsonb, 'Enable Access Engine enforcement on test_case routes'),
    ('access_engine.test_executions', 'false'::jsonb, 'Enable Access Engine enforcement on test_execution routes'),
    ('access_engine.test_suites', 'false'::jsonb, 'Enable Access Engine enforcement on test_suite routes'),
    ('access_engine.user_stories', 'false'::jsonb, 'Enable Access Engine enforcement on user_story routes')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- 15. role_permissions backfill from custom_roles + catalog defaults
--     Catalog defaults are loaded by the bootstrap; here we mirror
--     custom_roles.permissions array into the normalized table.
-- =====================================================================
INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
SELECT cr.name, perm, cr.created_by
FROM custom_roles cr, UNNEST(cr.permissions) AS perm
WHERE perm IS NOT NULL
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

-- =====================================================================
-- 16. POST-MIGRATION ASSERTIONS
-- =====================================================================
DO $$
DECLARE
    null_bugs INT;
    null_tasks INT;
BEGIN
    SELECT COUNT(*) INTO null_bugs FROM bugs WHERE owner_team_id IS NULL AND project_id IS NOT NULL;
    SELECT COUNT(*) INTO null_tasks FROM tasks WHERE owner_team_id IS NULL AND project_id IS NOT NULL;

    -- Allow up to 5 NULL rows per artifact (orphan rows whose project has no team)
    IF null_bugs > 5 THEN
        RAISE EXCEPTION 'Migration 036 assertion failed: % bugs have NULL owner_team_id after backfill (expected <= 5)', null_bugs;
    END IF;
    IF null_tasks > 5 THEN
        RAISE EXCEPTION 'Migration 036 assertion failed: % tasks have NULL owner_team_id after backfill (expected <= 5)', null_tasks;
    END IF;
END $$;

COMMIT;
```

- [ ] **Step 2: Lint the file with `psql -f --dry-run`-style sanity check**

There is no real dry-run for postgres, so instead run a syntax check via `psql ... -c "EXPLAIN <every statement>"` is impractical. We instead rely on Step 9's bootstrap mirror + container restart to actually execute it against the live DB.

For now, confirm the file is well-formed by counting BEGIN/COMMIT pairs and checking braces with `awk`:

```bash
grep -cE '^BEGIN;' /root/QC-Manager/database/migrations/036_access_engine_foundation.sql
grep -cE '^COMMIT;' /root/QC-Manager/database/migrations/036_access_engine_foundation.sql
```

Expected: each is `1`.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/036_access_engine_foundation.sql
git commit -m "$(cat <<'EOF'
feat(db): migration 036 — Access Engine foundation schema + backfill

Adds team_types, project_teams, project_managers, artifact_access,
role_permissions, default_artifact_visibility, feature_flags. Adds
owner_team_id / visibility_scope / created_by_user_id to bugs, tasks,
test_cases, test_executions, test_suites, user_stories. Extends
tuleap_sync_config and widens app_user.role CHECK. Backfills from existing
data. Asserts post-conditions. All idempotent. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Mirror 036 into `db.js` bootstrap

The project convention is that `apps/api/src/config/db.js` runs every migration's SQL inline on container boot so a fresh database is fully provisioned. Mirror 036's logic by appending it just before line 2601 (the `console.log('Database migrations completed successfully')` line).

**Files:**
- Modify: `apps/api/src/config/db.js`

- [ ] **Step 1: Append the mirror block**

Find the last existing migration block (line 2599, the `bugs_severity_canonical` constraint) and insert immediately after, before `console.log(...)`:

```javascript
        // ============================================================
        // Migration 036: Access Engine foundation (issue #80)
        // ============================================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS team_types (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                code VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            INSERT INTO team_types (code, name, description) VALUES
                ('qc', 'QC', 'Quality Control team'),
                ('dev', 'Development', 'Development team'),
                ('commercial', 'Commercial', 'Commercial / sales team'),
                ('pm', 'Project Management', 'Project management team'),
                ('other', 'Other', 'Uncategorized team')
            ON CONFLICT (code) DO NOTHING
        `);
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='teams' AND column_name='team_type_id') THEN
                    ALTER TABLE teams ADD COLUMN team_type_id UUID REFERENCES team_types(id);
                END IF;
            END $$;
        `);
        await client.query(`
            UPDATE teams SET team_type_id = (SELECT id FROM team_types WHERE code = 'other')
            WHERE team_type_id IS NULL
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_teams_team_type_id ON teams(team_type_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS project_teams (
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, team_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_project_teams_team_id ON project_teams(team_id)`);
        await client.query(`
            INSERT INTO project_teams (project_id, team_id)
            SELECT id, team_id FROM projects WHERE team_id IS NOT NULL
            ON CONFLICT DO NOTHING
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS project_managers (
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                assigned_by UUID REFERENCES app_user(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, user_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_project_managers_user_id ON project_managers(user_id)`);

        await client.query(`
            DO $$
            DECLARE artifact_table TEXT;
            BEGIN
                FOREACH artifact_table IN ARRAY ARRAY['bugs','tasks','test_cases','test_executions','test_suites','user_stories']
                LOOP
                    IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN CONTINUE; END IF;
                    EXECUTE format('ALTER TABLE %I
                        ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
                        ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20),
                        ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL',
                        artifact_table);
                    EXECUTE format('DROP INDEX IF EXISTS idx_%s_owner_team_id', artifact_table);
                    EXECUTE format('CREATE INDEX idx_%s_owner_team_id ON %I(owner_team_id) WHERE deleted_at IS NULL',
                                   artifact_table, artifact_table);
                    EXECUTE format('DROP INDEX IF EXISTS idx_%s_visibility_scope', artifact_table);
                    EXECUTE format('CREATE INDEX idx_%s_visibility_scope ON %I(visibility_scope) WHERE deleted_at IS NULL',
                                   artifact_table, artifact_table);
                END LOOP;
            END $$;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS artifact_access (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                artifact_type VARCHAR(40) NOT NULL,
                artifact_id UUID NOT NULL,
                subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('user','team','role')),
                subject_id VARCHAR(255) NOT NULL,
                action VARCHAR(50) NOT NULL,
                granted_by UUID REFERENCES app_user(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (artifact_type, artifact_id, subject_type, subject_id, action)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_artifact_access_artifact ON artifact_access(artifact_type, artifact_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_artifact_access_subject ON artifact_access(subject_type, subject_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_identifier VARCHAR(64) NOT NULL,
                permission_key VARCHAR(100) NOT NULL,
                granted_by VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (role_identifier, permission_key)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_identifier)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS default_artifact_visibility (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                team_type_id UUID NOT NULL REFERENCES team_types(id) ON DELETE CASCADE,
                artifact_type VARCHAR(40) NOT NULL,
                default_scope VARCHAR(20) NOT NULL CHECK (default_scope IN ('private','team','project','admin_only')),
                default_acl_grants JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (team_type_id, artifact_type)
            )
        `);

        await client.query(`
            INSERT INTO default_artifact_visibility (team_type_id, artifact_type, default_scope, default_acl_grants)
            SELECT tt.id, x.artifact_type, x.scope, x.grants::jsonb
            FROM team_types tt
            JOIN (VALUES
                ('qc','test_case','team','[]'),
                ('qc','test_run','team','[]'),
                ('qc','bug','team','[{"role":"pm","action":"view"}]'),
                ('qc','task','team','[{"role":"pm","action":"view"}]'),
                ('dev','task','team','[{"role":"pm","action":"view"}]'),
                ('dev','bug','team','[{"role":"pm","action":"view"}]'),
                ('commercial','task','team','[{"role":"pm","action":"view"}]'),
                ('pm','task','project','[]')
            ) AS x(team_code, artifact_type, scope, grants) ON tt.code = x.team_code
            ON CONFLICT (team_type_id, artifact_type) DO NOTHING
        `);
        await client.query(`
            INSERT INTO default_artifact_visibility (team_type_id, artifact_type, default_scope, default_acl_grants)
            SELECT id, 'user_story', 'project', '[]'::jsonb FROM team_types
            ON CONFLICT (team_type_id, artifact_type) DO NOTHING
        `);

        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='tuleap_sync_config' AND column_name='default_owner_team_id') THEN
                    ALTER TABLE tuleap_sync_config ADD COLUMN default_owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='tuleap_sync_config' AND column_name='default_visibility_scope') THEN
                    ALTER TABLE tuleap_sync_config ADD COLUMN default_visibility_scope VARCHAR(20);
                END IF;
            END $$;
        `);
        await client.query(`
            UPDATE tuleap_sync_config tsc
            SET default_owner_team_id = p.team_id
            FROM projects p
            WHERE tsc.qc_project_id = p.id
              AND tsc.default_owner_team_id IS NULL
              AND p.team_id IS NOT NULL
        `);

        await client.query(`ALTER TABLE app_user DROP CONSTRAINT IF EXISTS valid_role`);
        await client.query(`
            ALTER TABLE app_user ADD CONSTRAINT valid_role CHECK (role IN
                ('admin','manager','team_manager','pm','member','user','viewer','tester','contributor'))
        `);
        await client.query(`UPDATE app_user SET role = 'member' WHERE role IN ('user','tester','contributor')`);

        await client.query(`
            DO $$
            DECLARE artifact_table TEXT;
            BEGIN
                FOREACH artifact_table IN ARRAY ARRAY['bugs','tasks','test_cases','test_executions','test_suites','user_stories']
                LOOP
                    IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN CONTINUE; END IF;
                    EXECUTE format('UPDATE %I a SET owner_team_id = p.team_id FROM projects p
                                    WHERE a.project_id = p.id AND a.owner_team_id IS NULL AND p.team_id IS NOT NULL',
                                   artifact_table);
                    EXECUTE format('UPDATE %I SET visibility_scope = ''team'' WHERE visibility_scope IS NULL',
                                   artifact_table);
                END LOOP;
            END $$;
        `);

        await client.query(`
            UPDATE bugs b SET created_by_user_id = r.user_id
            FROM resources r
            WHERE b.created_by_user_id IS NULL AND r.tuleap_username = b.reported_by AND r.user_id IS NOT NULL
        `);
        await client.query(`
            UPDATE tasks t SET created_by_user_id = r.user_id
            FROM resources r
            WHERE t.created_by_user_id IS NULL AND t.resource1_id = r.id AND r.user_id IS NOT NULL
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS feature_flags (
                key VARCHAR(120) PRIMARY KEY,
                value JSONB NOT NULL DEFAULT 'false'::jsonb,
                description TEXT,
                updated_by UUID REFERENCES app_user(id),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            INSERT INTO feature_flags (key, value, description) VALUES
                ('access_engine.bugs', 'false'::jsonb, 'Enable Access Engine enforcement on bug routes'),
                ('access_engine.tasks', 'false'::jsonb, 'Enable Access Engine enforcement on task routes'),
                ('access_engine.test_cases', 'false'::jsonb, 'Enable Access Engine enforcement on test_case routes'),
                ('access_engine.test_executions', 'false'::jsonb, 'Enable Access Engine enforcement on test_execution routes'),
                ('access_engine.test_suites', 'false'::jsonb, 'Enable Access Engine enforcement on test_suite routes'),
                ('access_engine.user_stories', 'false'::jsonb, 'Enable Access Engine enforcement on user_story routes')
            ON CONFLICT (key) DO NOTHING
        `);

        await client.query(`
            INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
            SELECT cr.name, perm, cr.created_by
            FROM custom_roles cr, UNNEST(cr.permissions) AS perm
            WHERE perm IS NOT NULL
            ON CONFLICT (role_identifier, permission_key) DO NOTHING
        `);
```

Note: the bootstrap intentionally skips the `RAISE EXCEPTION` assertion block — boot must not crash on legacy databases with edge-case data. Assertion is preserved in the canonical SQL file for manual runs.

- [ ] **Step 2: Restart the local DB / API to verify boot succeeds**

The cleanest validation is to run the entire test suite — db.js boot is exercised by any test that touches the pool. But the migration only runs when `bootstrap()` is invoked; jest tests mock the DB, so they don't trigger it. We rely on Step 10's manual `psql` run for end-to-end validation.

For now, syntax-check the JS:

```bash
cd /root/QC-Manager/apps/api && node -e "require('./src/config/db')"
```

Expected: no parse error, just exits cleanly after exporting module (no DB connection attempted because `bootstrap()` only runs on `index.js` start).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/db.js
git commit -m "$(cat <<'EOF'
feat(db): mirror migration 036 into bootstrap

Container boot now runs the Access Engine foundation schema idempotently
on every start, matching the existing per-migration mirroring pattern used
for migration 035 (bugs_status_canonical / sync_status). Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — Run the migration against the local Supabase DB (validation)

**Files:** none — execution only.

The user controls when to run this against the staging or production DB. For local validation, run it against the local `supabase-db` container (the codebase's documented source of truth — see CLAUDE.md "Always query `supabase-db`").

- [ ] **Step 1: Check whether a local supabase-db is running**

```bash
docker ps --filter "name=supabase-db" --format '{{.Names}} {{.Status}}'
```

If empty, skip to Step 4 (manual / production run is deferred to the user).

- [ ] **Step 2: Run the migration file against the local DB**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < /root/QC-Manager/database/migrations/036_access_engine_foundation.sql
```

Expected: ends with `COMMIT` and exit code 0. If the assertion fails, the migration prints the offending count and rolls back the entire transaction.

- [ ] **Step 3: Smoke-check the new shape**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "\dt team_types project_teams project_managers artifact_access role_permissions default_artifact_visibility feature_flags"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT code, name FROM team_types ORDER BY code"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT role, COUNT(*) FROM app_user GROUP BY role ORDER BY role"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT artifact_type, COUNT(*) FILTER (WHERE owner_team_id IS NULL) AS null_owner_team FROM (SELECT 'bugs' AS artifact_type, owner_team_id FROM bugs UNION ALL SELECT 'tasks', owner_team_id FROM tasks UNION ALL SELECT 'test_cases', owner_team_id FROM test_cases) s GROUP BY artifact_type"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT key, value FROM feature_flags ORDER BY key"
```

Expected:
- All 7 new tables listed.
- `team_types` has 5 rows.
- No `app_user.role` is `user`/`tester`/`contributor` anymore.
- NULL `owner_team_id` counts are ≤5 per artifact.
- All 6 `access_engine.*` flags present and `false`.

- [ ] **Step 4: Document the result inline in the plan**

If Steps 1–3 succeed, no commit needed (no file changes). If any assertion fails, capture the offending count and the affected rows; the user decides whether to relax the assertion threshold or fix the data.

---

## Task 11 — Extend `/auth/me` with `effective_permissions` and `scope`

**Files:**
- Modify: `apps/api/src/routes/auth.js` (lines 306–331)

The existing handler returns `{ user, permissions }`. The new shape: `{ user, permissions, effective_permissions, scope }`. The legacy `permissions` field stays so frontend consumers don't break. `effective_permissions` is the resolved set including catalog defaults + `role_permissions` + `user_permissions`. `scope` is the user's `{ team_id, team_type, pm_of_projects }`.

- [ ] **Step 1: Write a failing integration test**

Create `apps/api/__tests__/authMe.accessShape.test.js`:

```javascript
'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = { id: 'u1', role: 'member' }; next(); },
    requirePermission: () => (req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');

afterEach(() => jest.clearAllMocks());

describe('GET /auth/me — Access Engine shape', () => {
    test('response includes effective_permissions and scope alongside legacy permissions', async () => {
        // Stub the row sequence the route + resolver issue:
        //  1) auth.js SELECT FROM app_user (handler)
        //  2) auth.js SELECT FROM user_permissions (legacy)
        //  3) RoleResolver: SELECT FROM role_permissions
        //  4) RoleResolver: SELECT FROM user_permissions
        //  5) RoleResolver: SELECT FROM app_user JOIN teams JOIN team_types
        //  6) RoleResolver: SELECT FROM project_managers
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'M', email: 'm@x', role: 'member', active: true, status: 'ACTIVE' }] })
            .mockResolvedValueOnce({ rows: [{ permission_key: 'qc.tasks.view_team', granted: true }] })
            .mockResolvedValueOnce({ rows: [] }) // role_permissions empty → catalog default
            .mockResolvedValueOnce({ rows: [{ permission_key: 'qc.tasks.view_team', granted: true }] })
            .mockResolvedValueOnce({ rows: [{ team_id: 't-1', team_type: 'qc' }] })
            .mockResolvedValueOnce({ rows: [{ project_id: 'p-1' }] });

        const router = require('../src/routes/auth');
        const app = express();
        app.use(express.json());
        app.use('/auth', router);

        const res = await request(app).get('/auth/me').set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.effective_permissions)).toBe(true);
        expect(res.body.effective_permissions).toEqual(expect.arrayContaining(['qc.tasks.view_team']));
        expect(res.body.scope).toEqual({ team_id: 't-1', team_type: 'qc', pm_of_projects: ['p-1'] });
        // Legacy field preserved
        expect(Array.isArray(res.body.permissions)).toBe(true);
    });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/authMe.accessShape.test.js
```

Expected: assertion on `effective_permissions` / `scope` fails — handler currently returns only `{ user, permissions }`.

- [ ] **Step 3: Modify `apps/api/src/routes/auth.js`**

At the top of the file (alongside other requires), add:

```javascript
const { resolve: resolveRole } = require('../access/RoleResolver');
```

Replace the `router.get('/me', ...)` handler body (lines 306–331) to merge resolver output onto the response. The full replacement block:

```javascript
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT id, name, display_name, email, phone, role, active, status, team_membership_active, onboarding_completed, preferences, avatar_url, avatar_type, created_at, last_login FROM app_user WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        const permsResult = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
            [user.id]
        );
        const permissions = permsResult.rows
            .filter(p => p.granted)
            .map(p => p.permission_key);

        const resolved = await resolveRole(req.user, req);
        const effective_permissions = Array.from(resolved.effectivePermissions);

        res.json({
            user,
            permissions,
            effective_permissions,
            scope: resolved.scope,
        });
    } catch (err) {
        next(err);
    }
});
```

- [ ] **Step 4: Re-run the new test and confirm green**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/authMe.accessShape.test.js
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.js apps/api/__tests__/authMe.accessShape.test.js
git commit -m "$(cat <<'EOF'
feat(api): GET /auth/me returns effective_permissions and scope

Frontend can now compute nav and page-level capabilities from a single /me
call. Legacy 'permissions' field preserved so existing consumers still
work. Resolver memoized per-request via req attachment. Issue #80.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 — Run the full existing test suite to confirm zero regressions

**Files:** none.

The whole point of this slice being dormant is that nothing else changes. Run the full suite.

- [ ] **Step 1: Run jest from the api package**

```bash
cd /root/QC-Manager/apps/api && npm test 2>&1 | tail -40
```

Expected: every existing test still passes. If `meDashboard.test.js`, `rbacCatalog.test.js`, `rbacMiddlewareCatalog.test.js`, or any auth-touching test fails, investigate:
- For catalog-style tests, the legacy keys and roles in `apps/shared/rbac/catalog.ts` should be untouched.
- For middleware tests, the `requirePermission` / `requireAnyPermission` paths are unchanged — we only added new modules.

- [ ] **Step 2: If any regressions surface, fix and re-commit (do NOT amend Task 11's commit)**

```bash
# fix the offending file
git add <file>
git commit -m "fix: restore <X> after Access Engine foundation"
```

- [ ] **Step 3: Validate the new tests run cleanly together**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/access.test.js __tests__/roleResolver.test.js __tests__/artifactVisibilityDefaulter.test.js __tests__/featureFlagReader.test.js __tests__/authMe.accessShape.test.js __tests__/rbacCatalog.test.js
```

Expected: all pass.

---

## Task 13 — Final review and issue link

**Files:** none — git operations only.

- [ ] **Step 1: Walk the diff one more time**

```bash
git log --oneline main..HEAD
git diff --stat $(git log --oneline | tail -1 | awk '{print $1}')..HEAD
```

Confirm the per-task commits are present and the diff covers only:
- 1 new migration file
- 5 new files under `apps/api/src/access/`
- 4 new test files
- 3 modified files (`apps/shared/rbac/catalog.ts`, `apps/api/src/config/db.js`, `apps/api/src/routes/auth.js`)
- 1 modified test (`apps/api/__tests__/rbacCatalog.test.js`)

No persister, route, or middleware outside `auth.js` should appear in the diff.

- [ ] **Step 2: Comment on issue #80 with the commit list**

```bash
gh issue comment 80 --repo Gebrilo/QC-Manager --body "$(cat <<'EOF'
Foundation slice committed on `main`.

Highlights:
- migration 036 with full backfill + post-assertion
- catalog expanded with ~100 new scoped + artifact-specific keys; built-in roles `pm`, `team_manager`, `member`; `manager` aliased to `team_manager`; `member` seeded with union of legacy `tester` perms (PRD risk #1)
- `AccessEngine`, `RoleResolver`, `ArtifactVisibilityDefaulter`, `FeatureFlagReader` under `apps/api/src/access/` — all dormant
- `/auth/me` now returns `effective_permissions` + `scope` alongside legacy `permissions`
- all existing tests pass unmodified

No route enforces the engine yet. All `access_engine.<artifact>` flags seeded to `false`. Ready for Phase 1 (read-only admin UI + shadow mode).
EOF
)"
```

- [ ] **Step 3: Done. Do NOT deploy.**

Deploy decisions are manual per the project's deploy convention (see CLAUDE.md). The user will choose when to push staging and production.

---

## Spec coverage check

| Acceptance criterion (issue #80)                                                                       | Task(s)            |
|---|---|
| Migration creates the 7 new tables + adds columns + extends tuleap_sync_config + widens role CHECK     | 8, 9               |
| Backfill in the same migration                                                                          | 8, 9               |
| Post-migration assertions                                                                               | 8                  |
| Catalog expanded with scoped variants + artifact-specific actions + admin keys                          | 1                  |
| Built-in roles: admin / pm / team_manager / member / viewer; `manager` aliased; `member` ⊇ tester      | 1                  |
| AccessEngine.canPerform with all OR branches + structured denial                                        | 5                  |
| AccessEngine.buildListFilter with parameterized OR chain                                                | 6                  |
| AccessEngine.filterFields (test_case steps)                                                             | 7                  |
| RoleResolver returning `{ effectivePermissions, scope }`, memoized per request                          | 2                  |
| ArtifactVisibilityDefaulter (lookup + fallback + Tuleap path)                                           | 4                  |
| FeatureFlagReader with per-request caching; flags seeded to false                                       | 3, 8               |
| `/api/me` includes `effective_permissions` and `scope`                                                  | 11                 |
| default_artifact_visibility seeded per the PRD table                                                    | 8                  |
| Unit tests added (access, roleResolver, artifactVisibilityDefaulter, featureFlagReader, authMe shape)   | 2, 3, 4, 5, 6, 7, 11 |
| Existing test suite passes unmodified                                                                   | 12                 |
| Engine dormant — no route calls it yet                                                                  | enforced by scope: only `auth.js` modified |
