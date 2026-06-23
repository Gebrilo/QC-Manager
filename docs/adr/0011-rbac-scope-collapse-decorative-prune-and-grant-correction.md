---
status: accepted
amends: 0010
---

# Collapse ownership scope into one dropdown, prune decorative permission keys, and correct the built-in role grants — as an amendment to ADR 0010

## Context

A restructure proposal ("remove over-engineering from RBAC") was raised. Held against
the code it was largely written **before ADR 0010 shipped**, and several of its premises
are contradicted by what is now in production (`RBAC_UNIFIED=on`):

- **"Two overlapping registries (`qc.*` and `bugs.*`)" — false.** There is exactly one
  namespace, `qc.<domain>.<action>`. The proposed rename to bare `domain.action` is pure
  churn over a freshly-stabilised authz core; **rejected**.
- **"16 slots per domain" is a UI problem, not a data problem.** Ownership scope already
  lives in suffix keys (`qc.bugs.view_own|_team|_any`) consumed by a live `AccessEngine`
  (`apps/api/src/access/AccessEngine.js`). The proposal's "one key + scope value" with an
  `ownership_scope` column would force an AccessEngine rewrite, a re-seed, and re-validation
  of the ADR 0010 truth-table — the exact churn 0010 just paid down.
- **Many catalog keys are decorative — defined as vocabulary, enforced on zero routes:**
  `bugs.change_severity|triage|reopen|close|change_priority`, `testcases.execute|approve|
  clone|import|export`, `tasks.take_over|approve_completion|log_time`. Granting them changes
  nothing. They are the real over-engineering, and they violate the proposal's own rule
  ("do not show permissions not implemented in backend checks").
- **Several "critical fixes" were already satisfied or hollow.** Tester already executes
  via `qc.testexecutions.create` + `qc.testresults.upload`; severity is a *field* edited via
  `bugs.edit`; PM holds **no** `qc.admin.*`/settings key (the symptom was a sidebar nav
  artifact, since removed by 0010's frontend cutover).
- **"Project" scope barely exists.** Only `pm_of_projects` (the `project_managers` table,
  an AccessEngine branch) and a view-only `project_teams` branch; the sole `_project` key is
  `qc.reports.view_project`. There is no project-scoped create/edit/delete anywhere.
- **Security requirements are mostly already met.** 0010's frontend cutover gates the
  sidebar and routes on `effective_permissions`/`effective_scopes`; `adminOnly` /
  `NAVIGATION_SECTIONS[].roles` are gone.

So the genuine, valuable core of the proposal is narrower than stated: **(1)** a UI that
collapses scope into one dropdown per action, **(2)** pruning decorative keys, **(3)**
correcting the built-in role grants (scopes too narrow; deletes too admin-centric), and
**(4)** completing the matrix so every enforced domain appears. This ADR adopts that core as
an **amendment to ADR 0010** — the `qc.*` namespace and matrix-as-runtime-source-of-truth
stand.

## Decision

### 1. Collapse ownership scope in the UI only — keep the suffix-key data model

The matrix renders **one dropdown per (domain, action)** with values
`No Access / Own / Team / Any`. The dropdown maps to the existing suffix keys; the backend,
`AccessEngine`, the seed, and the truth-table are untouched:

| Dropdown | Keys written |
|---|---|
| No Access | none |
| Own | `qc.<d>.<a>` (bare) |
| Team | bare + `qc.<d>.<a>_team` |
| Any | bare + `qc.<d>.<a>_any` |

The bare key keeps its existing double duty — endpoint gate **and** implicit own-scope
(`AccessEngine.hasBareVerb`). Read-back uses scope priority `any > team > own/bare > none`.

### 2. Prune the redundant `_own` family and all decorative keys

`_own` is redundant (bare already encodes own scope), so the `_own` family is removed from
the vocabulary; the migration converts any legacy `_own`-only holder to the bare key. All
**decorative** keys (enforced on zero routes) are removed from the catalog and matrix.
Capability is expressed through the enforced `view/create/edit/delete` keys; the desired
*behaviour* is delivered by **widening scope**, not by minting keys.

### 3. Ownership vocabulary is `own / team / any` — no generic project tier

"Project" is **not** a generic dropdown value (it isn't enforceable for writes, per the
proposal's own §10.1). The one principled exception is PM (§5).

### 4. Mint a new key only when a real, separately-wanted capability is wired

This restructure mints exactly one: **`qc.bugs.change_severity`**, team-scoped, wired to a
dedicated severity-only update path (`PATCH /bugs/:id/severity`). It lets Tester/TM
re-classify severity on team bugs while `bugs.edit` stays `own` — delivering the proposal's
§6.2 without granting full edit on others' bugs.

### 5. PM becomes a project-scoped doer via `pm_of_projects`

PM gains `create/edit/delete` on bugs, user_stories, and tasks, **scoped to projects it
manages** by extending the existing `pm_of_projects` AccessEngine branch to write verbs
(today it honours only `view` for reports). PM also gains `view`+ export on test
cases/suites/runs. In the matrix, PM's write cells display a computed **"Project (PM)"**
badge — not a selectable fourth dropdown value for other roles — so the matrix does not
under-represent PM's reach.

### 6. Viewer/Contributor gain team-scope reads; `blockContributors` is removed

Viewer and Contributor gain `view = team` on bugs/test-cases/suites/runs/user-stories. The
hardcoded `blockContributors` middleware (a leftover role gate that 403s contributors on
Quality features regardless of grants) is **removed** and replaced by ordinary permission
checks on every route that relied on it. **Contributor's `preparation_only` status-scope is
dropped** — otherwise the new reads are empty in practice (most artifacts aren't in
PREPARATION status).

### 7. Delete is broadened, but local soft-delete is decoupled from Tuleap propagation

Grants: Tester `delete = own` (bugs, test_cases), TM `delete = team` (six domains), PM
`delete = project` (bugs, tasks, user_stories). Because every delete of a synced artifact
currently emits a **hard delete to Tuleap** (and 502s on failure), non-admin deletes become
**local soft-delete only (no Tuleap emit)**; propagating a delete to Tuleap stays admin-only
(or behind an explicit confirmation step). This honours the proposal's §7.1 safer option and
bounds the blast radius of the broadened grants.

### 8. The matrix shows every enforced domain, from one shared source

The role editor and the matrix both derive their domain/permission list from a **single
shared catalog source** (they had drifted because each derived its own). Scoped artifact
domains (task, bug, test_case, test_suite, test_execution, user_story) render with the §1
dropdown; **flat** domains (projects, resources, reports, governance, journeys, dev_plans,
team, quality, admin) render as Yes/No. Every domain backed by ≥1 enforced key appears;
only the pruned decorative keys are hidden. The `test_execution` tab is relabelled
"Test Runs / Executions"; **no internal key is renamed**.

## Migration & rollout (idempotent, in `db.js`, one-shot marker)

1. **Update `catalog.ts`** — prune `_own` + decorative keys, set the corrected built-in role
   grants and scopes, add `qc.bugs.change_severity`. This fixes fresh installs and the
   truth-table baseline.
2. **One-shot migration** that **hard-overwrites** the six built-in roles' `role_permissions`
   (and `role_scopes`) to the new catalog-derived target set, guarded by its own marker so it
   runs once. Custom roles are untouched. Every change is audited via 0010's
   `auditRolePermissionChange`, so any pre-existing built-in customisation is recoverable.
3. **AccessEngine** changes: extend the `pm_of_projects` branch to write verbs; add the
   severity-only path; remove `blockContributors`; decouple delete from Tuleap emit.
4. **Verification (§Verification).**

The ADR 0010 **truth-table** stays a *parity* guard (legacy vs unified resolver agree); it
does **not** catch the new defaults, since both sides read the updated catalog.

## Verification

- **Golden-matrix snapshot** (the new regression backbone): asserts each built-in role's
  effective (permission + scope) set equals the agreed target — the role matrix becomes an
  enforced, reviewable spec.
- **AccessEngine integration tests** for the new branches: PM project writes, the severity
  gate, Viewer/Contributor team reads, delete/Tuleap decoupling, `blockContributors` removal.
- **Curated E2E** for browser/route-only guarantees: direct-URL 403, API 403, Tester
  severity happy-path. The remaining §13 scenarios are already covered (admin-uneditable via
  `is_protected`, PM-no-settings, sidebar) and are not duplicated.

## Considered options (rejected)

- **Rename `qc.*` → bare `domain.action`.** Cosmetic churn over a freshly-stabilised core;
  re-keys every row, test, and gate. Rejected.
- **Move scope into an `ownership_scope` column (scope-free keys).** Forces an AccessEngine
  rewrite, re-seed, and truth-table re-validation for a UI-only benefit. Rejected.
- **Add a generic `_project` tier for all domains.** Net-new keys + AccessEngine write
  branches the features don't need; violates §10.1. Rejected (PM-only exception via the
  existing `pm_of_projects`).
- **Mint the proposal's special-action keys (assign, change_status, clone, import, export,
  link_to_*, reopen).** Their features don't exist or are already gated by coarse
  create/edit/manage keys; minting them adds *more* over-engineering. Rejected (prune +
  scope instead); the single justified exception is `bugs.change_severity`.
- **Force a full re-seed (bump seeded-marker).** Clobbers deliberate admin edits — the exact
  data-loss 0010's marker prevents. Rejected (hard-overwrite of built-ins only, audited).

## Consequences

- New glossary terms for `CONTEXT.md`: **Ownership-scope dropdown**, **Decorative key**,
  **Severity gate** (`qc.bugs.change_severity`), **PM project-write** (`pm_of_projects`
  extended to writes), **Local soft-delete vs Tuleap propagation**, **Golden-matrix test**.
- `bugs.edit` stays `own` for Tester; severity is the *only* field a Tester can change on a
  non-owned team bug — recorded so nobody "fixes" it by widening `bugs.edit`.
- Deleting a synced artifact no longer reaches Tuleap for non-admins; a future reader seeing
  a locally-deleted artifact still present in Tuleap should expect that (it is by design).
- The matrix now lists flat domains as Yes/No alongside scoped dropdowns; mixing the two
  render modes in one grid is deliberate (§8), not an inconsistency.
