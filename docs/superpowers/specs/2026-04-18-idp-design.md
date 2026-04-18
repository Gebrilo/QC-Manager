# Individual Development Planning (IDP) — Design Spec
_Date: 2026-04-18_

## Overview

Extend the existing Journeys system to support Individual Development Planning (IDP) for ACTIVE users, manager oversight, progress tracking, and performance reporting. This is a feature extension — not a redesign. The existing onboarding journeys remain unchanged.

---

## Core Concept

| User Status   | Journeys page shows      | Data source              |
|---------------|--------------------------|--------------------------|
| PREPARATION   | My Journeys (onboarding) | existing journeys system |
| ACTIVE        | My Development Plan      | IDP plan (new plan_type) |

The frontend `/journeys` page already switches the title based on `userStatus`. We extend it to fetch from the IDP endpoint when status is ACTIVE.

---

## Architecture Decision

**Approach chosen:** New `/development-plans` route namespace backed by existing journey tables.

- Existing `journeys / journey_chapters / journey_quests / journey_tasks` tables are reused
- Hierarchy mapping: Journey = Plan, Chapter = Objective, Task = Action Item (quests are skipped for IDPs)
- New route file: `apps/api/src/routes/developmentPlans.js`
- Existing onboarding journeys are unaffected (`plan_type = 'onboarding'` default)

---

## Schema Changes

Minimal additive changes only — no existing columns removed or renamed.

```sql
-- Migration 022: IDP support
-- Extend journeys for per-user development plans

ALTER TABLE journeys
  ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (plan_type IN ('onboarding', 'idp')),
  ADD COLUMN owner_user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  ADD COLUMN created_by_manager UUID REFERENCES app_user(id);

ALTER TABLE journey_chapters
  ADD COLUMN due_date DATE;

ALTER TABLE journey_tasks
  ADD COLUMN due_date DATE,
  ADD COLUMN priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  ADD COLUMN difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- IDP tasks need tri-state progress (TODO / IN_PROGRESS / DONE).
-- Existing onboarding completions receive DEFAULT 'DONE' — fully backward-compatible.
ALTER TABLE user_task_completions
  ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'DONE'
    CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'DONE'));

-- "No row" = TODO. Inserting with IN_PROGRESS allows partial tracking.
-- Existing INSERT (no column specified) → gets DEFAULT 'DONE'. No existing code changes needed.

CREATE INDEX idx_journeys_owner_user ON journeys(owner_user_id);
CREATE INDEX idx_journeys_plan_type  ON journeys(plan_type);

COMMENT ON COLUMN journeys.plan_type      IS 'onboarding = shared template; idp = per-user development plan';
COMMENT ON COLUMN journeys.owner_user_id  IS 'For IDP plans only: the ACTIVE user this plan belongs to';
COMMENT ON COLUMN journeys.created_by_manager IS 'Manager who created this IDP plan';
```

**What remains unchanged:**
- `user_task_completions` — used as-is for task completion tracking
- `user_journey_assignments.total_xp` — used as-is for XP/progression
- `notification` table — used as-is for plan completion alerts
- All onboarding journey queries (filter by `plan_type = 'onboarding'` or `owner_user_id IS NULL`)

---

## API Endpoints

All endpoints in `apps/api/src/routes/developmentPlans.js`, mounted at `/api/development-plans`.

### Manager — Plan Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/:userId` | Create IDP plan for user (journey + auto-assign) |
| `GET`  | `/:userId` | Get plan with nested objectives, tasks, and progress |
| `POST` | `/:userId/complete` | Mark plan COMPLETED + award XP + notify user |
| `GET`  | `/:userId/report` | Performance report (JSON, exportable) |

**Create plan** (`POST /:userId`):
1. Validate `user.status === 'ACTIVE'` and `canAccessUser(req.user, userId)`
2. Validate no existing active IDP plan for this user
3. INSERT into `journeys` with `plan_type = 'idp'`, `owner_user_id = userId`, `created_by_manager = req.user.id`
4. INSERT into `user_journey_assignments` (auto-assign)
5. Return created plan

### Manager — Content Building

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/:userId/objectives` | Add objective (→ `journey_chapters`) |
| `PATCH` | `/:userId/objectives/:chapterId` | Update objective title / due date |
| `DELETE` | `/:userId/objectives/:chapterId` | Delete objective and its tasks |
| `POST` | `/:userId/objectives/:chapterId/tasks` | Add action item (→ `journey_tasks` via a placeholder quest) |
| `PATCH` | `/:userId/tasks/:taskId` | Update task title / status / due date / priority |
| `DELETE` | `/:userId/tasks/:taskId` | Delete task |

**Note on quests:** Since we skip quests for IDP (B1 mapping), the API creates a single system quest per objective automatically on `POST /:userId/objectives`. This quest is never exposed to the API consumer — all task endpoints accept `chapterId` and the route resolves the underlying quest internally. From the consumer's perspective, tasks belong directly to objectives.

### User — Own Plan

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/my` | View own IDP plan (requires `status = 'ACTIVE'`) |
| `PATCH` | `/my/tasks/:taskId/status` | Update task status: `TODO → IN_PROGRESS → DONE` |

**Task status update** calls `user_task_completions` INSERT (for DONE) or DELETE (for revert), consistent with existing journey task completion pattern.

### Access Control

- Manager endpoints: `canAccessUser(req.user, userId)` on every route (existing helper — auto team-scoped)
- User endpoints: scoped to `req.user.id` — no cross-user access possible
- Admin: `canAccessUser` returns true for all users

---

## Progress Calculation

Computed on `GET /:userId` and `GET /my` — no stored computed fields.

```
total_tasks          = COUNT(journey_tasks) for this plan's chapters
done_tasks           = COUNT(user_task_completions) for this user + these tasks
task_completion_pct  = done_tasks / total_tasks * 100

per_objective_pct    = done_in_chapter / total_in_chapter * 100  (per chapter)

overdue_tasks        = tasks where due_date < CURRENT_DATE AND task not in user_task_completions
overdue_objectives   = chapters where due_date < CURRENT_DATE AND chapter not fully complete
```

Plan auto-completes when `POST /:userId/complete` is called:
1. Server verifies all mandatory tasks have `user_task_completions` rows
2. `UPDATE user_journey_assignments SET total_xp = total_xp + journey.required_xp`
3. INSERT notification: `LIFECYCLE_IDP_COMPLETED` to user
4. `UPDATE journeys SET is_active = false` (soft-close the plan)

---

## Performance Report (`GET /:userId/report`)

JSON payload structure:
```json
{
  "user": { "id", "name", "email" },
  "plan": { "title", "created_at", "status" },
  "summary": {
    "total_tasks": 12,
    "completed_tasks": 8,
    "completion_pct": 67,
    "overdue_tasks": 2,
    "on_time_completed": 6,
    "late_completed": 2
  },
  "objectives": [
    {
      "title": "...",
      "due_date": "2026-06-01",
      "completion_pct": 80,
      "tasks": [
        { "title": "...", "status": "DONE", "due_date": "...", "completed_at": "...", "on_time": true }
      ]
    }
  ]
}
```

This is viewable by manager and exportable as JSON. PDF-ready format is out of scope for v1 — the JSON structure is flat enough to render in a print stylesheet later.

---

## Frontend Structure

### Manager — Team IDP Overview
**`app/manage-development-plans/page.tsx`**
- Fetches team members from `GET /manager/team?status=ACTIVE`
- For each member: calls `GET /development-plans/:userId` to get plan status + progress
- Renders a table/card list: name | plan status | completion % bar | overdue count | action
- "Create Plan" button → navigates to builder page
- "View Plan" button → navigates to detail page

### Manager — IDP Builder & Progress
**`app/manage-development-plans/[userId]/page.tsx`**
- Header: user name, plan status badge, overall completion %
- Objective list (chapters): title, due date, per-objective % ring, overdue indicator
- Under each objective: task list with status toggle, due date chip, priority badge
- Inline "Add Objective" and "Add Task" forms (no modal needed — inline expansion)
- "Mark Plan Complete" button (disabled until all mandatory tasks done)
- "Export Report" button → `GET /development-plans/:userId/report` → download JSON

### User — My Development Plan
**`app/journeys/page.tsx`** (existing file — extended)
- When `userStatus === 'ACTIVE'`: fetch from `GET /development-plans/my` instead of `myJourneysApi.list()`
- Render objectives → tasks in read-only structure
- User can update task status (TODO / IN_PROGRESS / DONE) via `PATCH /development-plans/my/tasks/:taskId/status`
  - TODO = delete `user_task_completions` row if exists
  - IN_PROGRESS = upsert row with `progress_status = 'IN_PROGRESS'`
  - DONE = upsert row with `progress_status = 'DONE'`
- Overdue tasks shown with a red indicator
- No create/edit controls (read + progress only)

---

## Invariants & Constraints

1. A user can have **at most one active IDP plan** at a time (enforced at API layer on create)
2. IDP plans are only creatable for users with `status = 'ACTIVE'`
3. Manager can only create/edit plans for users in their own team (`canAccessUser`)
4. Tasks belong to exactly one objective; objectives belong to exactly one plan
5. Deleting an objective cascades to delete its tasks and their completions
6. `plan_type = 'onboarding'` journeys are unaffected — all existing queries remain valid with no filter change needed (they already query by journey ID, not plan_type)

---

## Out of Scope (v1)

- PDF export (JSON report is sufficient for v1)
- Multiple concurrent active IDP plans per user
- SUSPENDED / ARCHIVED lifecycle states (not yet implemented in lifecycle service)
- IDP plan templates / cloning from existing journeys
- Real-time progress updates (polling on page load is sufficient)
