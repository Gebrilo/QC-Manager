# My Tasks — Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline task form with a click-to-open centered modal that shows and edits full task details, and add inline expand/collapse for long descriptions on cards.

**Architecture:** A new `TaskDetailModal` component handles both create and edit modes. Cards become clickable — clicking anywhere opens the modal pre-filled with that task's data. The `+ New Task` button opens the same modal empty. Descriptions longer than 120 chars get a Show more / Show less toggle on the card so the full text is always accessible without opening the modal.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Playwright (E2E in `apps/web/e2e/`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/tasks/TaskDetailModal.tsx` | **Create** | Full edit + create modal component |
| `apps/web/app/my-tasks/page.tsx` | **Modify** | Wire modal state, remove inline form, update `TaskCard` (defined in this file) |
| `apps/web/src/components/tasks/TaskKanbanCard.tsx` | **Modify** | Rename `onEdit`→`onOpen`, remove pencil btn, add click handler + expand/collapse |
| `apps/web/e2e/my-tasks-modal.spec.ts` | **Create** | Playwright E2E tests |

> `TaskKanbanBoard.tsx` already uses `onOpen` in its interface — **no changes needed there**.

---

## Task 1: Write failing E2E tests

**Files:**
- Create: `apps/web/e2e/my-tasks-modal.spec.ts`

- [ ] **Step 1: Create the test file**

```ts
// apps/web/e2e/my-tasks-modal.spec.ts
import { test, expect, Page } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const TASKS = [
    {
        id: 'task-001',
        title: 'Write unit tests',
        description: 'Cover login, logout, and token refresh flows.',
        status: 'pending' as const,
        priority: 'medium' as const,
        due_date: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: 'task-002',
        title: 'Prepare regression suite',
        description: 'Cover all edge cases identified during the sprint review. Include mobile viewport tests and ensure all critical paths have assertions. Coordinate with dev team for environment setup.',
        status: 'in_progress' as const,
        priority: 'high' as const,
        due_date: '2026-04-24',
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];

async function mockMyTasksApi(page: Page, tasks = TASKS) {
    await mockAuthenticatedSession(page);
    await page.route('http://localhost:3001/my-tasks', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tasks) });
        } else if (route.request().method() === 'POST') {
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({ id: 'task-new', ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
            });
        } else {
            await route.continue();
        }
    });
    await page.route('http://localhost:3001/my-tasks/**', async (route) => {
        const method = route.request().method();
        if (method === 'PATCH') {
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...tasks[0], ...body }) });
        } else if (method === 'DELETE') {
            await route.fulfill({ status: 204, body: '' });
        } else {
            await route.continue();
        }
    });
}

test.describe('My Tasks — Detail Modal', () => {
    test('clicking a task card opens the modal pre-filled with task data', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Write unit tests' }).click();
        const modal = page.getByRole('dialog', { name: 'Task detail' });
        await expect(modal).toBeVisible();
        await expect(modal.getByDisplayValue('Write unit tests')).toBeVisible();
        await expect(modal.getByText('Cover login, logout, and token refresh flows.')).toBeVisible();
    });

    test('modal shows full description — no truncation', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Prepare regression suite' }).click();
        const modal = page.getByRole('dialog', { name: 'Task detail' });
        await expect(modal).toBeVisible();
        await expect(modal.getByText('Coordinate with dev team for environment setup.')).toBeVisible();
    });

    test('ESC key closes the modal without saving', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Write unit tests' }).click();
        await expect(page.getByRole('dialog', { name: 'Task detail' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Task detail' })).not.toBeVisible();
    });

    test('clicking backdrop closes the modal', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Write unit tests' }).click();
        await expect(page.getByRole('dialog', { name: 'Task detail' })).toBeVisible();
        await page.mouse.click(10, 10);
        await expect(page.getByRole('dialog', { name: 'Task detail' })).not.toBeVisible();
    });

    test('New Task button opens modal in create mode (no Delete, empty title)', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.click('button:has-text("New Task")');
        const modal = page.getByRole('dialog', { name: 'Task detail' });
        await expect(modal).toBeVisible();
        await expect(modal.getByPlaceholder('Task title')).toHaveValue('');
        await expect(modal.getByRole('button', { name: 'Delete' })).not.toBeVisible();
        await expect(modal.getByRole('button', { name: 'Create' })).toBeVisible();
    });

    test('long description (>120 chars) shows Show more toggle on card', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible();
    });

    test('Show more expands description; Show less collapses it', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.getByRole('button', { name: 'Show more' }).click();
        await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible();
        await page.getByRole('button', { name: 'Show less' }).click();
        await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible();
    });

    test('no inline form shown on page load (form is modal-only now)', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await expect(page.getByPlaceholder('Description (optional)')).not.toBeVisible();
    });
});
```

- [ ] **Step 2: Start the dev server (keep running in a separate terminal for all remaining steps)**

```bash
cd apps/web && npm run dev
```

Wait until `ready - started server on http://localhost:3000` before proceeding.

- [ ] **Step 3: Run tests to confirm they all fail**

```bash
cd apps/web && npx playwright test e2e/my-tasks-modal.spec.ts --reporter=line
```

Expected: all 8 tests FAIL (component and behaviour don't exist yet).

---

## Task 2: Create `TaskDetailModal` component

**Files:**
- Create: `apps/web/src/components/tasks/TaskDetailModal.tsx`

- [ ] **Step 4: Create the modal component**

```tsx
// apps/web/src/components/tasks/TaskDetailModal.tsx
'use client';

import { useState, useEffect } from 'react';

interface PersonalTask {
    id: string;
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface TaskFormPayload {
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
}

interface TaskDetailModalProps {
    task: PersonalTask | null;        // null = create mode
    onClose: () => void;
    onSave: (data: TaskFormPayload, id?: string) => Promise<void>;
    onDelete: (id: string) => void;
}

export function TaskDetailModal({ task, onClose, onSave, onDelete }: TaskDetailModalProps) {
    const isCreate = task === null;
    const [formData, setFormData] = useState<TaskFormPayload>({
        title: '',
        description: null,
        status: 'pending',
        priority: 'medium',
        due_date: null,
    });
    const [saving, setSaving] = useState(false);
    const [visible, setVisible] = useState(false);

    // Sync form fields when the task prop changes
    useEffect(() => {
        setFormData(
            task
                ? { title: task.title, description: task.description, status: task.status, priority: task.priority, due_date: task.due_date }
                : { title: '', description: null, status: 'pending', priority: 'medium', due_date: null }
        );
    }, [task]);

    // Entry animation: delay one frame so CSS transition fires
    useEffect(() => {
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    // ESC to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSave = async () => {
        if (!formData.title.trim()) return;
        setSaving(true);
        try {
            await onSave(
                { ...formData, title: formData.title.trim(), description: formData.description || null },
                task?.id
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (!task) return;
        onClose();
        onDelete(task.id);
    };

    return (
        <div
            role="dialog"
            aria-label="Task detail"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg transition-all duration-150 ease-out ${
                    visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header: label + title input + close button */}
                <div className="flex items-start gap-3 p-5 pb-0">
                    <div className="flex-1">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Task</p>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                            placeholder="Task title"
                            autoFocus
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="mt-6 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Description textarea — full text, no truncation */}
                <div className="px-5 pt-4">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Description</p>
                    <textarea
                        value={formData.description ?? ''}
                        onChange={e => setFormData(p => ({ ...p, description: e.target.value || null }))}
                        placeholder="Add a description (optional)"
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none max-h-48 overflow-y-auto"
                    />
                </div>

                {/* Metadata: Status · Priority · Due Date */}
                <div className="px-5 pt-3 grid grid-cols-3 gap-3">
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                        <select
                            value={formData.status}
                            onChange={e => setFormData(p => ({ ...p, status: e.target.value as PersonalTask['status'] }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            <option value="pending">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Priority</p>
                        <select
                            value={formData.priority}
                            onChange={e => setFormData(p => ({ ...p, priority: e.target.value as PersonalTask['priority'] }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Due Date</p>
                        <input
                            type="date"
                            value={formData.due_date ?? ''}
                            onChange={e => setFormData(p => ({ ...p, due_date: e.target.value || null }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                    </div>
                </div>

                {/* Timestamps — edit mode only */}
                {!isCreate && task && (
                    <div className="px-5 pt-2 flex gap-4">
                        <span className="text-[10px] text-slate-400">
                            Created {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-slate-400">
                            Updated {new Date(task.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                )}

                {/* Divider */}
                <div className="mx-5 mt-4 border-t border-slate-100 dark:border-slate-800" />

                {/* Footer: Delete (left) · Cancel + Save (right) */}
                <div className="px-5 py-4 flex items-center justify-between">
                    {!isCreate ? (
                        <button
                            onClick={handleDelete}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800 transition-colors"
                        >
                            Delete
                        </button>
                    ) : (
                        <div />
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !formData.title.trim()}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Run the tests — expect partial pass**

```bash
cd apps/web && npx playwright test e2e/my-tasks-modal.spec.ts --reporter=line
```

Expected: tests still fail — modal exists but isn't wired into the page yet.

---

## Task 3: Wire modal into `MyTasksPage`, remove inline form

**Files:**
- Modify: `apps/web/app/my-tasks/page.tsx`

- [ ] **Step 6: Add import at the top of `page.tsx`**

Add after the existing imports:

```ts
import { TaskDetailModal, type TaskFormPayload } from '../../src/components/tasks/TaskDetailModal';
```

- [ ] **Step 7: Replace state variables in `MyTasksPage`**

Remove:
```ts
const [showForm, setShowForm] = useState(false);
const [editingId, setEditingId] = useState<string | null>(null);
const [formData, setFormData] = useState({ title: '', description: '', priority: 'medium', due_date: '' });
const [saving, setSaving] = useState(false);
```

Add in their place:
```ts
const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
const [modalOpen, setModalOpen] = useState(false);
```

- [ ] **Step 8: Replace `handleSubmit` and `startEdit` with `openModal`, `closeModal`, `handleSave`**

Remove the entire `handleSubmit` function and the `startEdit` function. Add:

```ts
const openModal = (task: PersonalTask | null) => {
    setSelectedTask(task);
    setModalOpen(true);
};

const closeModal = () => {
    setModalOpen(false);
    setSelectedTask(null);
};

const handleSave = async (data: TaskFormPayload, id?: string) => {
    const url = id ? `${API_URL}/my-tasks/${id}` : `${API_URL}/my-tasks`;
    const method = id ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers, body: JSON.stringify(data) });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Failed to save task');
    }
    closeModal();
    await fetchTasks();
};
```

- [ ] **Step 9: Update the `+ New Task` button**

Replace:
```tsx
onClick={() => { setShowForm(true); setEditingId(null); setFormData({ title: '', description: '', priority: 'medium', due_date: '' }); }}
```

With:
```tsx
onClick={() => openModal(null)}
```

- [ ] **Step 10: Remove the inline form JSX block**

Delete the entire `{showForm && ( ... )}` block (~lines 190–243 in the original file — the `glass-card` form with title input, textarea, selects, and Cancel/Create buttons).

- [ ] **Step 11: Update `TaskKanbanBoard` usage**

Replace:
```tsx
<TaskKanbanBoard
    tasks={tasks}
    isLoading={loading}
    onStatusChange={handleStatusChange}
    onEdit={startEdit}
    onDelete={handleDelete}
/>
```

With:
```tsx
<TaskKanbanBoard
    tasks={tasks}
    isLoading={loading}
    onStatusChange={handleStatusChange}
    onOpen={openModal}
    onDelete={handleDelete}
/>
```

- [ ] **Step 12: Update `TaskCard` function signature** ← do this BEFORE step 13

> Updating the signature now prevents TypeScript errors when the JSX (Step 13) passes `onOpen`.

Replace:
```tsx
function TaskCard({ task, onStatusChange, onEdit, onDelete }: {
    task: PersonalTask;
    onStatusChange: (id: string, status: string) => void;
    onEdit: (task: PersonalTask) => void;
    onDelete: (id: string) => void;
}) {
    const statusCfg = STATUS_CONFIG[task.status];
```

With:
```tsx
function TaskCard({ task, onStatusChange, onOpen, onDelete }: {
    task: PersonalTask;
    onStatusChange: (id: string, status: string) => void;
    onOpen: (task: PersonalTask) => void;
    onDelete: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const isLong = (task.description?.length ?? 0) > 120;
    const statusCfg = STATUS_CONFIG[task.status];
```

- [ ] **Step 13: Update `TaskCard` usage in the list view**

Replace both occurrences of:
```tsx
<TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onEdit={startEdit} onDelete={handleDelete} />
```

With:
```tsx
<TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onOpen={openModal} onDelete={handleDelete} />
```

- [ ] **Step 14: Add `TaskDetailModal` to the JSX**

Add just before the final `</div>` that closes the page, after the existing delete confirmation modal:

```tsx
{/* Task Detail / Create Modal */}
{modalOpen && (
    <TaskDetailModal
        task={selectedTask}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
    />
)}
```

- [ ] **Step 15: Run the tests**

```bash
cd apps/web && npx playwright test e2e/my-tasks-modal.spec.ts --reporter=line
```

Expected: "no inline form", modal open/close/create, and card-click tests pass. Show more / Show less tests still fail.

---

## Task 4: Update `TaskCard` body — click handler, hover, expand/collapse

**Files:**
- Modify: `apps/web/app/my-tasks/page.tsx` (the `TaskCard` function)

> The function signature was already updated in Step 12. These steps wire up the interactions and description toggle.

- [ ] **Step 16: Make the card container clickable with hover ring**

Replace:
```tsx
<div className={`glass-card p-4 transition-all ${isDone ? 'opacity-60' : 'hover:shadow-md'}`}>
```

With:
```tsx
<div
    className={`glass-card p-4 transition-all cursor-pointer ${
        isDone ? 'opacity-60' : 'hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700'
    }`}
    onClick={() => onOpen(task)}
>
```

- [ ] **Step 17: Add `e.stopPropagation()` to the ✓ circle button**

Replace:
```tsx
onClick={() => onStatusChange(task.id, task.status === 'done' ? 'pending' : 'done')}
```

With:
```tsx
onClick={e => { e.stopPropagation(); onStatusChange(task.id, task.status === 'done' ? 'pending' : 'done'); }}
```

- [ ] **Step 18: Remove the status `<select>` dropdown from the card**

Delete this block entirely:
```tsx
{!isDone && (
    <select
        value={task.status}
        onChange={e => onStatusChange(task.id, e.target.value)}
        className="text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-400 focus:outline-none"
    >
        <option value="pending">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
        <option value="cancelled">Cancel</option>
    </select>
)}
```

- [ ] **Step 19: Remove the pencil edit button**

Delete this block entirely:
```tsx
<button onClick={() => onEdit(task)} className="p-1.5 rounded text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
</button>
```

- [ ] **Step 20: Add `e.stopPropagation()` to the delete button**

Replace:
```tsx
<button onClick={() => onDelete(task.id)} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
```

With:
```tsx
<button onClick={e => { e.stopPropagation(); onDelete(task.id); }} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
```

- [ ] **Step 21: Replace description with expand/collapse**

Replace:
```tsx
{task.description && (
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{task.description}</p>
)}
```

With:
```tsx
{task.description && (
    <div onClick={e => e.stopPropagation()}>
        <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${isLong && !expanded ? 'line-clamp-3' : ''}`}>
            {task.description}
        </p>
        {isLong && (
            <button
                onClick={() => setExpanded(p => !p)}
                className="text-[10px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 mt-0.5 font-medium"
            >
                {expanded ? 'Show less' : 'Show more'}
            </button>
        )}
    </div>
)}
```

- [ ] **Step 22: Run the tests**

```bash
cd apps/web && npx playwright test e2e/my-tasks-modal.spec.ts --reporter=line
```

Expected: all 8 tests pass.

---

## Task 5: Update `MyTaskKanbanCard` — rename `onEdit`→`onOpen`, click, expand/collapse

**Files:**
- Modify: `apps/web/src/components/tasks/TaskKanbanCard.tsx`

- [ ] **Step 23: Add `useState` import**

The file currently has no imports. Add this line after `'use client';`:

```ts
import { useState } from 'react';
```

- [ ] **Step 24: Update the props interface — rename `onEdit` → `onOpen`**

Replace:
```ts
interface MyTaskKanbanCardProps {
    task: PersonalTask;
    onStatusChange: (taskId: string, newStatus: string) => void;
    onEdit: (task: PersonalTask) => void;
    onDelete: (taskId: string) => void;
}
```

With:
```ts
interface MyTaskKanbanCardProps {
    task: PersonalTask;
    onStatusChange: (taskId: string, newStatus: string) => void;
    onOpen: (task: PersonalTask) => void;
    onDelete: (taskId: string) => void;
}
```

- [ ] **Step 25: Update component signature and add `expanded` state**

Replace:
```tsx
export function MyTaskKanbanCard({ task, onStatusChange, onEdit, onDelete }: MyTaskKanbanCardProps) {
    const handleDragStart = (e: React.DragEvent) => {
```

With:
```tsx
export function MyTaskKanbanCard({ task, onStatusChange, onOpen, onDelete }: MyTaskKanbanCardProps) {
    const [expanded, setExpanded] = useState(false);
    const isLong = (task.description?.length ?? 0) > 120;

    const handleDragStart = (e: React.DragEvent) => {
```

- [ ] **Step 26: Make the card container clickable with hover ring**

Replace:
```tsx
<div
    draggable
    onDragStart={handleDragStart}
    className={`glass-card p-4 rounded-xl cursor-grab active:cursor-grabbing hover:shadow-lg transition-all duration-200 group ${isDone ? 'opacity-60' : ''}`}
>
```

With:
```tsx
<div
    draggable
    onDragStart={handleDragStart}
    onClick={() => onOpen(task)}
    className={`glass-card p-4 rounded-xl cursor-pointer hover:shadow-lg transition-all duration-200 group ${
        isDone ? 'opacity-60' : 'hover:border-indigo-300 dark:hover:border-indigo-700'
    }`}
>
```

- [ ] **Step 27: Remove the pencil edit button**

Delete this block entirely:
```tsx
<button
    onClick={() => onEdit(task)}
    className="p-1 rounded text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
>
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
</button>
```

- [ ] **Step 28: Add `e.stopPropagation()` to the delete button**

Replace:
```tsx
<button
    onClick={() => onDelete(task.id)}
    className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
>
```

With:
```tsx
<button
    onClick={e => { e.stopPropagation(); onDelete(task.id); }}
    className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
>
```

- [ ] **Step 29: Replace description with expand/collapse**

Replace:
```tsx
{task.description && (
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">{task.description}</p>
)}
```

With:
```tsx
{task.description && (
    <div onClick={e => e.stopPropagation()}>
        <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1.5 ${isLong && !expanded ? 'line-clamp-3' : ''}`}>
            {task.description}
        </p>
        {isLong && (
            <button
                onClick={() => setExpanded(p => !p)}
                className="text-[10px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 mt-0.5 font-medium"
            >
                {expanded ? 'Show less' : 'Show more'}
            </button>
        )}
    </div>
)}
```

- [ ] **Step 30: Add `e.stopPropagation()` to the mobile status select**

Replace:
```tsx
<select
    className="md:hidden w-full mt-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/30"
    value={task.status}
    onChange={(e) => onStatusChange(task.id, e.target.value)}
>
```

With:
```tsx
<select
    className="md:hidden w-full mt-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/30"
    value={task.status}
    onClick={e => e.stopPropagation()}
    onChange={e => { e.stopPropagation(); onStatusChange(task.id, e.target.value); }}
>
```

- [ ] **Step 31: Run the full E2E test suite**

```bash
cd apps/web && npx playwright test e2e/my-tasks-modal.spec.ts --reporter=line
```

Expected: all 8 tests pass.

- [ ] **Step 32: Run smoke navigation tests to check for regressions**

```bash
cd apps/web && npx playwright test e2e/smoke-navigation.spec.ts --reporter=line
```

Expected: all smoke tests pass.

- [ ] **Step 33: Commit**

```bash
git add \
  apps/web/src/components/tasks/TaskDetailModal.tsx \
  apps/web/app/my-tasks/page.tsx \
  apps/web/src/components/tasks/TaskKanbanCard.tsx \
  apps/web/e2e/my-tasks-modal.spec.ts
git commit -m "feat(my-tasks): click-to-open detail modal, expand/collapse descriptions

- Replace inline task form with TaskDetailModal (handles create + edit)
- Cards are now clickable; circle-check and delete buttons stop propagation
- Descriptions >120 chars get inline Show more / Show less toggle
- Remove line-clamp-2 truncation from list and kanban cards
- Fix TaskKanbanCard: rename onEdit → onOpen to match TaskKanbanBoard interface"
```
