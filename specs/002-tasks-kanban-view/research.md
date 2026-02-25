# Research: Tasks Page Kanban View & UX Improvements

**Feature**: `002-tasks-kanban-view`
**Date**: 2026-02-25

---

## Phase 0: Research & Technical Decisions

### Decision 1: Drag-and-Drop Library

**Decision**: Use the **HTML5 native Drag and Drop API** wrapped in lightweight React event handlers (no external DnD library).

**Rationale**:
- Adding `@dnd-kit/core` or `react-beautiful-dnd` would add 10–50KB to the bundle.
- The Kanban board has a simple, single-axis drag (card → column) use case that does not require complex features like keyboard navigation or sensor abstraction.
- Native drag-and-drop is fully supported in Chromium and Firefox. A `touch-action: none` + `onTouchStart/onTouchEnd` fallback covers most mobile touch scenarios.
- If more complex DnD is needed in future, upgrading is straightforward.

**Alternatives Considered**:
- `@dnd-kit` — powerful but ~45KB; overkill for a simple column-to-column drag.
- `react-beautiful-dnd` — deprecated/unmaintained since 2023.

---

### Decision 2: Mobile Fallback for Status Change

**Decision**: On mobile (screen width < 768px), render a status `<select>` dropdown on each Kanban card instead of drag handles.

**Rationale**:
- Touch drag-and-drop on mobile requires complex pointer event handling.
- A status dropdown is WCAG accessible, faster, and expected by mobile users.
- The spec requires a "status-change control" on mobile as a fallback.
- Detection will use a CSS media query hook (`useWindowSize` or a `md:hidden` pattern).

**Alternatives Considered**:
- Long-press to drag on mobile — complex to implement reliably.
- Show Table view only on mobile — loses the Kanban benefit for tablet users.

---

### Decision 3: View Preference Persistence

**Decision**: Persist the selected view mode (`'table' | 'board'`) in `localStorage` under the key `qc_tasks_view`.

**Rationale**:
- No backend change required (aligned with spec assumption).
- `localStorage` survives browser sessions.
- Reading happens synchronously on mount to prevent flash-of-wrong-view.
- Isolated to the Tasks page; does not affect other pages.

**Alternatives Considered**:
- `sessionStorage` — does not survive browser close; rejected.
- User preferences table in DB — over-engineered for a single toggle.

---

### Decision 4: API Pattern for Status Update

**Decision**: Reuse the existing `PATCH /api/tasks/:id` endpoint with `{ status: newStatus }` payload.

**Rationale**:
- The API already supports partial updates via PATCH.
- No new backend routes are required.
- The `fetchApi` utility already handles this pattern project-wide.
- A failed PATCH triggers a visual rollback in the UI (optimistic update pattern).

**Alternatives Considered**:
- Dedicated `PUT /api/tasks/:id/status` route — unnecessary for an existing PATCH endpoint.

---

### Decision 5: Kanban Column Ordering

**Decision**: Kanban columns are rendered in a fixed order: **Backlog → In Progress → Done → Cancelled**.

**Rationale**:
- This mirrors the natural task lifecycle in QC workflows.
- The `STATUS_OPTIONS` array already defines this order in `page.tsx`.
- No column reordering is needed in v1.

**Alternatives Considered**:
- Dynamic ordering from API — over-engineered; status list is stable.

---

### Decision 6: Optimistic Updates

**Decision**: Implement optimistic UI updates on drag-and-drop. The task card moves immediately to the new column; if the API call fails, the card reverts.

**Rationale**:
- Instant visual feedback aligns with SC-001 (< 2s) requirement.
- Standard pattern for Kanban tools (Jira, Linear, etc.).
- Simple to implement with a `setTasks` rollback on error.

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | New `TaskKanbanBoard` component is isolated, typed, and composable |
| II. Testing Standards | ✅ PASS | Playwright E2E tests cover view switching and drag interaction |
| III. UX Consistency | ✅ PASS | Glass-card styling applied to Kanban cards; glass-panel to column headers |
| IV. Performance | ✅ PASS | No new bundles added; native DnD API; optimistic updates prevent perceived latency |
| Security | ✅ PASS | Status updates go through existing permission-checked API |
| Accessibility | ✅ PASS | Fallback dropdown for touch/keyboard-only users |
