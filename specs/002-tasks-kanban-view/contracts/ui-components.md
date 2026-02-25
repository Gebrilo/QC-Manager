# UI Component Contracts: Tasks Kanban View

**Feature**: `002-tasks-kanban-view`
**Date**: 2026-02-25

---

## New Components

### TaskKanbanBoard

The primary Kanban board component. Renders tasks grouped into status columns.

```typescript
interface TaskKanbanBoardProps {
  tasks: Task[];
  isLoading: boolean;
  onStatusChange: (taskId: string, newStatus: Task['status']) => Promise<void>;
}
```

**Behavior**:
- Renders 4 columns: Backlog, In Progress, Done, Cancelled
- Each column header shows the status label + task count badge
- On drag-start: sets a dragging state on the card; applies opacity change
- On drop: calls `onStatusChange(task.id, destinationStatus)` immediately (optimistic)
- On error from `onStatusChange`: reverts task to original column
- On mobile (`< md`): renders a `<select>` dropdown on each card instead of drag handles

---

### TaskKanbanCard

A single task card rendered inside a Kanban column.

```typescript
interface TaskKanbanCardProps {
  task: Task;
  onStatusChange: (newStatus: Task['status']) => void; // mobile fallback
  isDragging: boolean;
}
```

**Displayed Fields**:
- `task.task_name` — primary label (links to `/tasks/:id`)
- `task.project_name` — secondary subtitle, optional
- `task.resource1_name` — assignee avatar with initial + name
- `task.deadline` — if present, shown as a colored due-date chip (red if overdue)
- `task.priority` — small badge (High/Medium/Low) with appropriate color

**Styling**: Uses `.glass-card` with `p-4 rounded-xl` — inherits the global Liquid Glass aesthetic.

---

### ViewToggle

A segmented control to switch between Table and Board views.

```typescript
interface ViewToggleProps {
  view: 'table' | 'board';
  onChange: (view: 'table' | 'board') => void;
}
```

**Behavior**:
- Renders two icon buttons (table icon / Kanban icon) in a pill-shaped container
- Active view button uses filled indigo style
- Inactive button uses glass-button-secondary style
- `localStorage` key: `qc_tasks_view`

---

## Modified Components

### `app/tasks/page.tsx`

- Adds `viewMode: 'table' | 'board'` state, initialized from `localStorage`.
- Adds `handleStatusChange(taskId, newStatus)` function using `fetchApi(PATCH /tasks/:id)`.
- Renders `<ViewToggle>` in the header action bar.
- Conditionally renders `<TaskTable>` or `<TaskKanbanBoard>` based on `viewMode`.

---

## API Contract (Existing — No Changes)

### PATCH /api/tasks/:id

Used to persist status changes from drag-and-drop.

**Request body**:
```json
{ "status": "In Progress" }
```

**Response on success**: `200 OK` with updated Task object.
**Response on error**: `4xx/5xx` — triggers UI rollback.
