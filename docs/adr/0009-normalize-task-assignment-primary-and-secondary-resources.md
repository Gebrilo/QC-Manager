---
status: accepted
---

# Normalize task assignment into `task_resource_assignment` (one primary + many secondaries)

## Context

A **Task** today carries at most two resources, denormalized onto two fixed slots of
the live `tasks` table (created by the runtime bootstrap in `apps/api/src/config/db.js:86`):

- `resource1_id` + `r1_estimate_hrs` / `r1_actual_hrs` — the **primary** (owner; mapped from the Tuleap `assigned_to` field)
- `resource2_id` + `r2_estimate_hrs` / `r2_actual_hrs` — a single optional **secondary**
- task-level planning columns: `estimate_days`, `initial_estimate`, `final_estimate`, `deadline`, `completed_date`

The business needs **multiple** secondaries per task and **per-person** estimate-vs-actual
performance so a lead can see who owns a task, who supported it, and — for every contributor —
whether their actual effort matched their estimate (padded vs. blew past).

The two-slot model blocks this and carries a latent bug: the inbound Tuleap update path
(`apps/api/src/services/persisters/task.js:208`) does `resource1_id = COALESCE($assigned, resource1_id)`
but leaves `r1_*` on the row, so reassigning the primary in Tuleap **silently re-attributes the
previous owner's logged hours to the new owner**.

The `r1_*`/`r2_*` columns have a wide blast radius (~379 references), including:

- **Live views in `db.js`**: `v_resources_with_utilization` (`db.js:634`), `v_dashboard_metrics` (`db.js:670`), `v_projects_with_metrics` (`db.js:584`), `v_tasks_with_metrics` — read by `routes/projects.js`, `routes/users.js`, `routes/reports.js`.
- **Raw SQL services**: `services/dashboards/pmDashboard.js` (`getResourceUtilization`), `services/dashboards/teamMemberDashboards.js`, `routes/me.js`, `routes/dashboard.js`, `routes/resources.js`, `routes/tasks.js`, `services/persisters/task.js`.
- **Access engine**: `access/AccessEngine.js` (`assigneeResourceExprs` defaults to `[resource1_id, resource2_id]`), `services/access/enforcement.js`.
- **Validation**: `schemas/task.js`.
- **Web**: `components/tasks/TaskForm.tsx`, `app/work/tasks/{page,create,[id]/edit}.tsx`, `components/dashboard/ResourceUtilizationChart.tsx`, `components/dashboard/ResourceStats.tsx`, `app/dashboards/team-manager/TeamManagerDashboardClient.tsx`, `src/types/index.ts`, `src/lib/api/index.ts`.

> Note: the repo maintains schema in two places — the **live** path is the idempotent runtime
> migration block in `db.js` (it owns the plural `tasks` table and the `v_*` views); the numbered
> `database/migrations/*.sql` files use the singular `task` and are a dormant/legacy copy. This
> ADR targets the **`db.js` live path**.

## Decision

Introduce a normalized junction table `task_resource_assignment` as the **single source of truth**
for who is on a task and each person's effort. One row per (task, resource); `assignment_type`
distinguishes the single `PRIMARY` from any number of `SECONDARY` rows. Migrate the `r1_*`/`r2_*`
data into it, keep the legacy columns as a **synced denormalized cache** so the live `v_*` views
keep working during rollout, port every reader to the junction table, then drop the legacy
columns in a later migration.

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS task_resource_assignment (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id              UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    resource_id          UUID NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
    assignment_type      VARCHAR(10) NOT NULL
                          CHECK (assignment_type IN ('PRIMARY','SECONDARY')),
    -- per-person planning & effort (everything is per-assignment)
    initial_estimate     NUMERIC(10,2),
    final_estimate       NUMERIC(10,2),
    estimate_hrs         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimate_hrs >= 0),
    actual_hrs           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (actual_hrs >= 0),
    planned_working_days NUMERIC(10,2),
    completion_status    VARCHAR(12) NOT NULL DEFAULT 'Pending'
                          CHECK (completion_status IN ('Pending','Completed')),
    completed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- a resource cannot be assigned twice to the same task (covers primary≠secondary too)
    UNIQUE (task_id, resource_id)
);

-- exactly one PRIMARY per task
CREATE UNIQUE INDEX IF NOT EXISTS uq_tra_one_primary
    ON task_resource_assignment (task_id) WHERE assignment_type = 'PRIMARY';
CREATE INDEX IF NOT EXISTS idx_tra_resource ON task_resource_assignment (resource_id);
CREATE INDEX IF NOT EXISTS idx_tra_task     ON task_resource_assignment (task_id);
```

**Canonical unit = hours.** `estimate_hrs`/`actual_hrs` are stored in hours (migrated verbatim
from `r*_hrs`, no data conversion); the UI converts to days at a fixed `1 day = 8h` for display
and entry. `initial_estimate`/`final_estimate` keep their existing Tuleap-native units (pass-through).

### 2. Task-level numbers are derived (asymmetric rule)

All planning/effort fields live per-assignment. The `tasks` columns the forms and Tuleap still
read/write are derived:

- `tasks.initial_estimate` / `final_estimate` / `estimate_days` = **the PRIMARY assignment's** values (owner's planning number; matches Tuleap's single assigned user).
- `tasks.actual_effort` (task total) = **`SUM(actual_hrs)` across all assignments** (the example's 8h + 16h = 24h).
- New aggregate `total_estimated_effort = SUM(estimate_hrs)` across all assignments, exposed on the manager view, kept distinct from the owner's task estimate.

### 3. Tuleap sync

- **Inbound `assigned_to` → PRIMARY.** On reassignment Y→W: W becomes `PRIMARY` (promote W's existing `SECONDARY` row if present, else insert). The previous primary Y is **demoted to `SECONDARY` when `actual_hrs > 0`** (real contribution worth preserving for performance/utilization), otherwise Y's row is removed. All other secondaries are untouched. This fixes the misattribution bug. The demote-vs-remove choice is overridable in Tuleap Integration settings (spec §6, "unless intentionally configured").
- Tuleap `initial_estimate` / `pm_final_estimate` / `actual_effort` land on the **PRIMARY** row.
- **Outbound** (the task payload builder — `buildTaskPayload`, currently in `tuleapPayloadBuilder.js`; per ADR 0004 outbound is meant to live under `services/emitters/` and that file deleted, but it still physically exists — reconcile during this work): `assigned_to` = primary, `pm_final_estimate` = primary's final, `actual_effort` = **task total (`SUM(actual_hrs)`)**.
- Secondaries are **QC-local only** — the Tuleap task `assigned_to` field is single-select.
- Reuse the existing `reject`/`archive` history flow (`tuleap_task_history`) unchanged for unknown-assignee cases.

### 4. Done / completion

- Task `status` (synced with Tuleap) is **independent** of individual secondaries — Tuleap can flip status at any time, so closing never blocks on a lagging secondary.
- Replace the `tasks` CHECK that requires `(r1_actual_hrs + r2_actual_hrs) > 0`:
  `status <> 'Done' OR (completed_date IS NOT NULL AND total assignment actual_hrs > 0)` — *someone* logged effort (covers a primary who delegated all work).
- An assignee may edit **their own** assignment's `actual_hrs`/completion; the primary/PM may edit **all**.
- `completion_status` is derived by default (Pending → Completed at task close, `completed_at = completed_date`), but a person can mark their part Completed early, which **snapshots their `completed_at` and estimate-vs-actual** at that moment.

### 5. Performance & utilization

- **Per-person accuracy** at `completed_at`: `ratio = actual_hrs / estimate_hrs` → **`< 0.75` Over-estimated (padded) / `0.75–1.25` Accurate / `> 1.25` Under-estimated (blew past)**. Surface the ratio + verdict on dashboards. The ±25% band is configurable (single constant/setting).
- **Utilization stays estimate/capacity-based.** `pmDashboard.getResourceUtilization` and the team-member load query change from the two-column `CASE WHEN resource1_id = r.id … resource2_id = r.id …` shape to `SUM(estimate_hrs)` over `task_resource_assignment` rows for that resource on non-terminal tasks — so a resource's **secondary** allocations now count toward their load. Performance (actual-vs-estimate) is a separate metric over closed work.

### 6. Access

Replace the hardcoded `assigneeResourceExprs = ['t.resource1_id','t.resource2_id']`
(`AccessEngine.js:217`, `teamMemberDashboards.js:9`) and the single-row pick in
`enforcement.js:26` with an `EXISTS (SELECT 1 FROM task_resource_assignment tra
JOIN resources r ON r.id = tra.resource_id WHERE tra.task_id = t.id AND r.user_id = $user)`.
Every assignee — primary and all secondaries — keeps exactly the `view_own`/`edit_own`
assignee-branch access they have today, gated by their permission scope.

### 7. UI

`TaskForm` gains a multi-select for secondaries (same resource pool, excludes the chosen primary),
each with its own estimate / initial / final / planned-days / actual inputs. The create/edit pages,
`ResourceStats`, `ResourceUtilizationChart`, and `TeamManagerDashboardClient` gain the
primary-vs-secondary distinction and the accuracy verdict. `schemas/task.js` and
`src/types/index.ts` move from `resourceN_uuid`/`rN_*` to an `assignments[]` array.

## Migration & rollout (phased, reversible)

1. **Create** `task_resource_assignment` + constraints/indexes (idempotent, in `db.js`).
2. **Backfill** under one transaction:
   ```sql
   INSERT INTO task_resource_assignment
     (task_id, resource_id, assignment_type, initial_estimate, final_estimate,
      estimate_hrs, actual_hrs, completion_status, completed_at)
   SELECT t.id, t.resource1_id, 'PRIMARY', t.initial_estimate, t.final_estimate,
          COALESCE(t.r1_estimate_hrs,0), COALESCE(t.r1_actual_hrs,0),
          CASE WHEN t.status='Done' THEN 'Completed' ELSE 'Pending' END,
          CASE WHEN t.status='Done' THEN COALESCE(t.completed_date::timestamptz, t.updated_at) END
   FROM tasks t
   WHERE t.resource1_id IS NOT NULL AND t.deleted_at IS NULL
   ON CONFLICT (task_id, resource_id) DO NOTHING;

   INSERT INTO task_resource_assignment
     (task_id, resource_id, assignment_type, estimate_hrs, actual_hrs, completion_status, completed_at)
   SELECT t.id, t.resource2_id, 'SECONDARY',
          COALESCE(t.r2_estimate_hrs,0), COALESCE(t.r2_actual_hrs,0),
          CASE WHEN t.status='Done' THEN 'Completed' ELSE 'Pending' END,
          CASE WHEN t.status='Done' THEN COALESCE(t.completed_date::timestamptz, t.updated_at) END
   FROM tasks t
   WHERE t.resource2_id IS NOT NULL AND t.resource2_id <> t.resource1_id AND t.deleted_at IS NULL
   ON CONFLICT (task_id, resource_id) DO NOTHING;
   ```
   The `resource2_id <> resource1_id` guard and the `UNIQUE (task_id, resource_id)` together
   discard the degenerate "same resource in both slots" rows — no data loss for valid data.
3. **Dual-write cache.** A trigger on `task_resource_assignment` mirrors back to the legacy
   columns so the live `v_*` views and un-ported raw SQL keep working: `PRIMARY` →
   `resource1_id`/`r1_*` + `tasks.initial/final/estimate`; the **earliest** `SECONDARY` →
   `resource2_id`/`r2_*`; `tasks.actual_effort = SUM(actual_hrs)`. Additional secondaries
   (3rd+) are junction-only — legacy views render the ≤1-secondary case identically to today
   and merely undercount the genuinely new multi-secondary case until their reader is ported.
4. **Port readers** to the junction table incrementally: access engine → dashboards/utilization
   → `v_*` views in `db.js` → persister/Tuleap sync → web. Each PR flips one reader; the cache
   keeps the rest correct.
5. **Drop** `r1_*`/`r2_*`/`resource1_id`/`resource2_id`, the old `task_done_requires_completion`
   and `task_resource2_hours_logic` CHECKs, and the mirror trigger — only after every reader is ported.

**Rollback:** until step 5 the legacy columns remain authoritative for reads, so any pre-drop
rollback is a no-op on the read path; the junction table can be dropped independently.

## Validation rules

`UNIQUE (task_id, resource_id)` (no double-assignment, and a resource can't be both primary and
secondary); partial unique on `(task_id) WHERE assignment_type='PRIMARY'` (exactly one primary);
secondaries drawn from the same resource pool as the primary; primary required on create.

## Test matrix

- **Migration**: backfill counts (primary/secondary rows = non-deleted tasks with r1/r2),
  hours copied verbatim, duplicate-slot rows discarded, Done tasks → `completed_at` set.
- **Cache parity**: writes through the junction reproduce identical `v_resources_with_utilization`/
  `v_dashboard_metrics`/`v_projects_with_metrics` output vs. pre-migration for ≤1-secondary tasks.
- **Tuleap**: fetch sets primary; reassign Y→W promotes/demotes and preserves Y's `actual_hrs`;
  secondaries survive inbound sync; outbound pushes primary `assigned_to` + summed `actual_effort`.
- **CRUD**: create/edit with 0, 1, N secondaries; duplicate/self-assignment rejected; one-primary enforced.
- **Dashboards**: task appears as primary on owner, secondary on each supporter; manager sees full
  breakdown + `total_estimated_effort`.
- **Utilization**: a resource's secondary allocations count toward load.
- **Accuracy**: ratio bands (padded / accurate / blew past) at the ±25% boundaries; snapshot on early completion.
- **Done constraint**: blocks Done with zero total actual_hrs; allows Done when only a secondary logged hours.
- **Access**: each assignee retains `view_own`/`edit_own`; non-assignee denied.

## Considered options (rejected)

- **Hybrid (keep `r1`/`r2` + an overflow table for the 3rd+ secondary).** Smaller blast radius
  but two sources of truth; secondary #1 behaves differently from secondaries 2..N and every
  aggregate must `UNION` two shapes. Rejected — the inconsistency is permanent, not transitional.
- **Fixed extra slots (`resource3_id`…`rN_*`).** No relational rewrite, but hard-caps secondaries,
  bloats `tasks`, and every view/constraint must be edited per slot. Rejected.
- **Never auto-repoint the primary from Tuleap.** Safest against surprise shifts but breaks the
  spec's "Tuleap assigned = primary" mapping for ongoing syncs. Rejected — the contributor-preserving
  demote rule gives the safety without breaking the mapping.
- **Big-bang view rewrite (no cache).** Simpler conceptually but every dashboard/report would have
  to flip in one PR with no incremental verification on production data. Rejected — the synced cache
  buys reviewable, reversible steps.

## Consequences

- The `db.js`-vs-`database/migrations/*.sql` duality is a pre-existing hazard this change has to
  navigate; the new DDL goes in `db.js` (the live path). Worth consolidating the two schema sources
  separately.
- New glossary terms for `CONTEXT.md`: **Primary Resource**, **Secondary Resource**, **Assignment**
  (a `task_resource_assignment` row), **Estimate Accuracy** (per-person actual/estimate verdict).
- `actual_effort` pushed to Tuleap now means *total task effort* including QC-local secondaries that
  Tuleap itself can't see — intentional, but a Tuleap user reading `actual_effort` sees more than the
  single assignee's time.
