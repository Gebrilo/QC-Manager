# Feature Specification: Tasks Page Kanban View & UX Improvements

**Feature Branch**: `002-tasks-kanban-view`
**Created**: 2026-02-25
**Status**: Draft
**Input**: User description: "I want to make a change to the My tasks page to include a Kanban view, and make some improvements to the overall style of this page to be more UX/UI-friendly, while keeping the same style applied across the whole app"

---

## Clarifications

### Session 2026-02-25

- Q: Should the Kanban view show all tasks (same scope as current table) or only tasks assigned to the logged-in user? → A: Only tasks assigned to the logged-in user (B)
- Q: Which status set is canonical for Kanban column labels? → A: Use existing code values: Backlog / In Progress / Done / Cancelled (A)
- Q: When the status filter is active in Board view, what should happen? → A: Filter cards within all columns — columns stay visible, only matching cards shown (B)
- Q: If a task has an unrecognised status, what should the Board view do? → A: Show the card in the Backlog column as a safe fallback (C)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Kanban Board View (Priority: P1)

As a team member on the My Tasks page, I want to be able to switch between the existing table view and a Kanban board view grouped by task status, so I can visualize my workflow visually and manage tasks in a drag-and-drop manner.

**Why this priority**: The Kanban view is the core new capability being introduced. It directly addresses how users think about work-in-progress and allows workflow management through visual interaction rather than table rows.

**Independent Test**: Can be fully tested by navigating to the My Tasks page, clicking the "Kanban" view toggle button, and verifying that tasks appear as cards organized in columns by status — without needing any other improvement to be implemented.

**Acceptance Scenarios**:

1. **Given** the user is on the My Tasks page in Table View, **When** they click the "Board" or "Kanban" view toggle, **Then** the page switches to display vertical status columns — **Backlog, In Progress, Done, Cancelled** — with the current user's task cards in each column.
2. **Given** the user is in Kanban view, **When** they drag a task card from one column to another, **Then** the task's status is updated to reflect the destination column, and the change is persisted.
3. **Given** the user is in Kanban view, **When** they click on a task card, **Then** they are taken to the task's detail/edit page (same as in table view).
4. **Given** the user switches back to Table View, **Then** the new status is correctly reflected in the table row.
5. **Given** a column has no tasks, **When** the Kanban view is displayed, **Then** the empty column is still shown with a clear placeholder message.
6. **Given** the user applies a status filter (e.g., "In Progress") while in Board view, **When** the filter is active, **Then** all four columns remain visible but only cards matching the selected status are shown — other columns display their empty-state placeholder.
7. **Given** a task has a status value not in the canonical set, **When** the Board view is rendered, **Then** the card appears in the **Backlog** column as a fallback.

---

### User Story 2 - View Persistence (Priority: P2)

As a returning user, I want the application to remember whether I last used the Table or Kanban view on the Tasks page, so I don't have to re-select my preferred view every session.

**Why this priority**: A small but meaningful UX improvement. The view preference should follow the user across page navigations and browser sessions, reducing friction and making the app feel polished.

**Independent Test**: Can be tested by switching to Kanban view, navigating away, and returning to the Tasks page — verifying the Kanban view is still active.

**Acceptance Scenarios**:

1. **Given** a user selects Kanban view, **When** they navigate away from the Tasks page and return, **Then** the Kanban view is still active (not reverted to Table view).
2. **Given** a user has preferred Table view, **When** they reload the page or return after a new session, **Then** Table view is the default.

---

### User Story 3 - Visual Style Improvements to the Tasks Page (Priority: P3)

As a user visiting the My Tasks page, I want the overall style of the page to be more visually modern and polished, consistent with the Liquid Glass aesthetic used in the rest of the app.

**Why this priority**: This is a style-level improvement that improves the overall look and feel but does not change the core functionality. It layers on top of the Kanban and existing table features.

**Independent Test**: Can be tested by a visual review of the Tasks page confirming that headers, filters, stat cards, and action buttons all use the same glass-card, glass-button, and glass-panel design patterns as other pages.

**Acceptance Scenarios**:

1. **Given** the My Tasks page is loaded, **When** it renders, **Then** the page header, filter bar, stat summary cards (if present), and main content area all reflect the same frosted glass and frosted button aesthetics applied across the rest of the app.
2. **Given** the user is in table view, **When** they look at the task rows, **Then** hover effects, row separators, and badge styles feel visually consistent with other data pages.
3. **Given** the user is in Kanban view, **When** they view task cards, **Then** each card uses `.glass-card` styling with subtle shadow, rounded corners, and consistent typography.

---

### Edge Cases

- What happens when a task has a status that does not match any defined Kanban column? The task is placed in the **Backlog** column as a safe fallback (no data loss; still visible in Table view with its original status value).
- What happens if the user's session times out while dragging a task? The UI should revert the card position and display a reconnect/error notification — no data corruption.
- What happens on mobile, where drag-and-drop may not be available? The Kanban view should still render correctly for viewing, and a "change status" dropdown should be available on each card as a fallback interaction mechanism.
- What happens with a very high number of tasks in a single column (e.g., 50+ in "Open")? Each column should be independently scrollable, without affecting the entire page layout.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The My Tasks page MUST display a view toggle control (e.g., segmented button or icon buttons) that allows the user to switch between "Table" and "Board" (Kanban) views.
- **FR-001b**: Both Table and Board views MUST filter tasks to show only those assigned to the currently logged-in user (via `resource1_id` or `resource2_id` matching the authenticated user's ID).
- **FR-002**: In Board view, the system MUST organize the current user's tasks into columns corresponding to each distinct task status (Backlog, In Progress, Done, Cancelled).
- **FR-003**: In Board view, users MUST be able to drag and drop task cards between status columns to update a task's status.
- **FR-004**: Status updates performed via drag-and-drop in Board view MUST be persisted to the backend immediately.
- **FR-005**: Each task card in Board view MUST display, at minimum: task name, project name, assignee avatar/name, and status badge.
- **FR-006**: Clicking a task card in Board view MUST navigate the user to the task detail/edit page.
- **FR-007**: The user's view preference (Table vs. Board) MUST be persisted across navigations and browser sessions.
- **FR-008**: The Board view MUST remain functional on all screen sizes; on small screens without drag-and-drop, a status-change control (e.g., a dropdown on each card) MUST be provided.
- **FR-009**: The page header, filter controls, action buttons, and task cards MUST use the application's global visual design system (glass-panel, glass-card, glass-button patterns) consistently.
- **FR-010**: The existing Table view MUST not be removed; it remains as an alternative view option.
- **FR-011**: All existing task filtering (by status, assignee, project, search) MUST work in both view modes. In Board view, applying a status filter shows only matching cards within each column — all columns remain visible.
- **FR-012**: Empty Kanban columns MUST still display with a placeholder/empty-state message.

### Key Entities

- **Task**: The core data entity, identified by task ID, with fields including task name, status, project, assignee(s), start/end dates, and estimated hours. Status field drives column placement in Board view.
- **Task Status**: A categorical value that determines which Kanban column a task belongs to. Canonical values (in column order): **Backlog, In Progress, Done, Cancelled**.
- **View Preference**: A user-level preference (stored locally) that records which view mode was last selected on the Tasks page.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between Table and Board views within 1 second, with no full-page reload.
- **SC-002**: A task status update via drag-and-drop is reflected in both the Board view and the Table view within 2 seconds of releasing the drag.
- **SC-003**: The Board view renders correctly and is fully usable across Desktop (≥1024px), Tablet (≥768px), and Mobile (≥375px) screen widths.
- **SC-004**: No functional regression in the existing Table view — all existing actions (sort, filter, paginate, edit) continue to work identically.
- **SC-005**: 100% of task status transitions available in the Table view are also achievable through the Board view (by drag-and-drop or the fallback control).
- **SC-006**: The visual style of the Tasks page earns a consistent aesthetic rating — all key UI elements (cards, buttons, header, filters) use the application's global design tokens.
- **SC-007**: The user's last-selected view mode is correctly restored on their next visit in at least 95% of test cases.

---

## Assumptions

- Task statuses are predefined and finite: Backlog, In Progress, Done, Cancelled. Kanban columns are derived from these fixed values.
- The drag-and-drop interaction will use a browser-native or lightweight library approach compatible with the existing React 18 / Next.js 14 tech stack.
- "My Tasks" shows **only tasks assigned to the currently logged-in user** — filtered client-side by comparing `resource1_id` / `resource2_id` against the authenticated user's ID from `AuthProvider`.
- This user scoping applies to **both** Table and Board views on the Tasks page.
- View preference is stored in the browser's `localStorage` (no backend preference storage required).
- No new backend API endpoints are required — existing task update and fetch endpoints are used; user filtering is applied client-side.
