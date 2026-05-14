# Architecture and UX Restructuring — Design Spec

**Date:** 2026-05-14
**Status:** Approved for planning (writing-plans is next)
**Author:** Brainstorming session with project owner

---

## 1. Context

QC-Manager is live at `gebrils.cloud` with real users (3 personas: QC Tester, QC Team Manager, Admin). The system has accumulated four kinds of friction over the last six months of feature work:

- **Navigation is bloated** — `apps/web/src/config/routes.ts` exposes 15+ flat top-level navbar items, mixing personal pages (`/my-tasks`), shared collections (`/tasks`), and admin settings (`/settings/*`) with no hierarchy.
- **Roles and permissions are tangled** — role is a string column on `app_user`, permission grants are per-user in `user_permissions`, admin bypass is hardcoded inside `requirePermission()`, and team-scope is a separate axis bolted onto every route. Permission keys are stringly-typed (`page:my-tasks`, `action:tasks:create`) with no namespacing.
- **Code structure makes changes risky** — `apps/api/src/index.js` mounts ~30 flat route files under both `/` and `/api`. Duplicate routes exist (`taskTestCases.js` + `testCaseTasks.js`, `testExecutions.js` + `testResults.js`). The single `apps/web/src/lib/api.ts` is a monolithic client.
- **Domain drift** — `tuleap_sync_config` table name no longer matches its role (covers both inbound + outbound per ADR 0005); dead columns (`field_mappings`, `status_mappings`, `standalone_bugs`) linger; the three identities for an artifact (QC UUID, business key, Tuleap integer ID) still leak across the API surface despite ADR 0006.

All four are in scope for this restructure.

## 2. Goals and Non-Goals

**North star (success criterion):** adding a new role or a new permission is a one-line config edit. RBAC clarity is the design's anchor.

**In scope:**
- Codify the permission catalog as a single source of truth (Phase 1).
- Restructure information architecture into four persona-aligned sections (Phase 2).
- Reorganize API + web code into six domain modules; remove duplicate route files and the dual mount (Phase 3).
- Rename `tuleap_sync_config` → `tracker_config`, retire dead columns, formalize the identity rule, finish the unified-payload PATCH gap (Phase 4).

**Out of scope:**
- Replacing the RBAC data model. The owner chose "keep current shape, just clean it up." No new tables for roles or scopes; `app_user.role` (string) + `user_permissions` (per-user overrides) + team-scope axis stay.
- Adding new features. This is restructuring only.
- Touching `n8n` workflow logic. Only the operational re-import of `tuleap-bug-sync.json` (already authored, not deployed) happens during Phase 4.

## 3. Personas

| Persona | Description | Primary sections |
|---|---|---|
| **QC Tester** | Runs test cases, executes test runs, files bugs. May be onboarding (status `PREPARATION`) or active (`ACTIVE`). | My Work, Quality |
| **QC Team Manager** | Owns a team of testers, assigns work, reviews dev plans/journeys, monitors governance for their team's projects. | My Work, Quality, Manage |
| **Admin** | Configures Tuleap, manages users/teams/roles. | Admin (and everything else by bypass) |

Dev/BA/external stakeholder is *not* a primary persona — they do not read the dashboards or file bugs through QC-Manager.

## 4. Constraints and Decisions

- **Breakage policy:** coordinated breaking changes per phase. Each phase ends with a single announced cutover deploy. No long-running shims or permanent backward-compatibility layers.
- **RBAC data model:** unchanged. Catalog is in code, not in a new table.
- **`test-runs` vs `test-executions`:** the owner confirmed these are the same concept. They consolidate to `test-runs` (Phase 2 URL plan + Phase 3 route consolidation).
- **`Manage` section:** stays top-level (not folded into Admin). Managers see only their team; admins see Manage as a superset.
- **`/dashboard` (shared)** is killed. Managers see team rollup on `/me/dashboard`; team-wide quality dashboards live inside Quality.

---

## 5. Phase 1 — RBAC Catalog (the spine)

**Deliverable:** a single TypeScript module in a new `apps/shared/rbac/` workspace package (`apps/shared/rbac/catalog.ts`) consumed directly by both `apps/api` and `apps/web` via package import. No codegen step — both apps depend on the same TypeScript file. The module declares every permission key, role, and cross-cutting scope.

**Shape:**

```ts
export const PERMISSIONS = {
  'qc.tasks.view':       { label: 'View tasks', section: 'work' },
  'qc.tasks.create':     { label: 'Create tasks', section: 'work' },
  'qc.testcases.view':   { label: 'View test cases', section: 'quality' },
  'qc.governance.view':  { label: 'View governance', section: 'quality' },
  // …full catalog declared here
} as const;

export const ROLES = {
  admin:   { permissions: '*' },                              // bypass set, explicit
  manager: { permissions: ['qc.tasks.*', 'qc.team.view', /* … */] },
  tester:  { permissions: ['qc.tasks.view', 'qc.testcases.*', /* … */] },
} as const;

export const SCOPES = {
  team: {
    applies_to: ['qc.tasks.*', 'qc.resources.*'],
    filter: 'managerTeamId',
  },
};
```

**Consumers:**
- **API middleware** (`requirePermission`, `requireAnyPermission`) reads from the catalog. Resolves admin bypass, role inheritance, and per-user overrides in one function (`canUserPerform(user, key)`). Fails fast at boot if an unknown key is referenced.
- **Web nav** — `routes.ts` references catalog keys, not magic strings. The Settings → Roles UI is *generated* from the catalog (no hand-maintained role-permission grid).
- **Migration shim:** old keys (`page:my-tasks`, `action:tasks:create`) get aliased to the new namespaced keys for the Phase 1 cutover window only, then deleted.

**Data model change (minimal):**
- No change to `app_user` or `user_permissions`.
- One migration inserts the canonical namespaced permission keys into a `permissions` lookup table (so the admin UI has a DB mirror).
- A second migration rewrites existing `user_permissions.permission_key` values from old keys to new keys.

**Cross-cutting axes that are not "permissions":**
- The team-scope filter (`getTeamScopeFilter`, `requireTeamScope` in `middleware/teamAccess.js`) becomes a declared scope in the catalog rather than a separately bolted-on rule. Routes opt into the `team` scope; the resolver applies it automatically when the user's role is `manager`.

**Status visibility** (`PREPARATION` vs `ACTIVE`) also moves out of `routes.ts` and becomes a scope in the catalog (`'preparation_only'`, `'active_only'`). The status check is no longer a per-route flag; it is a property of permissions like `qc.journeys.view_own`.

**Testing:**
- Unit tests for `canUserPerform()`.
- One integration test per role that walks every catalog entry and asserts visibility matches.
- Boot-time validator: every `requirePermission(key)` call references a key that exists in `PERMISSIONS`. Fails fast.

---

## 6. Phase 2 — Information Architecture

**Top-level nav:**

```
┌─────────────────────────────────────────────────────────────────┐
│  My Work    │   Quality   │   Manage   │   Admin                │
└─────────────────────────────────────────────────────────────────┘
   all users     all users     managers     admins
```

**Section contents:**

```
My Work  (personal — varies by status)
├─ My Dashboard               (always)
├─ My Tasks                   (always)
├─ My Journeys                (status=PREPARATION)
├─ My Development Plan        (status=ACTIVE)
├─ Plan History               (status=ACTIVE)
└─ Preferences                (always)

Quality  (content scopes by role — manager sees only their team)
├─ Projects
├─ Work Tracking
│   ├─ Tasks
│   ├─ User Stories
│   └─ Bugs
├─ Test Authoring
│   ├─ Test Cases
│   └─ Test Suites
├─ Test Execution
│   ├─ Test Runs           (was: test-runs + test-executions, consolidated)
│   └─ Test Results
├─ Governance
└─ Reports

Manage  (manager-scoped to their team)
├─ Resources
├─ Development Plans
├─ Team Journeys
└─ Task History

Admin
├─ Users
├─ Teams
├─ Journey Templates        (was: /settings/journeys)
├─ Roles & Permissions      (generated from RBAC catalog)
└─ Integrations
    └─ Tuleap               (tracker configs)
```

**Key IA decisions:**
- Quality has sub-groupings (left rail inside the section) to organize the 5-way test cluster and the 3-way work cluster.
- Status-conditional rendering (`PREPARATION` vs `ACTIVE`) is handled by Phase 1 scopes, not per-route flags.
- `/dashboard` (shared) is removed; managers see team rollup on `/me/dashboard`.
- `/settings` is dissolved — its children become first-class Admin items.

**URL plan (cutover during Phase 2):**

| Old | New |
|---|---|
| `/my-tasks` | `/me/tasks` |
| `/journeys`, `/development-plan`, `/my-dashboard`, `/preferences` | `/me/journeys`, `/me/idp`, `/me/dashboard`, `/me/preferences` |
| `/tasks`, `/projects`, `/bugs`, `/user-stories` | `/work/tasks`, `/work/projects`, `/work/bugs`, `/work/stories` |
| `/test-cases`, `/test-suites`, `/test-runs`, `/test-results`, `/test-executions` | `/test/cases`, `/test/suites`, `/test/runs`, `/test/results` (executions merges into runs) |
| `/governance`, `/reports`, `/dashboard` | `/quality/governance`, `/quality/reports` (`/dashboard` removed) |
| `/resources`, `/manage-development-plans`, `/settings/team-journeys`, `/task-history` | `/team/resources`, `/team/idp`, `/team/journeys`, `/team/history` |
| `/users`, `/settings/teams`, `/settings/journeys`, `/settings/roles`, `/settings/tuleap` | `/admin/users`, `/admin/teams`, `/admin/journeys`, `/admin/roles`, `/admin/integrations/tuleap` |

Old paths 301 to new paths during the Phase 2 cutover window; redirects are removed at the start of Phase 3.

**Testing:** Playwright suite per persona walking the new IA; redirect-status tests for every renamed URL (pre-cutover only).

---

## 7. Phase 3 — Code Structure

**Six backend modules** under `apps/api/src/modules/`:

```
apps/api/src/modules/
├── identity/         auth, me, users, roles, teams, avatar, notifications
├── work/             projects, tasks, user_stories, bugs, search
├── testing/          test_cases, test_suites, test_runs, test_results, testsprite
├── quality/          governance, reports, dashboards
├── lifecycle/        journeys (templates + own), development_plans, personal_tasks
└── integration/      tuleap (webhook + artifacts + config)
```

**Per-module shape:**

```
modules/work/
├── index.js              exports { prefix, routes, requiredPermissions }
├── tasks.routes.js
├── projects.routes.js
├── bugs.routes.js
├── stories.routes.js
├── search.routes.js
├── services/             business logic, lifted out of route handlers
├── persisters/           (existing — DB writes for Tuleap inbound)
├── emitters/             (existing — Tuleap outbound)
└── __tests__/
```

**Single mount in `apps/api/src/index.js`:**

```js
const apiRouter = express.Router();
['identity','work','testing','quality','lifecycle','integration']
  .forEach(m => require(`./modules/${m}`).mount(apiRouter));
app.use('/api', apiRouter);   // ONE mount, not two
```

**Boot-time validator** walks every `requirePermission(key)` call and asserts the key exists in the Phase 1 catalog.

**Consolidations:**
- `taskTestCases.js` + `testCaseTasks.js` → single `testing/linking.routes.js` exposing `/test-cases/:id/tasks` and `/tasks/:id/test-cases` symmetrically.
- `testExecutions.js` + `testResults.js` → `testing/test-runs.routes.js` (matches the IA decision).
- `managerView.js` dissolves — its endpoints become team-scoped variants of existing module endpoints, gated by the `team` scope from the catalog.
- `dashboard.js` deleted (matches IA decision).
- Dual `/` + `/api` mount: `/api` becomes the only mount; `/` retires at the Phase 3 cutover.

**Web side mirrors the same modules:**

```
apps/web/src/
├── app/                  Next.js routes — already moves via Section 2 URL plan
├── lib/api/              one file per backend module
│                         (replaces today's monolithic api.ts)
├── components/
│   ├── identity/
│   ├── work/
│   ├── testing/
│   ├── quality/
│   ├── lifecycle/
│   ├── integration/
│   └── ui/               shared primitives (already exists)
└── hooks/                cross-cutting React hooks only
```

**Testing:**
- All existing API tests (225/242 passing today) stay green through the move.
- The 17 pre-existing failures (`developmentPlans.*`, `db-connection.test.js`) get fixed inside `modules/lifecycle/__tests__/` as part of this phase.
- Boot validator has its own self-test (catalog → middleware → routes wired correctly).

**What does not get rewritten:** `services/persisters/`, `services/emitters/`, `services/tuleap*` are already domain-aligned. They are *moved* into `modules/integration/`, `modules/work/`, `modules/testing/` as appropriate.

---

## 8. Phase 4 — Domain Cleanup

**Renames (table + column, via view shim within one cutover window):**

| Today | New | Rationale |
|---|---|---|
| `tuleap_sync_config` table | `tracker_config` | Matches domain term in CONTEXT.md; covers both inbound + outbound per ADR 0005 |
| `field_mappings`, `status_mappings` columns | (dropped) | Already declared dead in ADR 0005; no current reader |
| `standalone_bugs` column on `bug` | (dropped) | Legacy — `array_length('{}', 1)` always returns NULL, not UI-facing |
| Route prefix `/tuleap-webhook` | `/integration/tuleap/inbound` | Disambiguates "sync" (direction) from `sync` (action vocab in ADR 0001) |
| Route prefix `/tuleap/artifacts` | `/integration/tuleap/outbound` | Symmetric with inbound; matches Phase 3 module layout |

**Migration recipe** (per rename): one SQL migration does `ALTER TABLE` + `CREATE VIEW <old_name>` (read-only) for the cutover window; a follow-up migration drops the view.

**Finish the unified-payload gap** (carried from `unified-tuleap-implementation-status.md`):
- PATCH route in `modules/integration/tuleap/outbound.routes.js` accepts the unified shape (today only POST does).
- `updateUnified()` emitter test added.

**Formalize the 3-identity rule** (ADR 0006 written, surface still leaks):
- API responses for artifact links return one canonical field: `linked_artifact_id` (QC UUID).
- Adjacent fields `business_key` and `tuleap_artifact_id` appear **only on the artifact's own detail endpoint**, never inside link arrays on other artifacts.
- Boundary translation (QC UUID ↔ Tuleap integer) stays inside `tuleapLinkResolver.js`, never crosses out of `modules/integration/`.

**Disambiguate "project" in code:**
- Variables use `qcProjectId` or `tuleapProjectId`; bare `projectId` is banned via an ESLint custom rule scoped to `apps/api/src/modules/**`.
- URL paths: `/api/work/projects/:qcProjectId` always means QC; Tuleap projects only appear under `/api/integration/tuleap/projects/:tuleapProjectId`.
- Database column names stay as-is.

**Migration file cleanup (cosmetic but real):** three duplicate migration numbers exist in `database/migrations/` today (`003_*` ×2, `004_*` ×2, `005_*` ×2). Renumber the lower-priority ones (the `_phase1_views` / `_phase2_governance` / `_create_database_views` triplet) to a contiguous range above the latest (`028+`). Verify `runMigrations()` execution order against the new ordering.

**`CONTEXT.md` updates** (committed alongside the migrations):
- Replace `tuleap_sync_config` references with `tracker_config`.
- Append a "Naming rules" subsection codifying the `qcProjectId` / `tuleapProjectId` convention and the canonical-UUID-on-links rule.
- Remove the "tuleap_sync_config table name vs Tracker Config domain term" flagged ambiguity (resolved by the rename).

**Operational housekeeping (not code, but tracked):**
- Re-import `n8n-workflows/tuleap-bug-sync.json` into n8n (UUID fix from 2026-04-07 still not live in the deployed workflow).
- Verify bug sync end-to-end after re-import.

**New ADRs:**
- `ADR-0009 — tracker_config naming + qcProjectId/tuleapProjectId convention`
- `ADR-0010 — RBAC catalog as the source of truth for permissions and roles`

---

## 9. Rollout, Testing, and Risk

**Phase dependencies:**

```
Phase 1 (RBAC catalog)
  └─► Phase 2 (IA — uses catalog keys for gating)
        └─► Phase 3 (code structure — boot validator depends on catalog;
                     module URLs match the IA URL plan)
              └─► Phase 4a (route-prefix renames, identity rule formalization)

Phase 4b (table/column renames, unified-PATCH fix, n8n re-import)
   — independent; can run in parallel with any of Phases 2/3
```

Phase 4 is split into two tracks: **4a** (route-prefix renames, identity rule formalization) depends on Phase 3's module layout; **4b** (table/column renames, unified-PATCH fix, n8n re-import) is independent of all earlier phases and can run in parallel.

**What "coordinated breaking change" looks like per phase:**

| Phase | Pre-cutover | Cutover deploy | Post-cutover |
|---|---|---|---|
| 1 — RBAC | Catalog lives alongside legacy keys; old key strings aliased | Middleware switches to catalog-only resolution; alias map deleted | Old keys removed from `user_permissions` |
| 2 — IA | New `/me/*`, `/work/*`, etc. served alongside old URLs with 301s in the other direction | Old URLs deleted from `routes.ts` and Next.js | Navbar uses new sections only |
| 3 — Code | Both `/` and `/api` mounts active; new module layout in place | `/` mount removed; duplicate route files deleted | Boot validator enforces catalog coverage |
| 4 — Domain | `CREATE VIEW tuleap_sync_config AS SELECT * FROM tracker_config`; both names readable | View dropped; old name fails | n8n workflow re-imported; bug sync verified |

Each cutover is one deploy on one announced day. No long-running shims.

**Risk register:**

| Risk | Mitigation |
|---|---|
| Each CI/CD deploy can break auth via the `JWT_SECRET` shell-interpolation bug | Pre-flight check in `deploy.yml` that the `printf '%s\n'` lines are intact; post-deploy verification per the existing runbook |
| n8n bug-sync workflow still on the broken pre-2026-04-07 UUID version | Schedule the re-import inside the Phase 4 cutover window; verify before declaring Phase 4 done |
| Long-lived branch on a wide-scope project | Each phase ships to `main` independently; no phase branch lives >2 weeks; deploy to staging per phase, run the Phase-N test suite, then prod |
| 17 pre-existing test failures (`developmentPlans.*`, `db-connection.test.js`) mask new regressions | Fix them inside Phase 3 (`modules/lifecycle/__tests__/`) as part of the move |
| Designing the RBAC catalog wrong in Phase 1 locks in mistakes for Phases 2-4 | Catalog file lands as its own PR ahead of any consumer code; reviewed standalone before any middleware change |

**Rough sizing (calendar time, sequential):** Phase 1 ≈ 1-2 weeks, Phase 2 ≈ 2 weeks, Phase 3 ≈ 2-3 weeks, Phase 4 ≈ 1-2 weeks. **Total ≈ 7-9 weeks** if strictly sequential; ~6-7 weeks if Phase 4's data-model renames run in parallel with Phase 3.

---

## 10. Appendix — File-Level Impact Summary

**New files (Phase 1):**
- `apps/shared/rbac/catalog.ts` — single source of truth
- `apps/api/src/config/rbac.js` — codegen mirror (or shared import)
- `apps/api/src/middleware/canUserPerform.js` — resolver
- `apps/api/__tests__/rbac.catalog.test.js`

**Modified (Phase 1):**
- `apps/api/src/middleware/authMiddleware.js` — `requirePermission` / `requireAnyPermission` switch to catalog
- `apps/web/src/config/routes.ts` — references catalog keys
- `apps/web/app/settings/roles/page.tsx` — generated from catalog

**Moved (Phase 3):**
- All `apps/api/src/routes/*.js` → `apps/api/src/modules/{domain}/*.routes.js`
- `apps/api/src/services/persisters/`, `emitters/`, `tuleap*` → `modules/integration/` (or split across `work/`, `testing/`)
- All `apps/web/app/*` → `apps/web/app/{me,work,test,quality,team,admin}/*` per Phase 2 URL plan
- `apps/web/src/lib/api.ts` → `apps/web/src/lib/api/{identity,work,testing,quality,lifecycle,integration}.ts`

**Deleted (Phase 3):**
- `apps/api/src/routes/dashboard.js`
- `apps/api/src/routes/managerView.js`
- `apps/api/src/routes/taskTestCases.js` and `testCaseTasks.js` (merged)
- `apps/api/src/routes/testExecutions.js` and `testResults.js` (merged into `test-runs.routes.js`)
- `apps/web/app/dashboard/`

**Migrations (Phase 1):**
- `028_create_permissions_lookup_table.sql` (inserts namespaced keys for admin UI mirror)
- `029_rewrite_permission_keys.sql` (rewrites `user_permissions.permission_key` from old → new; gated by Phase 1 cutover)

**Migrations (Phase 4):**
- `030_rename_tuleap_sync_config_to_tracker_config.sql` (rename + view shim)
- `031_drop_dead_columns.sql` (`field_mappings`, `status_mappings`, `standalone_bugs`)
- `032_drop_tracker_config_view.sql` (post-cutover)
- `033_renumber_legacy_migrations.sql` (cosmetic — operates on a tracking table only)

---

## 11. Implementation Plan

This design is the input to `superpowers:writing-plans`. Each of the four phases will get its own implementation plan with tasks, file-level diffs, test additions, and cutover checklists. Phases land as independent PRs to `main`, deployed to staging first, then production after the Phase-N test suite is green.
