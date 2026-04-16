# My Tasks — Task Detail Modal

**Date:** 2026-04-16  
**Status:** Approved

---

## Overview

Replace the inline top-of-page task form with a centered modal that opens when any task card is clicked. The modal combines viewing and editing in one place, works for both List and Kanban views, and is lean (no comments section).

Task descriptions are shown inline on the card with an expand/collapse toggle — no truncation with `…` for short-to-medium text, and a "Show more / Show less" link for long text so the card stays scannable.

---

## What Changes

### Removed
- Inline `glass-card` form at the top of `my-tasks/page.tsx`
- Pencil ✏ edit button on `TaskCard` and `MyTaskKanbanCard`
- `showForm`, `editingId`, `formData` state variables in the page component
- `line-clamp-2` on description in both card views

### Added
- `TaskDetailModal` component (`apps/web/src/components/tasks/TaskDetailModal.tsx`)
- `selectedTask` state (`PersonalTask | null`) — `null` = closed, task object = open
- Cursor-pointer + indigo ring hover state on cards
- `+ New Task` button opens the modal in empty/create mode
- Per-card `expanded` toggle state for long descriptions

---

## Description Display on Cards

### Rule
- If description fits within **3 lines** at the rendered width → show it fully, no toggle
- If description overflows 3 lines → clamp to 3 lines + show **"Show more"** link
- Clicking "Show more" → uncamps to full text + shows **"Show less"** link
- This state is **per-card**, stored in a `Set<string>` of expanded task IDs (or local `useState` inside each card component)

### Implementation (per card)
```tsx
const [expanded, setExpanded] = useState(false);

// In JSX:
<p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${expanded ? '' : 'line-clamp-3'}`}>
  {task.description}
</p>
{/* Show toggle only when text overflows — use ref + ResizeObserver or CSS trick */}
{needsExpand && (
  <button
    onClick={e => { e.stopPropagation(); setExpanded(p => !p); }}
    className="text-[10px] text-indigo-500 hover:text-indigo-700 mt-0.5 font-medium"
  >
    {expanded ? 'Show less' : 'Show more'}
  </button>
)}
```

### Detecting overflow (CSS-only trick — no ResizeObserver needed)
Render the toggle button only when `line-clamp-3` is active. Use the `[@supports]` approach: always render the button, but hide it with `hidden` when text is short. The cleanest approach for React:
- Render description twice: once clamped (hidden, to measure), once visible
- **Simpler alternative**: always show the "Show more" button when `description` character count > threshold (~120 chars), hide it for short descriptions. This avoids DOM measurement entirely.

Use the **120-char threshold** approach — it's predictable, testable, and avoids layout measurement complexity.

```tsx
const isLong = (task.description?.length ?? 0) > 120;
```

---

## Component: `TaskDetailModal`

**File:** `apps/web/src/components/tasks/TaskDetailModal.tsx`

### Types
```ts
interface TaskFormPayload {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
}
```

### Props
```ts
interface TaskDetailModalProps {
  task: PersonalTask | null;       // null = create mode
  onClose: () => void;
  onSave: (data: TaskFormPayload, id?: string) => Promise<void>;
  onDelete: (id: string) => void;
}
```

### Layout (single column, max-w-lg)
```
┌─────────────────────────────────────┐
│  [label: TASK]                  [✕] │
│  ┌─────────────────────────────┐    │
│  │  Title input (editable)     │    │
│  └─────────────────────────────┘    │
│                                      │
│  [label: DESCRIPTION]                │
│  ┌─────────────────────────────┐    │
│  │  Textarea (min 3 rows,      │    │
│  │  full text, no truncation)  │    │
│  └─────────────────────────────┘    │
│                                      │
│  [STATUS ▾]  [PRIORITY ▾]  [DUE]   │
│                                      │
│  Created Apr 14  ·  Updated Apr 16   │  ← hidden in create mode
│ ─────────────────────────────────── │
│  [Delete]           [Cancel] [Save] │
└─────────────────────────────────────┘
```

### Styling
- Backdrop: `fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm` (matches existing delete confirmation modal)
- Dialog: `bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg`
- Title input: standard `glass-card` input style with `focus:ring-2 focus:ring-indigo-500/50`
- Description: `resize-none` textarea, `min-rows=3`, full text always visible (no clamp)
- Metadata row: 3-column grid — Status select, Priority select, Due date input — matching existing form field styles
- Footer: `flex justify-between` — Delete (rose) on left, Cancel + Save (indigo) on right
- Delete button hidden in create mode

### Behaviour
| Trigger | Result |
|---------|--------|
| Click card body | Open modal with task data pre-filled |
| Click `+ New Task` | Open modal empty (create mode) |
| Click ✓ circle | Toggle done/pending — no modal |
| Click `Show more` / `Show less` | Expand/collapse description on card — no modal |
| Click backdrop | Close modal, discard unsaved changes |
| Press `ESC` | Close modal, discard unsaved changes |
| Click `✕` | Close modal, discard unsaved changes |
| Click `Cancel` | Close modal, discard unsaved changes |
| Click `Save changes` | PATCH/POST, close on success, refetch |
| Click `Delete` | Close modal, trigger existing delete confirmation dialog |
| `Save` while title empty | Button disabled |
| `Save` while saving | Button shows `Saving…`, disabled |

### Animation
- Entry: `scale-95 opacity-0` → `scale-100 opacity-100` over 150ms ease-out
- Exit: reverse over 100ms (use CSS transition, no external animation library)

---

## Card Changes

### `TaskCard` (list view) — `page.tsx`
- Remove pencil button
- Remove status `<select>` dropdown from card body (status is now changed in modal)
- Remove `line-clamp-2` on description → replace with `line-clamp-3` when collapsed, no clamp when expanded
- Add `isLong` check (>120 chars) to conditionally render Show more/less toggle
- Make entire card clickable via `onClick={() => onOpen(task)}` on the outer `div`
- Add `cursor-pointer` to the card container class
- Hover state: `hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md`
- ✓ circle button: add `e.stopPropagation()` to prevent modal from opening on toggle
- Show more/less button: add `e.stopPropagation()` to prevent modal from opening

### `MyTaskKanbanCard` (board view) — `TaskKanbanCard.tsx`
- Remove pencil button
- Remove `line-clamp-2` on description → same expand/collapse logic as list card
- Add `onClick` to card container with `e.stopPropagation()` guard on drag events
- Same hover ring as list card
- Mobile status dropdown: add `e.stopPropagation()`
- Show more/less button: add `e.stopPropagation()`

---

## State in `MyTasksPage`

```ts
const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
const [modalOpen, setModalOpen] = useState(false);

const openModal = (task: PersonalTask | null) => {
  setSelectedTask(task);   // null = create mode
  setModalOpen(true);
};

const closeModal = () => {
  setModalOpen(false);
  setSelectedTask(null);
};
```

`handleSubmit` is moved into the modal's `onSave` prop — same logic, just relocated.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Empty description | Textarea shows placeholder, saves as `null`; no Show more button |
| Description ≤ 120 chars | Shown in full on card, no Show more button |
| Description > 120 chars | Clamped to 3 lines with Show more toggle |
| Very long description | Textarea in modal scrolls internally (`max-h-48 overflow-y-auto`) |
| HTML in description | Rendered as plain text (no `dangerouslySetInnerHTML`) |
| Rapid open/close | No debounce needed — modal renders synchronously |
| Multiple clicks | `onClick` on card is idempotent; second click on already-open task is a no-op |
| Mobile | Max-width `max-w-lg` with `p-4` padding collapses gracefully on small screens |

---

## Files Affected

| File | Change |
|------|--------|
| `apps/web/app/my-tasks/page.tsx` | Remove inline form; add `selectedTask` state; wire `openModal`/`closeModal`; pass `onOpen` to cards |
| `apps/web/src/components/tasks/TaskDetailModal.tsx` | **New file** — full edit modal |
| `apps/web/src/components/tasks/TaskKanbanCard.tsx` | Remove edit button; add click handler, hover state, expand/collapse description |

No API changes. No new endpoints. All data already fetched by `fetchTasks()`.

---

## Non-Goals

- Comments section (explicitly excluded)
- Deep-linking / URL state for open modal
- Analytics tracking
- Linked entities (My Tasks are personal — no project/bug/test case links)
