# Data Model: Tasks Kanban View

**Feature**: `002-tasks-kanban-view`
**Date**: 2026-02-25

---

## Entities

### Task (Existing — No Schema Changes Required)

The `Task` entity already contains all fields needed for the Kanban view. No database migrations are required.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `task_id` | string | Display ID (e.g., TSK-001) |
| `project_id` | UUID | FK to Project |
| `task_name` | string | Required |
| `status` | enum | `'Backlog' \| 'In Progress' \| 'Done' \| 'Cancelled'` |
| `priority` | enum | `'High' \| 'Medium' \| 'Low'` (optional) |
| `resource1_id` | UUID | Primary assignee |
| `resource2_id` | UUID | Secondary assignee (optional) |
| `resource1_name` | string | Joined field from API View |
| `resource2_name` | string | Joined field from API View |
| `project_name` | string | Joined field from API View |
| `deadline` | string | ISO date, optional |
| `total_est_hrs` | number | Computed from resource estimates |

### Task Status (Existing)

The `status` field determines which Kanban column a task belongs to.

| Status Value | Kanban Column | Order |
|---|---|---|
| `Backlog` | Backlog | 1st |
| `In Progress` | In Progress | 2nd |
| `Done` | Done | 3rd |
| `Cancelled` | Cancelled | 4th |

### View Preference (Client-Side — No DB Entity)

Stored in `localStorage` only. Not persisted to the database.

| Key | Value type | Default |
|-----|-----------|---------|
| `qc_tasks_view` | `'table' \| 'board'` | `'table'` |

---

## State Transitions

The following status transitions are permitted (any column → any column, mirroring existing table view edit behavior):

```
Backlog ↔ In Progress ↔ Done
   ↕           ↕         ↕
        Cancelled
```

A task may transition to any status from any status via drag-and-drop or the mobile dropdown. No business rules restrict transitions in v1. This mirrors the existing behavior in the task edit form.

---

## Notes

- No new database tables or columns are required.
- No new API routes are required.
- The existing `PATCH /api/tasks/:id` endpoint is used to persist status changes.
