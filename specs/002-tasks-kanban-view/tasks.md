# Tasks: Tasks Page Kanban View & UX Improvements

**Input**: Design documents from `specs/002-tasks-kanban-view/`
**Branch**: `002-tasks-kanban-view`
**Prerequisites**: plan.md ✅ spec.md ✅ (post-clarification) research.md ✅ data-model.md ✅ contracts/ui-components.md ✅ quickstart.md ✅

> ⚠️ **Regenerated after /speckit.clarify** — incorporates 4 clarifications:
> 1. Board and Table views show only tasks assigned to the current user (FR-001b)
> 2. Canonical statuses: Backlog / In Progress / Done / Cancelled
> 3. Status filter in Board view filters cards within all columns (columns stay visible)
> 4. Tasks with unrecognised status appear in the Backlog column as a fallback

**Tests**: Not explicitly requested — no test tasks generated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Understand the existing codebase before any new components are added.

- [x] T001 Read and understand `apps/web/app/tasks/page.tsx` — focus on filter states, `filteredTasks` memoization, API fetch, and `useAuth` usage
- [x] T002 Read and understand `apps/web/src/components/tasks/TaskTable.tsx` — focus on props interface and how `tasks` is consumed
- [x] T003 [P] Read `apps/web/src/types/index.ts` — confirm `Task` interface fields (`resource1_id`, `resource2_id`, `status` enum) used for user-scoping and column mapping
- [x] T004 [P] Read `apps/web/src/components/providers/AuthProvider.tsx` — identify how to access the currently logged-in user's ID for the task filter

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the user-scoping filter and the ViewToggle into `page.tsx`. This is the shared entry point for all user story phases.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Modify `apps/web/app/tasks/page.tsx` — import `useAuth` and extract the current user's ID (e.g., `user?.id` or equivalent from AuthProvider). Add a `myTasks` derived value using `useMemo` that further filters `filteredTasks` to only include tasks where `task.resource1_id === currentUserId || task.resource2_id === currentUserId`. Replace all downstream references to `filteredTasks` with `myTasks`.
- [x] T006 Create `apps/web/src/components/tasks/ViewToggle.tsx` — a segmented pill control with a table-icon button and a board-icon button. Props: `view: 'table' | 'board'`, `onChange: (v: 'table' | 'board') => void`. Active button uses `glass-button` styling (filled indigo); inactive uses `glass-button-secondary`. Both buttons have `aria-pressed` and `aria-label` attributes.
- [x] T007 Modify `apps/web/app/tasks/page.tsx` — add `viewMode` state initialized from `localStorage.getItem('qc_tasks_view') ?? 'table'`. Wrap the localStorage read in a `useEffect` to avoid SSR hydration mismatch: initialize state as `'table'`, then set actual value from localStorage on mount. Persist changes: `localStorage.setItem('qc_tasks_view', newView)` in the `onChange` handler.
- [x] T008 Modify `apps/web/app/tasks/page.tsx` — add `<ViewToggle view={viewMode} onChange={setViewMode} />` to the header action bar (same row as `+ New Task` button). Conditionally render `<TaskTable tasks={myTasks} isLoading={isLoading} />` when `viewMode === 'table'` and a `<div>Board view coming soon</div>` placeholder when `viewMode === 'board'` (replaced in Phase 3).

**Checkpoint**: View toggle visible on page. Table still works. User only sees their own tasks.

---

## Phase 3: User Story 1 — Kanban Board View (Priority: P1) 🎯 MVP

**Goal**: Render the current user's tasks as draggable cards in 4 status columns. Drag-and-drop updates status via the existing API with optimistic UI.

**Independent Test**: Navigate to `/tasks`, click "Board". Four columns appear (Backlog, In Progress, Done, Cancelled) containing only the logged-in user's tasks. Drag a card to a new column — switch to Table view and verify the status badge changed.

### Implementation for User Story 1

- [x] T009 [P] [US1] Create `apps/web/src/components/tasks/TaskKanbanCard.tsx` — renders one task card with `.glass-card p-4 rounded-xl cursor-grab` styling. Display: `task.task_name` as a `<Link href="/tasks/[id]">`, `task.project_name` as a muted subtitle, assignee avatar (indigo circle with first initial) + `task.resource1_name`, deadline chip (red text if `task.deadline` is past today), priority badge (`High`=red, `Medium`=amber, `Low`=slate). Add `draggable` prop and `onDragStart={(e) => e.dataTransfer.setData('taskId', task.id)}`. Props: `task: Task`. Also render a mobile-only `<select className="md:hidden w-full mt-2 ...">` with all 4 status options that calls `onStatusChange(task.id, newValue)` when changed. Props also include `onStatusChange: (taskId: string, newStatus: Task['status']) => void`.
- [x] T010 [P] [US1] Create `apps/web/src/components/tasks/TaskKanbanBoard.tsx` — shell component. Props: `tasks: Task[]`, `isLoading: boolean`, `onStatusChange: (taskId: string, newStatus: Task['status']) => Promise<void>`. Define `const KANBAN_STATUSES: Task['status'][] = ['Backlog', 'In Progress', 'Done', 'Cancelled']`. Group tasks by status with `useMemo`: `const grouped = KANBAN_STATUSES.reduce(...)`. For tasks with status not in `KANBAN_STATUSES`, fall back to placing them in the `'Backlog'` bucket. Render columns horizontally using `flex gap-4 overflow-x-auto pb-4`.
- [x] T011 [US1] Implement Kanban columns in `apps/web/src/components/tasks/TaskKanbanBoard.tsx` — for each status in `KANBAN_STATUSES`, render a column `<div>` with: a glass-panel header (`glass-card mb-3 px-4 py-2 flex items-center justify-between`) showing the status label and a count badge (`bg-indigo-100/60 dark:bg-indigo-900/40 text-xs rounded-full px-2 py-0.5`); a `min-h-[200px] space-y-3 overflow-y-auto max-h-[calc(100vh-280px)]` card list; `onDragOver={(e) => e.preventDefault()}` on the column; `onDrop={(e) => { e.preventDefault(); const taskId = e.dataTransfer.getData('taskId'); onStatusChange(taskId, columnStatus); }}`. Render `<TaskKanbanCard>` for each task in the group, passing `onStatusChange`.
- [x] T012 [US1] Add empty-state to each Kanban column in `apps/web/src/components/tasks/TaskKanbanBoard.tsx` — if a column has 0 tasks, render a dashed-border placeholder: `<div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center text-slate-400 dark:text-slate-600 text-sm">No tasks</div>`.
- [x] T013 [US1] Implement `handleStatusChange` in `apps/web/app/tasks/page.tsx` — `async function handleStatusChange(taskId: string, newStatus: Task['status'])`: (1) save current tasks to `prevTasks`; (2) optimistically update `tasks` state: `setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))`; (3) `await fetchApi(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })`; (4) on error: `setTasks(prevTasks)` rollback + `console.error`.
- [x] T014 [US1] Replace the Board placeholder in `apps/web/app/tasks/page.tsx` — swap `<div>Board view coming soon</div>` with `<TaskKanbanBoard tasks={myTasks} isLoading={isLoading} onStatusChange={handleStatusChange} />`.

**Checkpoint**: Board view is fully functional with user-scoped tasks, drag-and-drop, optimistic updates, fallback mobile dropdowns, and unknown-status Backlog grouping.

---

## Phase 4: User Story 2 — View Persistence (Priority: P2)

**Goal**: The selected view (Table or Board) is remembered across navigation and browser sessions.

**Independent Test**: Select Board view → navigate to `/projects` → return to `/tasks` → Board is still active. Hard-refresh `/tasks` → Board is still active.

### Implementation for User Story 2

- [x] T015 [US2] Validate hydration safety of localStorage view persistence in `apps/web/app/tasks/page.tsx` — confirm the `useEffect` pattern from T007 is in place: `const [viewMode, setViewMode] = useState<'table' | 'board'>('table')` with `useEffect(() => { setViewMode((localStorage.getItem('qc_tasks_view') as 'table' | 'board') ?? 'table'); }, [])`. If not, apply this pattern now to prevent server/client hydration mismatch. Test by toggling to Board, hard-refreshing, and confirming no hydration warning in the browser console.

**Checkpoint**: View preference survives navigation, page reload, and new browser sessions. No React hydration warnings.

---

## Phase 5: User Story 3 — Visual Style Improvements (Priority: P3)

**Goal**: The Tasks page header, filter bar, table container, and empty state all use the Liquid Glass design system consistently with the rest of the app.

**Independent Test**: Visual review — filter bar, table container, empty state, and buttons match the glass aesthetic of Sidebar and TopBar.

### Implementation for User Story 3

- [x] T016 [P] [US3] Modify `apps/web/app/tasks/page.tsx` — apply glass styling to the filter bar container: replace `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm` with `glass-card p-4`.
- [x] T017 [P] [US3] Modify `apps/web/app/tasks/page.tsx` — update the `+ New Task` `<Button>` to remove the inline `className` gradient override (`bg-gradient-to-r from-indigo-600 to-violet-600...`) and use the standard `variant="default"` only, which resolves to `.glass-button` via the global Liquid Glass refactor.
- [x] T018 [P] [US3] Modify `apps/web/src/components/tasks/TaskTable.tsx` — update the empty-state container: replace `bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm` with `glass-card`. Update the inner icon circle wrapper to `bg-slate-50/60 dark:bg-slate-800/60 backdrop-blur-sm`.
- [x] T019 [US3] Modify `apps/web/src/components/tasks/TaskTable.tsx` — update the main table wrapper: replace `overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors duration-300` with `glass-card overflow-hidden transition-colors duration-300` (`.glass-card` already provides border, rounded corners, and background).
- [x] T020 [US3] Modify `apps/web/app/tasks/page.tsx` — update active filter tag chips: replace `bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md` with `bg-indigo-500/10 dark:bg-indigo-500/15 backdrop-blur-sm text-indigo-700 dark:text-indigo-300 border border-indigo-200/40 dark:border-indigo-500/20 text-xs rounded-md` for glass-consistent chip styling.

**Checkpoint**: Tasks page is visually cohesive with the rest of the app's Liquid Glass design system.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, mobile UX, and final verification.

- [x] T021 [P] Add `role="region"` and `aria-label="[Status] tasks column"` to each Kanban column `<div>` in `apps/web/src/components/tasks/TaskKanbanBoard.tsx` for screen reader support.
- [x] T022 [P] Add loading skeleton to `apps/web/src/components/tasks/TaskKanbanBoard.tsx` — when `isLoading` is true, render 4 column skeletons (3 skeleton cards each, using `animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl h-24`).
- [x] T023 Confirm the mobile status `<select>` in `apps/web/src/components/tasks/TaskKanbanCard.tsx` (from T009) includes all 4 canonical values and correctly calls `onStatusChange` when changed. Verify it is hidden on `md:` and above with `className="md:hidden"`.
- [x] T024 Run visual verification against `specs/002-tasks-kanban-view/quickstart.md` — confirm all checklist items pass (view toggle, 4 columns, drag-and-drop, mobile dropdown, empty state, glass styling, filter behaviour in board view).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 — T005 needs auth user ID from T004; T008 needs T006+T007. **Blocks all user story phases.**
- **Phase 3 (US1)**: Depends on Phase 2 (uses `myTasks`, `handleStatusChange`, `viewMode` from Foundational tasks).
- **Phase 4 (US2)**: Depends on T007 from Phase 2. Can validate in parallel with Phase 3 if T007 is complete.
- **Phase 5 (US3)**: Depends on T008. Can start alongside Phase 3/4 (touches different files).
- **Phase 6 (Polish)**: Depends on Phase 3 (T021/T023 need `TaskKanbanBoard` + `TaskKanbanCard`) and Phase 5 (T024 needs all styling done).

### User Story Dependencies

- **US1 (P1)**: Foundational complete. Core deliverable.
- **US2 (P2)**: Depends on T007 only. Validates localStorage hydration behaviour.
- **US3 (P3)**: Depends on T008 wiring. Different files from US1 — can be parallelised.

### Parallel Opportunities

- **Phase 1**: T003 + T004 in parallel (different files).
- **Phase 3**: T009 (`TaskKanbanCard.tsx`) + T010 (`TaskKanbanBoard.tsx`) in parallel — both are new files.
- **Phase 5**: T016 + T017 + T018 in parallel — different files or different sections.

---

## Parallel Example: User Story 1

```text
After Phase 2 is complete:

In parallel:
  T009 — Create TaskKanbanCard.tsx (new file, isolated)
  T010 — Create TaskKanbanBoard.tsx shell (new file, isolated)

Then sequentially:
  T011 — Add column drag/drop logic to TaskKanbanBoard.tsx (uses TaskKanbanCard)
  T012 — Add empty-state to columns
  T013 — Add handleStatusChange to page.tsx
  T014 — Wire TaskKanbanBoard into page.tsx (consumes T013)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. **Phase 1** (T001–T004) — read existing code
2. **Phase 2** (T005–T008) — user scoping + ViewToggle wired
3. **Phase 3** (T009–T014) — full Kanban board with drag-and-drop
4. **STOP + VALIDATE**: Board shows current user's tasks only, drag works, Table view unchanged
5. Proceed to Phase 4, 5, 6 as incremental improvements

### Incremental Delivery

1. Phase 1 + 2 → View toggle visible, user-scoped table → **Foundation** ✅
2. + Phase 3 (US1) → Kanban board functional → **MVP deliverable** ✅
3. + Phase 4 (US2) → View preference persists → **Polished UX** ✅
4. + Phase 5 (US3) → Liquid Glass style elevated → **Full feature** ✅
5. + Phase 6 → Accessibility + mobile fallback + QA → **Production ready** ✅

---

## Notes

- `[P]` tasks = different files, no cross-dependency — safe to run in parallel.
- Each User Story phase is independently completable and testable.
- The user-scoping filter (`myTasks`) is applied in `page.tsx` client-side — no backend changes required.
- Tasks with unrecognised status values fall into Backlog in Board view; their original status is preserved in the DB and visible in Table view.
- No new npm packages — native HTML5 DnD API as decided in `research.md`.
- Commit after each phase checkpoint.
