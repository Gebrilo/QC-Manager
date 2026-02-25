# Quickstart: Tasks Kanban View

**Feature**: `002-tasks-kanban-view`
**Date**: 2026-02-25

---

## Local Development Setup

1. **Ensure the app is running**:
   ```bat
   .\start_app.bat
   ```
   Or for frontend-only with mocked data:
   ```bash
   cd apps/web && npm run dev
   ```

2. **Navigate to the Tasks page**:
   Open `http://localhost:3002/tasks`

---

## Visual Verification Checklist

### View Toggle
- [ ] A view toggle (table icon / board icon) is visible in the top-right of the Tasks page header.
- [ ] Clicking "Board" switches the main content from the table to a Kanban board.
- [ ] Clicking "Table" switches back to the existing table view.
- [ ] Navigating away and returning restores the last selected view.

### Kanban Board — Desktop
- [ ] 4 columns are rendered: **Backlog**, **In Progress**, **Done**, **Cancelled**.
- [ ] Each column header shows the correct task count.
- [ ] Task cards inside each column show: task name, project name, assignee, deadline (if set), priority badge.
- [ ] Cards use the `.glass-card` Liquid Glass styling.
- [ ] Dragging a card to a different column moves it visually and updates its status on release.
- [ ] If the status update fails, the card reverts to its original column.

### Kanban Board — Mobile (≤ 767px)
- [ ] Each card renders a status dropdown instead of a drag handle.
- [ ] Selecting a new status from the dropdown updates the task status and moves it to the correct column.

### Empty States
- [ ] A column with no tasks shows an empty-state message (e.g., "No tasks").

### Style Consistency
- [ ] Filter bar, view toggle, and page header match the Liquid Glass aesthetic.
- [ ] Empty and non-empty column containers use `.glass-panel` or equivalent styling.
- [ ] All task cards are visually consistent with other card components in the app.

---

## Regression Check (Table View)
- [ ] Sorting by column still works.
- [ ] Filtering by project, status, assignee, and search term still filters correctly.
- [ ] Pagination still works (if applicable).
- [ ] "Edit" action on a table row still navigates to the task edit page.
