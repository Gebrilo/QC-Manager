---
status: accepted
---

# The permission Matrix (DB) is the runtime source of truth for authorization; the catalog becomes vocabulary + seed

## Context

Authorization in QC-Manager resolves through **three disagreeing paths**, and the admin
"Permissions Matrix" controls almost none of them at the API boundary:

1. **`requirePermission(key)`** (`apps/api/src/middleware/authMiddleware.js:185`) →
   `canUserPerform()` in `apps/shared/rbac/catalog.ts:442`. It resolves a role's base
   permissions from the **in-code** `ROLE_DEFINITIONS`, then applies per-user
   `user_permissions` rows as overrides. **It never reads the `role_permissions` table the
   Matrix writes.**
2. **`RoleResolver.resolve()`** (`apps/api/src/access/RoleResolver.js:58`) →
   `loadRolePermissions()` **does** read `role_permissions` (catalog fallback when empty),
   then merges `user_permissions`. This one honours the Matrix. It also feeds the frontend's
   `effective_permissions` via the auth response (`apps/api/src/routes/auth.js:202`).
3. **`requireRole('admin','team_manager', …)`** (`authMiddleware.js:93`) → compares
   `req.user.role` to a hardcoded list. Ignores both the catalog permissions and the DB.
   It is the single most-used gate in the API (see `routes/governance.js`, `journeys.js`,
   `developmentPlans.js`, …).

The frontend mirrors the same split: `apps/web/src/config/routes.ts` gates routes on
`permission` (DB-backed, good) **plus** `adminOnly: true` and `NAVIGATION_SECTIONS[].roles`
(hardcoded role gates the Matrix can't touch).

The reason "granting a permission in the Matrix" only *partly* works today is a lossy
denormalization: saving the Matrix (`apps/api/src/services/rolePermissions.js:144-157`)
doesn't just write `role_permissions` — it **fans out** the role's permission set into
per-user `user_permissions` (`granted=true`) rows for every current holder of that role, and
`auth.js:117-132` reseeds the same rows on user-create / role-change. So:

- A Matrix **grant** reaches `requirePermission` endpoints (via the fan-out), but a Matrix
  **revoke** of a catalog-default permission does **not** (the fan-out never writes
  `granted=false` tombstones).
- `requireRole` endpoints ignore the Matrix entirely.
- The fan-out's `DELETE … WHERE user_id IN (holders of the role)` (`rolePermissions.js:144`)
  **wipes genuine per-user exceptions** (set via `routes/users.js:228`) on every Matrix save —
  a latent data-loss bug.

This is why prior fixes were whack-a-mole (PR #260 whitelisted `pm` in a nav section, PR #261
swapped one `requireRole` for `requirePermission`): the defect is structural, not per-endpoint.

> Schema note: as with ADR 0009, the **live** schema path is the idempotent runtime block in
> `apps/api/src/config/db.js` — it owns `role_permissions`, `user_permissions`, `custom_roles`.
> Per the project's deploy reality, **out-of-band SQL migrations can miss production**; the
> `db.js` bootstrap is the only path guaranteed to run on deploy. All DDL/data migration here
> targets `db.js`.

## Decision

**The database is the runtime source of truth for authorization.** `role_permissions` +
`role_scopes` define each role; sparse `user_permissions` + `user_scopes` rows are per-user
exceptions. The catalog (`catalog.ts`) is demoted from a *runtime authority* to **(1)** the
permission/scope **vocabulary**, **(2)** the scope→status **definitions**, **(3)** the
inheritance graph as **seed-only metadata**, and **(4)** the bootstrap **seed**. One resolver
serves both API enforcement and the frontend.

### 1. One resolver, one algebra

`RoleResolver` is the sole authority. `requirePermission` / `requireAnyPermission` delegate to
it (per-request cached via `req._accessResolverCache`). `canUserPerform` demotes to a **pure
set-membership helper** the client runs against `effective_permissions` (no DB, no role-from-code).

- `effectivePermissions = role_permissions ∪ user_permissions[granted=true] − user_permissions[granted=false]`
- `effectiveScopes      = role_scopes      ∪ user_scopes[granted=true]      − user_scopes[granted=false]`
- The admin `*` wildcard matches **any** key in the membership test (so a freshly-minted key
  never 403s admin before it is seeded).

### 2. Drop the fan-out; per-user rows are a sparse delta

Delete the fan-out writers (`rolePermissions.js:144-157`, `auth.js:117-132`). `role_permissions`
is the role layer; `user_permissions` holds only rows that **differ** from the role
(`true` = elevation above the role, `false` = restriction below it). Revoke at the role level
becomes "the key is simply absent from `role_permissions`" — it works for free, and Matrix saves
stop clobbering per-user exceptions.

### 3. No endpoint stays role-gated

Every `requireRole` / `adminOnly` / `NAVIGATION_SECTIONS[].roles` gate becomes a permission gate.
Mint a **new permission key** for any endpoint that lacks one, add it to the catalog vocabulary,
and seed it onto exactly the roles that passed the old gate (so reachability is preserved). The
`requireRole` middleware is removed once unused.

### 4. Inheritance is frozen at seed time

`role_permissions` stores each role's **full flat set**. The catalog's `inherits` (e.g.
`team_manager` inherits `tester`) is applied **only when generating the seed** — editing a parent
role in the Matrix does **not** cascade. The resolver stays a single flat-set membership test
(no runtime graph walk). This matches today's behaviour and needs no row migration; it is
recorded here so nobody later assumes cascade.

### 5. Scopes move into the DB, symmetrically with permissions

The role-attached behavioural scopes (`team`, `active_only`, `preparation_only`) move out of
code `ROLE_DEFINITIONS` into a new `role_scopes` table, with a `user_scopes` exception tier
(two-tier, like permissions). The scope **definitions** (which statuses each scope maps to)
stay in `catalog.ts` — they are policy invariants, not admin-editable. The Matrix grows a
per-role scope control plus a per-user scope-exception editor; scope changes are audited like
permission changes (`auditRolePermissionChange` analogue).

Scopes are **subtractive** (they narrow access), which inverts the per-user semantics:
`user_scopes(active_only, granted=false)` *exempts* a user from a restriction and therefore
**broadens** access. To prevent that from resurrecting a dead account, `requireStatusScope`
enforces a **terminal-status floor**: `SUSPENDED` / `ARCHIVED` are never scope-exemptable, so an
exemption can only widen access *within* safe statuses. (`requireAuth` already blocks on the
separate `app_user.active` flag.)

### 6. Lockout backstop

Because managing permissions is now itself a revocable permission, two protections apply:

- **Last-keyholder invariant** (everyday prevention): `syncRolePermissions` and the per-user
  override path **reject** any write that would leave **zero active users** holding
  `qc.admin.manage_permissions` (and `qc.admin.manage_roles`), **counting custom-role holders**.
  The built-in `admin` role's `*` is immutable in the Matrix (`is_protected`, already present).
- **Break-glass** (out-of-band recovery): the `db.js` bootstrap re-grants `*` to `admin` on
  startup if no active user holds `qc.admin.manage_permissions` — covering bad SQL, a bad
  migration, or a deactivated last admin that the invariant can't see.

### 7. Custom roles

A new custom role is born with **zero permissions** (deny-by-default; admin builds it up
explicitly — no clone-from-base, which silently over-grants) and **`active_only` scope**
(confined-by-default; an empty scope set would be the *most* permissive option and the only
status-unconfined role in the system). The B8 terminal-status floor backstops it.

### 8. Frontend trusts the data; the API is the security boundary

The frontend is **not** the security boundary — the API enforces. So the frontend cutover gets
*lighter* rigor than the API: push `effective_scopes` through the auth response, delete
`adminOnly` / `NAVIGATION_SECTIONS[].roles`, gate purely on `effective_permissions` +
`effective_scopes`, and verify with a per-role "log in, assert sidebar sections" smoke test.
Residual menu drift is cosmetic (a wrongly-hidden item is a Matrix grant away; a wrongly-shown
item still 403s at the API). **`effective_scopes` plumbing is mandatory** — without it, routes
that gate on `scopes` fall back to stale catalog values and re-open the original bug on the scope
axis.

## Migration & rollout (all idempotent, in `db.js`, behind a kill-switch)

1. **Seed** `role_permissions` / `role_scopes` from the catalog **only for un-seeded roles**,
   guarded by an explicit **per-role seeded-marker** (a `rbac_seeded` flag / migration version),
   **not** by row-count — so a role an admin has deliberately emptied is never re-seeded.
2. **Collapse `user_permissions` to a delta**: after the seed, delete every row **redundant**
   with the role's set (`granted=true` where the key ∈ the role's `role_permissions`). What
   survives is genuine elevation/restriction. Stop all fan-out writes. (`user_scopes` is new and
   empty — nothing to collapse.)
3. **Verify** with a generated **(role × gate) truth-table**: enumerate every route's *old*
   decision per role (`requireRole` → role ∈ list; `requirePermission` → `canUserPerform`) and
   its *new* decision from the unified resolver; assert **old == new** for every (role, route)
   pair **except an explicit intended-changes allowlist**. That allowlist is both the safety net
   and the precise spec of what this effort changes.
4. **Ship behind `RBAC_UNIFIED`** — an env kill-switch that reverts resolution to the old path
   without a redeploy if a regression slips (the CI deploy has been flaky before).
5. **Frontend cutover** per §8.

**Rollback:** flip `RBAC_UNIFIED` off. The seed and the `user_permissions` collapse are forward
data changes; the old resolver continues to read `role_permissions` (it already did) and the
catalog defaults, so a flag-off system behaves as it did pre-cutover for built-in roles.

## Considered options (rejected)

- **Keep code as the runtime authority; Matrix edits only per-user overrides.** Leaves the
  "Matrix doesn't control the API" lie in place and keeps the fan-out. Rejected — it's the status quo.
- **Fix the fan-out instead of dropping it** (write `granted=false` tombstones for un-checked
  catalog defaults). Doubles down on a denormalization that already caused a data-loss bug and
  forces tombstones to track the catalog forever. Rejected.
- **Live runtime inheritance** (store only a role's own delta, re-expand `inherits` per resolve).
  A genuinely larger feature — distinct Matrix UI (own vs inherited cells), graph walk on the hot
  path, harder lockout reasoning. Nothing in the goal requires it. Rejected (frozen-at-seed).
- **Scopes stay code-defined.** Smaller scope, but leaves a second authorization axis the Matrix
  can't govern and re-opens the same complaint on status gating. Rejected (scopes move to DB).
- **Shadow dual-run in prod for verification.** Weaker than the offline truth-table for authz,
  because the dangerous regressions hide on *rare* endpoints that prod traffic won't exercise.
  Rejected in favour of the exhaustive (role × gate) diff.
- **Big-bang cutover, no flag.** No escape hatch on an authz change that can lock people out.
  Rejected (kill-switch).

## Consequences

- The catalog's `inherits` is now **seed-only**; a future reader editing a parent role will see no
  cascade. Called out in §4 to prevent a "bug" report.
- "Single source of truth" means **permissions and scopes**. Scope *definitions* and the protected
  manage-permissions core remain code/invariant-governed — an honest asterisk, not a gap.
- New glossary terms for `CONTEXT.md`: **Role Permission** (a `role_permissions` row),
  **Permission Exception** (a `user_permissions` delta row), **Role Scope** / **Scope Exception**,
  **Seeded-marker**, **Last-keyholder invariant**, **Intended-changes allowlist**.
- Per-request authorization now loads the role's full effective set once (cached); negligible vs.
  the previous targeted query, and it removes N per-key queries from `requireAnyPermission`.
- An admin clicking in the Matrix can now lock a role out of an endpoint — that power is the point
  of the feature; the last-keyholder invariant and break-glass bound its blast radius.
