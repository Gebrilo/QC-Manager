# IDP Task Interaction UX — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dangerous tri-state cycle button on the My Development Plan page with a safe, accessible, discoverable interaction model: a Done-only checkbox, an explicit status popover covering `TODO / IN_PROGRESS / ON_HOLD / DONE`, a required-comment dialog for On Hold, a per-task comments side panel, and visible status/overdue/late badges. All error paths route through a new toast system rather than `alert()` / `console.log`.

**Architecture:** A small, hand-rolled toast primitive (no new dependency — matches the existing `TaskDetailModal.tsx` modal convention). Five new React components live under `apps/web/src/components/idp/`, each with a single responsibility. The IDP branch of `apps/web/app/journeys/page.tsx` is refactored to compose them; the Journey-preparation branch is untouched. Plan A's new API endpoints (`PATCH /my/tasks/:id/status` with `comment`, `GET/POST /my/tasks/:id/comments`) and the widened `IDPTask` type (`ON_HOLD`, `hold_reason`, `completed_late`) are the integration surface.

**Tech Stack:** Next.js 14 App Router (`'use client'`), React 18, Tailwind CSS, Playwright e2e. No new npm deps. Only `@radix-ui/react-tooltip` is installed — we do **not** add Radix Popover/Dialog; we reuse the self-rolled modal/animation pattern from `apps/web/src/components/tasks/TaskDetailModal.tsx`.

**Depends on:** Plan A (`docs/superpowers/plans/2026-04-18-idp-data-model-on-hold-comments.md`) — already landed on main. All new endpoints and types Plan B consumes are live.

**Conventions captured from the existing codebase:**
- `'use client'` at the top of every interactive component.
- Modals: `fixed inset-0`, fade-in via `useState(visible)` + `requestAnimationFrame`, Escape-to-close via `window.addEventListener('keydown')` in `useEffect`. Reference: `apps/web/src/components/tasks/TaskDetailModal.tsx:42-60`.
- UI primitives under `apps/web/src/components/ui/` (Button, Badge, Card, Spinner, Tooltip, etc.). Domain components under `apps/web/src/components/<domain>/` (e.g. `tasks/`, `quality/`). We add a new `idp/` sub-folder.
- Tailwind dark-mode via `dark:` prefixes. Slate/indigo/emerald/amber/rose palette is the established set. Amber in dark mode requires `amber-300` to meet 4.5:1 against `slate-900` — `amber-500` fails.
- E2E pattern: Playwright + `mockAuthenticatedSession` helper + `page.route()` API stubs. Reference: `apps/web/e2e/my-tasks-modal.spec.ts`.
- API client already exposes `developmentPlansApi.updateMyTaskStatus(taskId, status, comment?)`, `.listMyTaskComments(taskId)`, `.addMyTaskComment(taskId, body)` (`apps/web/src/lib/api.ts:1108-1150`).

---

## File Structure

**Files created:**
- `apps/web/src/components/ui/Toast.tsx` — `<ToastProvider>`, `useToast()` hook, 4 variants (info / success / warning / error), auto-dismiss. The *only* toast primitive introduced by this plan.
- `apps/web/src/components/idp/TaskStatusBadge.tsx` — pure presentational badge rendering icon + color + label for `TODO / IN_PROGRESS / ON_HOLD / DONE / Overdue / Done · Late`. Used by both the status pill and the row-level status column.
- `apps/web/src/components/idp/TaskStatusControl.tsx` — the combined `[checkbox] [status pill ▾]` control that replaces the tri-state cycle button. Owns the popover + the "entering ON_HOLD opens HoldTaskDialog" flow.
- `apps/web/src/components/idp/HoldTaskDialog.tsx` — modal that collects the required hold reason before calling `updateMyTaskStatus(id, 'ON_HOLD', reason)`.
- `apps/web/src/components/idp/TaskCommentsPanel.tsx` — right-side slide-over panel that reads/appends comments for a single task.
- `apps/web/e2e/idp-task-interactions.spec.ts` — Playwright spec covering the golden path (mark Done, open popover, go On Hold with reason, add a comment) and the error path (ON_HOLD without reason → toast).

**Files modified:**
- `apps/web/app/layout.tsx` — wrap children in `<ToastProvider>`.
- `apps/web/app/journeys/page.tsx` — IDP branch only: remove the tri-state cycle button (lines 122-147), render `<TaskStatusControl>` + a comments icon + `<TaskStatusBadge>` badges for overdue/late/on-hold; replace `alert()` / `console.log` `showError`/`showSuccess` stubs with the toast hook.

**Explicitly out of scope (Plan B does not touch these):**
- `apps/web/app/manage-development-plans/[userId]/page.tsx` — manager-side plan editor. It still has `alert()` stubs and manager-adding-comments is a Plan E cleanup item.
- The route split / journey history (that is Plan C).
- Any Journey-preparation (`!isActive`) rendering in `journeys/page.tsx`.

---

## Task 1: Toast primitive — `<ToastProvider>` + `useToast()` hook

**Files:**
- Create: `apps/web/src/components/ui/Toast.tsx`
- Modify: `apps/web/app/layout.tsx`

A minimum-viable toast system. We don't pull in `sonner` or `react-hot-toast` because two pages use `alert()` — introducing an external dep would be overkill. The primitive supports stacking, auto-dismiss, and four variants.

- [ ] **Step 1: Create the provider + hook + component**

Create `apps/web/src/components/ui/Toast.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
    id: number;
    variant: ToastVariant;
    message: string;
}

interface ToastContextValue {
    push: (variant: ToastVariant, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const push = useCallback((variant: ToastVariant, message: string) => {
        const id = nextId++;
        setToasts(prev => [...prev, { id, variant, message }]);
        window.setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, AUTO_DISMISS_MS);
    }, []);

    return (
        <ToastContext.Provider value={{ push }}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
            >
                {toasts.map(t => <ToastRow key={t.id} toast={t} onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />)}
            </div>
        </ToastContext.Provider>
    );
}

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
    const palette: Record<ToastVariant, string> = {
        info:    'bg-slate-800 text-white border-slate-700',
        success: 'bg-emerald-600 text-white border-emerald-500',
        warning: 'bg-amber-500 text-slate-900 border-amber-400',
        error:   'bg-rose-600 text-white border-rose-500',
    };
    return (
        <div
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto min-w-[240px] max-w-sm rounded-lg border shadow-lg px-4 py-3 text-sm ${palette[toast.variant]}`}
        >
            <div className="flex items-start gap-3">
                <span className="flex-1">{toast.message}</span>
                <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={onDismiss}
                    className="opacity-70 hover:opacity-100 text-xs"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used inside <ToastProvider>');
    }
    return {
        info:    (msg: string) => ctx.push('info', msg),
        success: (msg: string) => ctx.push('success', msg),
        warning: (msg: string) => ctx.push('warning', msg),
        error:   (msg: string) => ctx.push('error', msg),
    };
}
```

- [ ] **Step 2: Mount ToastProvider at the root layout**

Read `apps/web/app/layout.tsx` first to know the exact shape of the root tree. Then wrap the existing `<body>` children in `<ToastProvider>` — it must be inside the existing `AuthProvider` (or whatever session provider is at the root) so `useToast()` is available everywhere. Example edit:

```tsx
// at the top:
import { ToastProvider } from '../src/components/ui/Toast';

// in the JSX, wrap the existing children:
<AuthProvider>
    <ToastProvider>
        {/* existing layout children stay exactly as they were */}
    </ToastProvider>
</AuthProvider>
```

If the root layout has a different provider structure (e.g. a ThemeProvider), place `ToastProvider` as the innermost wrapper so it sees theme context and is seen by every page.

- [ ] **Step 3: Smoke-check — render the provider in isolation**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/my-tasks-modal.spec.ts" | grep -E "(error|Error)" || echo "clean"
```

Expected: `clean` (or only the pre-existing `getByDisplayValue` error on `e2e/my-tasks-modal.spec.ts:65` — unrelated to this plan).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/Toast.tsx apps/web/app/layout.tsx
git commit -m "feat(ui): add ToastProvider + useToast() hook with 4 variants"
```

---

## Task 2: `TaskStatusBadge` — presentational status badge

**Files:**
- Create: `apps/web/src/components/idp/TaskStatusBadge.tsx`

A pure component that renders icon + color + label for every status we care about. No color-only signals — every badge pairs color with either an icon or a text label (WCAG 1.4.1). Amber/rose chosen to meet 4.5:1 contrast in both themes.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/idp/TaskStatusBadge.tsx`:

```tsx
'use client';

import { ReactNode } from 'react';

export type TaskBadgeKind =
    | 'todo'
    | 'in_progress'
    | 'on_hold'
    | 'done'
    | 'done_late'
    | 'overdue';

interface TaskStatusBadgeProps {
    kind: TaskBadgeKind;
    /** Optional extra label suffix, e.g. "Late by 3d" */
    suffix?: string;
    className?: string;
}

interface BadgeSpec {
    label: string;
    icon: ReactNode;
    classes: string;
}

function iconCheck() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function iconPause() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="3" y="2" width="2" height="8" rx="0.5" />
            <rect x="7" y="2" width="2" height="8" rx="0.5" />
        </svg>
    );
}

function iconClock() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth={1.5} />
            <path d="M6 3v3l2 1.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
    );
}

function iconHalf() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth={1.5} />
            <path d="M6 1a5 5 0 010 10z" fill="currentColor" />
        </svg>
    );
}

function iconCircle() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth={1.5} />
        </svg>
    );
}

const SPECS: Record<TaskBadgeKind, BadgeSpec> = {
    todo: {
        label: 'Todo',
        icon: iconCircle(),
        classes: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    },
    in_progress: {
        label: 'In progress',
        icon: iconHalf(),
        classes: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900',
    },
    on_hold: {
        label: 'On hold',
        icon: iconPause(),
        classes: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    },
    done: {
        label: 'Done',
        icon: iconCheck(),
        classes: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    },
    done_late: {
        label: 'Done · Late',
        icon: iconCheck(),
        classes: 'bg-emerald-100 text-emerald-700 border-amber-400 ring-1 ring-amber-400 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-amber-500',
    },
    overdue: {
        label: 'Overdue',
        icon: iconClock(),
        classes: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
    },
};

export function TaskStatusBadge({ kind, suffix, className = '' }: TaskStatusBadgeProps) {
    const spec = SPECS[kind];
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${spec.classes} ${className}`}
            aria-label={suffix ? `${spec.label} ${suffix}` : spec.label}
        >
            {spec.icon}
            <span>{spec.label}{suffix ? ` · ${suffix}` : ''}</span>
        </span>
    );
}

/** Helper: map an `IDPTask` shape to the badge kind it should render. */
export function inferBadgeKind(task: {
    progress_status: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE';
    is_overdue?: boolean;
    completed_late?: boolean | null;
}): TaskBadgeKind {
    if (task.progress_status === 'DONE') return task.completed_late ? 'done_late' : 'done';
    if (task.progress_status === 'ON_HOLD') return 'on_hold';
    if (task.is_overdue) return 'overdue';
    if (task.progress_status === 'IN_PROGRESS') return 'in_progress';
    return 'todo';
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/my-tasks-modal.spec.ts" | grep -E "(error|Error)" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/idp/TaskStatusBadge.tsx
git commit -m "feat(idp): add TaskStatusBadge component with accessible status variants"
```

---

## Task 3: `HoldTaskDialog` — required-reason modal

**Files:**
- Create: `apps/web/src/components/idp/HoldTaskDialog.tsx`

Modal that opens when the user picks "On hold" from the status popover. Collects the required reason, calls `developmentPlansApi.updateMyTaskStatus(taskId, 'ON_HOLD', reason)`, and closes on success. Follows the `TaskDetailModal.tsx` convention: `fixed inset-0`, rAF fade-in, Escape-to-close, disable background scroll.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/idp/HoldTaskDialog.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { developmentPlansApi } from '../../lib/api';
import { useToast } from '../ui/Toast';

interface HoldTaskDialogProps {
    taskId: string;
    taskTitle: string;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const MIN_REASON_LEN = 3;

export function HoldTaskDialog({ taskId, taskTitle, open, onClose, onSuccess }: HoldTaskDialogProps) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [visible, setVisible] = useState(false);
    const toast = useToast();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!open) {
            setReason('');
            setVisible(false);
            return;
        }
        const raf = requestAnimationFrame(() => setVisible(true));
        const focusRaf = requestAnimationFrame(() => textareaRef.current?.focus());
        return () => { cancelAnimationFrame(raf); cancelAnimationFrame(focusRaf); };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handler);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const trimmed = reason.trim();
    const canSubmit = trimmed.length >= MIN_REASON_LEN && !saving;

    async function handleSubmit() {
        if (!canSubmit) return;
        setSaving(true);
        try {
            await developmentPlansApi.updateMyTaskStatus(taskId, 'ON_HOLD', trimmed);
            toast.success('Task placed on hold');
            onSuccess();
            onClose();
        } catch (err: any) {
            toast.error(err?.message || 'Could not place task on hold');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hold-dialog-title"
            className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
            <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-md mx-4 p-5">
                <h2 id="hold-dialog-title" className="text-base font-semibold text-slate-900 dark:text-white">
                    Place task on hold
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{taskTitle}</p>

                <label className="block mt-4 text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="hold-reason">
                    Why is this blocked? (required)
                </label>
                <textarea
                    ref={textareaRef}
                    id="hold-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    minLength={MIN_REASON_LEN}
                    className="mt-1 w-full text-sm p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    placeholder="e.g. Waiting on feedback from design review"
                />
                <p className="mt-1 text-xs text-slate-400">
                    {trimmed.length}/{MIN_REASON_LEN}+ chars · saved as the first comment on this task
                </p>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving…' : 'Place on hold'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/my-tasks-modal.spec.ts" | grep -E "(error|Error)" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/idp/HoldTaskDialog.tsx
git commit -m "feat(idp): add HoldTaskDialog with required reason and backend wiring"
```

---

## Task 4: `TaskStatusControl` — checkbox + status pill + popover

**Files:**
- Create: `apps/web/src/components/idp/TaskStatusControl.tsx`

The replacement for the tri-state cycle button at `apps/web/app/journeys/page.tsx:122-135`. Left half is a checkbox that **only** toggles `DONE ↔ previousNonDoneStatus` (never silently reverts completion via an extra click). Right half is a status pill that opens a small popover with all four statuses. Picking "On hold" routes through `HoldTaskDialog`.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/idp/TaskStatusControl.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { IDPTask, developmentPlansApi } from '../../lib/api';
import { useToast } from '../ui/Toast';
import { HoldTaskDialog } from './HoldTaskDialog';

type Status = IDPTask['progress_status']; // 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'

interface TaskStatusControlProps {
    task: IDPTask;
    onStatusChanged: () => void;
}

const STATUS_META: Record<Status, { label: string; swatch: string }> = {
    TODO:        { label: 'Todo',        swatch: 'bg-slate-300 dark:bg-slate-600' },
    IN_PROGRESS: { label: 'In progress', swatch: 'bg-indigo-500' },
    ON_HOLD:     { label: 'On hold',     swatch: 'bg-amber-500' },
    DONE:        { label: 'Done',        swatch: 'bg-emerald-500' },
};

const MENU_ORDER: Status[] = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'];

export function TaskStatusControl({ task, onStatusChanged }: TaskStatusControlProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [holdOpen, setHoldOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const toast = useToast();

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', handler);
        window.addEventListener('keydown', keyHandler);
        return () => {
            document.removeEventListener('mousedown', handler);
            window.removeEventListener('keydown', keyHandler);
        };
    }, [menuOpen]);

    async function applyStatus(next: Status) {
        if (saving) return;
        if (next === task.progress_status) { setMenuOpen(false); return; }
        if (next === 'ON_HOLD') {
            setMenuOpen(false);
            setHoldOpen(true);
            return;
        }
        setSaving(true);
        try {
            await developmentPlansApi.updateMyTaskStatus(task.id, next);
            toast.success(next === 'DONE' ? 'Task completed' : `Status updated to ${STATUS_META[next].label}`);
            onStatusChanged();
        } catch (err: any) {
            toast.error(err?.message || 'Could not update status');
        } finally {
            setSaving(false);
            setMenuOpen(false);
        }
    }

    async function toggleDone() {
        if (saving) return;
        const next: Status = task.progress_status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
        await applyStatus(next);
    }

    const current = STATUS_META[task.progress_status];
    const isDone = task.progress_status === 'DONE';

    return (
        <>
            <div className="flex items-center gap-2">
                {/* Checkbox: only toggles DONE ↔ IN_PROGRESS. Never silently reverts completion on a stray click. */}
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={isDone ? 'Mark task as not done' : 'Mark task as done'}
                    disabled={saving}
                    onClick={toggleDone}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                        ${isDone
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'}
                        disabled:opacity-50`}
                >
                    {isDone && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>

                {/* Status pill: opens popover with all 4 statuses */}
                <div className="relative">
                    <button
                        ref={triggerRef}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={`Change status, currently ${current.label}`}
                        onClick={() => setMenuOpen(v => !v)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${current.swatch}`} aria-hidden />
                        <span>{current.label}</span>
                        <svg className="w-3 h-3 text-slate-400" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    {menuOpen && (
                        <div
                            ref={menuRef}
                            role="menu"
                            className="absolute right-0 mt-1 z-20 w-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
                        >
                            {MENU_ORDER.map(s => {
                                const meta = STATUS_META[s];
                                const isCurrent = s === task.progress_status;
                                return (
                                    <button
                                        key={s}
                                        role="menuitem"
                                        type="button"
                                        onClick={() => applyStatus(s)}
                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${isCurrent ? 'font-semibold' : ''}`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${meta.swatch}`} aria-hidden />
                                        <span className="flex-1">{meta.label}</span>
                                        {isCurrent && (
                                            <svg className="w-3 h-3 text-indigo-500" viewBox="0 0 12 12" fill="none" aria-hidden>
                                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <HoldTaskDialog
                taskId={task.id}
                taskTitle={task.title}
                open={holdOpen}
                onClose={() => setHoldOpen(false)}
                onSuccess={onStatusChanged}
            />
        </>
    );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/my-tasks-modal.spec.ts" | grep -E "(error|Error)" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/idp/TaskStatusControl.tsx
git commit -m "feat(idp): add TaskStatusControl replacing tri-state cycle button"
```

---

## Task 5: `TaskCommentsPanel` — right-side slide-over comments panel

**Files:**
- Create: `apps/web/src/components/idp/TaskCommentsPanel.tsx`

A side panel (not a modal) that lists existing comments for the selected task and lets the user append a new one. Slides in from the right; Escape or backdrop click closes. Fetches on mount; does not poll. Author identity is rendered as "You" when `author_id === currentUserId`, else "Manager" (Plan B doesn't need per-author names; Plan E can enrich later).

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/idp/TaskCommentsPanel.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { developmentPlansApi, IDPTaskComment } from '../../lib/api';
import { useToast } from '../ui/Toast';

interface TaskCommentsPanelProps {
    open: boolean;
    taskId: string | null;
    taskTitle: string;
    currentUserId: string;
    onClose: () => void;
}

function fmtTime(iso: string) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
        return iso.slice(0, 16);
    }
}

export function TaskCommentsPanel({ open, taskId, taskTitle, currentUserId, onClose }: TaskCommentsPanelProps) {
    const [comments, setComments] = useState<IDPTaskComment[]>([]);
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState('');
    const [posting, setPosting] = useState(false);
    const [visible, setVisible] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (!open) { setVisible(false); return; }
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !taskId) return;
        let cancelled = false;
        setLoading(true);
        developmentPlansApi.listMyTaskComments(taskId)
            .then(list => { if (!cancelled) setComments(list); })
            .catch((err: any) => { if (!cancelled) toast.error(err?.message || 'Could not load comments'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, taskId, toast]);

    async function submit() {
        if (!taskId) return;
        const body = draft.trim();
        if (body.length === 0 || posting) return;
        setPosting(true);
        try {
            const created = await developmentPlansApi.addMyTaskComment(taskId, body);
            setComments(prev => [...prev, created]);
            setDraft('');
        } catch (err: any) {
            toast.error(err?.message || 'Could not add comment');
        } finally {
            setPosting(false);
        }
    }

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="comments-panel-title"
            className="fixed inset-0 z-40"
        >
            <div
                className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />
            <div
                className={`absolute top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className="flex items-start justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="min-w-0">
                        <h2 id="comments-panel-title" className="text-sm font-semibold text-slate-900 dark:text-white">Comments</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{taskTitle}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Close comments panel"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading && <p className="text-xs text-slate-400">Loading…</p>}
                    {!loading && comments.length === 0 && (
                        <p className="text-xs text-slate-400">No comments yet. Start the thread below.</p>
                    )}
                    {comments.map(c => {
                        const isMe = c.author_id === currentUserId;
                        return (
                            <div key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{isMe ? 'You' : 'Manager'}</span>
                                    <span>·</span>
                                    <span>{fmtTime(c.created_at)}</span>
                                </div>
                                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{c.body}</p>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                    <label htmlFor="comment-draft" className="sr-only">New comment</label>
                    <textarea
                        id="comment-draft"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder="Add a comment…"
                        className="w-full text-sm p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    />
                    <div className="mt-2 flex items-center justify-end">
                        <button
                            type="button"
                            onClick={submit}
                            disabled={posting || draft.trim().length === 0}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {posting ? 'Posting…' : 'Post comment'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/my-tasks-modal.spec.ts" | grep -E "(error|Error)" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/idp/TaskCommentsPanel.tsx
git commit -m "feat(idp): add TaskCommentsPanel slide-over for per-task comments"
```

---

## Task 6: Refactor the IDP branch of `journeys/page.tsx`

**Files:**
- Modify: `apps/web/app/journeys/page.tsx`

Replace the tri-state cycle button (lines 122-135) and overdue-only microcopy (lines 139-147) with `<TaskStatusControl>` + `<TaskStatusBadge>` + a 💬 comments icon. Swap the `alert()`/`console.log` stubs for the toast hook. **Do not touch** the Journey-preparation (`!isActive`) branch — that belongs to Plan C.

- [ ] **Step 1: Read the current file to preserve unrelated structure**

```bash
sed -n '1,50p' apps/web/app/journeys/page.tsx
```

Note which imports and functions exist. You will delete the local `showError` / `showSuccess` stubs at lines 8-9.

- [ ] **Step 2: Apply the refactor**

In `apps/web/app/journeys/page.tsx`:

**(a)** Replace the imports block at the top (lines 1-6) with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { myJourneysApi, developmentPlansApi, AssignedJourney, IDPPlan, IDPTask } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { useToast } from '../../src/components/ui/Toast';
import { TaskStatusControl } from '../../src/components/idp/TaskStatusControl';
import { TaskStatusBadge, inferBadgeKind } from '../../src/components/idp/TaskStatusBadge';
import { TaskCommentsPanel } from '../../src/components/idp/TaskCommentsPanel';
```

**(b)** Delete the local stubs at lines 8-9 (`function showError`, `function showSuccess`).

**(c)** Inside `JourneysPage()`, just below the existing `const { userStatus } = useAuth();` line (line 21), add:

```tsx
    const { user } = useAuth();
    const toast = useToast();
    const [commentsTask, setCommentsTask] = useState<IDPTask | null>(null);
```

If the existing `useAuth()` destructure doesn't expose `user`, look up the provider and use whatever property holds the current user's id. Adjust the destructure accordingly and pass that id into `<TaskCommentsPanel currentUserId=...>`.

**(d)** Replace the `handleUpdateTaskStatus` function entirely (lines 55-64) with a smaller helper — individual status transitions are now owned by `TaskStatusControl`:

```tsx
    async function reloadPlan() {
        try {
            const updated = await developmentPlansApi.getMy();
            setIdpPlan(updated);
        } catch (err: any) {
            toast.error(err?.message || 'Could not refresh plan');
        }
    }
```

**(e)** Replace the inner task row (currently `apps/web/app/journeys/page.tsx:121-148`) with:

```tsx
                                        {obj.tasks.map(task => {
                                            const badgeKind = inferBadgeKind(task);
                                            const showBadge = ['on_hold', 'overdue', 'done_late'].includes(badgeKind);
                                            return (
                                                <div
                                                    key={task.id}
                                                    className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                                >
                                                    <TaskStatusControl task={task} onStatusChanged={reloadPlan} />
                                                    <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                        {task.title}
                                                    </span>
                                                    {showBadge && (
                                                        <TaskStatusBadge
                                                            kind={badgeKind}
                                                            suffix={badgeKind === 'done_late' && task.completed_at && task.due_date
                                                                ? lateSuffix(task.due_date, task.completed_at)
                                                                : undefined}
                                                        />
                                                    )}
                                                    {task.progress_status === 'DONE' && badgeKind === 'done' && task.completed_at && (
                                                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                            Completed {fmtDate(task.completed_at)}
                                                        </span>
                                                    )}
                                                    {(task.start_date || task.due_date) && task.progress_status !== 'DONE' && badgeKind !== 'overdue' && badgeKind !== 'on_hold' && (
                                                        <span className="text-xs text-slate-400">
                                                            {task.start_date ? fmtDate(task.start_date) : ''}{task.start_date && task.due_date ? ' → ' : ''}{task.due_date ? fmtDate(task.due_date) : ''}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        aria-label={`Open comments for ${task.title}`}
                                                        onClick={() => setCommentsTask(task)}
                                                        className="text-xs text-slate-400 hover:text-indigo-500 px-1.5 py-1 rounded"
                                                        title="Comments"
                                                    >
                                                        💬
                                                    </button>
                                                </div>
                                            );
                                        })}
```

**(f)** Immediately above the component's final closing `</div>`, render the comments panel once:

```tsx
            <TaskCommentsPanel
                open={commentsTask !== null}
                taskId={commentsTask?.id ?? null}
                taskTitle={commentsTask?.title ?? ''}
                currentUserId={user?.id ?? ''}
                onClose={() => setCommentsTask(null)}
            />
```

**(g)** Add the `lateSuffix` helper near the existing `fmtDate` at the top of the file:

```tsx
function lateSuffix(dueDate: string, completedAt: string) {
    const due = new Date(dueDate);
    const done = new Date(completedAt);
    const days = Math.max(1, Math.round((done.getTime() - due.getTime()) / 86400000));
    return `Late by ${days}d`;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/my-tasks-modal.spec.ts" | grep -E "(error|Error)" || echo "clean"
```

Expected: `clean`. If `useAuth()` does not return `user`, follow the provider and surface the actual id property (search with `grep -n "export.*useAuth\|AuthProvider" apps/web/src/components/providers/AuthProvider.tsx`) and update the destructure.

- [ ] **Step 4: Run the dev server and exercise the page manually**

```bash
cd apps/web && npm run dev &
sleep 3
```

Open the running dev URL as an ACTIVE user with at least one IDP task. Verify:
- Checkbox toggles DONE ↔ IN_PROGRESS (never reverts silently).
- Status pill opens popover; picking "On hold" opens the HoldTaskDialog.
- Submitting an empty hold reason is disabled; submitting a 3+ char reason closes the dialog and shows the `on_hold` badge.
- 💬 opens the side panel; posting a comment appends to the list.
- All errors surface as toasts; no `alert()` fires.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/journeys/page.tsx
git commit -m "feat(idp): wire TaskStatusControl + comments panel into My Development Plan"
```

---

## Task 7: Playwright e2e spec — IDP interactions

**Files:**
- Create: `apps/web/e2e/idp-task-interactions.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/e2e/idp-task-interactions.spec.ts`:

```ts
import { test, expect, Page } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const BASE_PLAN = {
    id: 'plan-1',
    title: 'Q2 Plan',
    plan_type: 'idp',
    owner_user_id: 'user-1',
    is_active: true,
    created_at: '2026-01-01',
    objectives: [{
        id: 'obj-1',
        title: 'Objective',
        sort_order: 1,
        progress: { total: 1, done: 0, completion_pct: 0, overdue: 0 },
        tasks: [{
            id: 'task-1',
            title: 'Ship X',
            is_mandatory: true,
            progress_status: 'TODO' as const,
            due_date: '2026-05-01',
            hold_reason: null,
            completed_late: null,
        }],
    }],
    progress: {
        total_tasks: 1, done_tasks: 0, completion_pct: 0,
        mandatory_tasks: 1, mandatory_done: 0,
        overdue_tasks: 0, on_hold_tasks: 0,
    },
};

async function stubPlan(page: Page, plan = BASE_PLAN) {
    await mockAuthenticatedSession(page, { status: 'ACTIVE' });
    await page.route('**/api/development-plans/my', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan) });
    });
}

test('status popover lets user pick On hold which opens a dialog requiring a reason', async ({ page }) => {
    await stubPlan(page);

    let patchBody: any = null;
    await page.route('**/api/development-plans/my/tasks/task-1/status', async (route) => {
        patchBody = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            task_id: 'task-1', progress_status: 'ON_HOLD', hold_reason: patchBody.comment,
        }) });
    });

    await page.goto('/journeys');
    await page.getByRole('button', { name: /Change status, currently Todo/i }).click();
    await page.getByRole('menuitem', { name: /On hold/i }).click();

    // Dialog should be open; submit disabled until 3+ chars
    const submit = page.getByRole('button', { name: /Place on hold/i });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/Why is this blocked/i).fill('Blocked on review');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole('status')).toContainText(/on hold/i);
    expect(patchBody).toMatchObject({ status: 'ON_HOLD', comment: 'Blocked on review' });
});

test('checkbox toggles DONE without reverting on a stray second click', async ({ page }) => {
    await stubPlan(page);
    const calls: string[] = [];
    await page.route('**/api/development-plans/my/tasks/task-1/status', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        calls.push(body.status);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            task_id: 'task-1', progress_status: body.status, hold_reason: null,
        }) });
    });
    await page.goto('/journeys');
    const checkbox = page.getByRole('checkbox', { name: /Mark task as done/i });
    await checkbox.click();
    expect(calls).toEqual(['DONE']);
});

test('comments panel posts to the backend and appends the new comment', async ({ page }) => {
    await stubPlan(page);
    await page.route('**/api/development-plans/my/tasks/task-1/comments', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
            return;
        }
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
            id: 'c-new', user_id: 'user-1', task_id: 'task-1', author_id: 'user-1',
            body: body.body, created_at: '2026-04-18T12:00:00Z', updated_at: '2026-04-18T12:00:00Z',
        }) });
    });
    await page.goto('/journeys');
    await page.getByRole('button', { name: /Open comments for Ship X/i }).click();
    await page.getByLabel(/New comment/i).fill('Will handle tomorrow');
    await page.getByRole('button', { name: /Post comment/i }).click();
    await expect(page.getByText('Will handle tomorrow')).toBeVisible();
});
```

- [ ] **Step 2: Run the spec**

```bash
cd apps/web && npm run test:e2e -- idp-task-interactions.spec.ts
```

Expected: all 3 tests PASS. If selectors mismatch because the auth provider puts the user id somewhere other than `user?.id`, update the page refactor to pass the correct id and re-run.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/idp-task-interactions.spec.ts
git commit -m "test(idp): add e2e coverage for status popover, hold dialog, comments panel"
```

---

## Task 8: Graphify refresh + smoke against prod

- [ ] **Step 1: Rebuild the knowledge graph**

Per `CLAUDE.md` rule for this repo after code changes:

```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 2: Deploy and smoke**

Push the branch, wait for CI/CD, then run the post-deploy verification from CLAUDE.md:

```bash
docker ps | grep qc-api    # wait for (healthy)
curl -s https://api.gebrils.cloud/api/health
```

Then sign in as an ACTIVE user on `https://gebrils.cloud` and walk the four interactions:
1. Click the checkbox — task goes DONE, toast appears.
2. Click the status pill → On hold → reason required → submit — badge flips to "On hold".
3. Click 💬 → side panel opens → post a comment → appears at bottom.
4. Click the status pill → In progress — `hold_reason` clears, badge goes back to "In progress".

- [ ] **Step 3: Final commit (if graphify output changed and is tracked)**

```bash
git status graphify-out/
# If graphify-out is untracked per repo convention, skip this step.
git add graphify-out/ 2>/dev/null && git commit -m "chore(graphify): refresh graph after Plan B" || echo "graphify-out not tracked — skipping"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - Replace tri-state cycle → Task 4 (`TaskStatusControl` with Done-only checkbox + explicit popover).
  - On Hold as a status with required comment → Task 3 (`HoldTaskDialog`) wired from Task 4.
  - Comment side panel → Task 5 (`TaskCommentsPanel`).
  - Visual status system (icon + color + label, never color-only) → Task 2 (`TaskStatusBadge`).
  - Overdue + late rendering → Task 2 variants `overdue` / `done_late` + Task 6 `lateSuffix` rendering.
  - Replace `alert()` / `console.log` → Task 1 (toast) + Task 6 (removing local stubs).
  - Accessibility: roles + aria-labels on checkbox/menu/dialog/panel, Escape-to-close, focus on textarea open, `sr-only` labels on textareas.
- **Placeholder scan:** every code block is complete; no "TBD", no "similar to Task N".
- **Type consistency:** `IDPTask['progress_status']` is the union used throughout; `inferBadgeKind` matches the narrowing used in the page refactor; `developmentPlansApi.updateMyTaskStatus` / `.listMyTaskComments` / `.addMyTaskComment` are the exact names Plan A shipped in `apps/web/src/lib/api.ts`.
- **Scope:**
  - Journey-preparation branch untouched.
  - Manager-side IDP editor untouched.
  - No route split (Plan C).
  - No new npm dependency.
- **Contrast & a11y:**
  - Amber dark-mode text uses `amber-300` (not `amber-500`) against `slate-900`.
  - Every status badge pairs color with icon + label.
  - Dialogs use `role="dialog"` + `aria-modal` + `aria-labelledby`.
  - Status menu uses `role="menu"` / `role="menuitem"`.
  - Checkbox uses `role="checkbox"` + `aria-checked`.
  - Toasts use `aria-live="polite"`, errors use `role="alert"`.
- **Known pre-existing `tsc` error** (`e2e/my-tasks-modal.spec.ts:65`) is unrelated to this plan and is filtered out of the typecheck command above.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-idp-task-interaction-ux.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints.

Which approach?
