# Tuleap CRUD Frontend Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create, edit, detail, and delete UI pages for Tuleap artifacts (User Stories, Test Cases, Bugs) that call the new `/tuleap/artifacts/:type` CRUD API endpoints directly.

**Architecture:** Frontend calls `tuleapApi` helper functions (added to `api.ts`) which proxy to the Tuleap artifact endpoints. Each artifact type gets a form component and create/edit/detail pages. User Stories list is added as a tab inside the existing project detail page.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, react-hook-form + zod, Tailwind CSS, existing UI components (`Button`, `Input`, `Select`, `Badge`, `Spinner`)

---

## File Structure

```
apps/web/
  src/
    lib/
      api.ts                           ← add tuleapApi object + TuleapArtifact type
    components/
      user-stories/
        UserStoryForm.tsx              ← new: form for create/edit
      test-cases/
        TestCaseForm.tsx               ← new: form for create/edit
      bugs/
        BugForm.tsx                    ← new: form for create/edit
  app/
    user-stories/
      create/page.tsx                  ← new
      [id]/page.tsx                    ← new: detail
      [id]/edit/page.tsx               ← new: edit
    test-cases/
      create/page.tsx                  ← new
      [id]/page.tsx                    ← new: detail
      [id]/edit/page.tsx               ← new: edit
    bugs/
      create/page.tsx                  ← new
      [id]/page.tsx                    ← new: detail
      [id]/edit/page.tsx               ← new: edit
    projects/
      [id]/page.tsx                    ← modify: add User Stories tab
    bugs/
      page.tsx                         ← modify: add Create + View links
    test-cases/
      page.tsx                         ← modify: fix Create + View/Edit links
  src/config/
    routes.ts                          ← modify: add new routes
```

---

## Task 1: Add `tuleapApi` to `api.ts`

**File:** `apps/web/src/lib/api.ts`

- [ ] **Step 1.1: Add TuleapArtifact type and tuleapApi object**

Append to the end of `apps/web/src/lib/api.ts` (before the last export or at the bottom):

```ts
export interface TuleapArtifact {
    id: number;
    xref?: string;
    title?: string;
    summary?: string;
    description?: string;
    status?: string;
    [key: string]: unknown;
}

export const tuleapApi = {
    list: async (type: string, params?: Record<string, string | number>) => {
        const query = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return fetchApi<{ data: TuleapArtifact[]; total: number }>(`/tuleap/artifacts/${type}${query}`);
    },
    get: async (type: string, id: string | number) =>
        fetchApi<TuleapArtifact>(`/tuleap/artifacts/${type}/${id}`),
    create: async (type: string, data: Record<string, unknown>) =>
        fetchApi<{ tuleap_artifact_id: number; tuleap_url: string; artifact_type: string; xref: string }>(`/tuleap/artifacts/${type}`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: async (id: string | number, type: string, fields: Record<string, unknown>) =>
        fetchApi<{ updated: boolean }>(`/tuleap/artifacts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ type, fields }),
        }),
    remove: async (id: string | number) =>
        fetchApi<{ deleted: boolean }>(`/tuleap/artifacts/${id}`, {
            method: 'DELETE',
        }),
};
```

- [ ] **Step 1.2: Verify it compiles**

```bash
cd /root/QC-Manager/apps/web && npx tsc --noEmit src/lib/api.ts 2>&1 | head -10
```

- [ ] **Step 1.3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add tuleapApi helper to api.ts for Tuleap artifact CRUD"
```

---

## Task 2: Bug Form Component + Create/Edit/Detail Pages

**Files:**
- Create: `apps/web/src/components/bugs/BugForm.tsx`
- Create: `apps/web/app/bugs/create/page.tsx`
- Create: `apps/web/app/bugs/[id]/page.tsx`
- Create: `apps/web/app/bugs/[id]/edit/page.tsx`

- [ ] **Step 2.1: Create `BugForm.tsx`**

```tsx
// apps/web/src/components/bugs/BugForm.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRouter } from 'next/navigation';
import { tuleapApi } from '@/lib/api';

const bugSchema = z.object({
    bugTitle: z.string().min(1, 'Title is required'),
    environment: z.string().min(1, 'Environment is required'),
    serviceName: z.string().min(1, 'Service name is required'),
    stepsToReproduce: z.string().optional(),
    severity: z.string().optional(),
    status: z.string().optional(),
});

type BugFormData = z.infer<typeof bugSchema>;

interface BugFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
}

export function BugForm({ initialData, isEdit, artifactId }: BugFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<BugFormData>({
        resolver: zodResolver(bugSchema) as any,
        defaultValues: {
            bugTitle: (initialData?.bugTitle as string) || '',
            environment: (initialData?.environment as string) || '',
            serviceName: (initialData?.serviceName as string) || '',
            stepsToReproduce: (initialData?.stepsToReproduce as string) || '',
            severity: (initialData?.severity as string) || 'medium',
            status: (initialData?.status as string) || 'New',
        },
    });

    const onSubmit = async (data: BugFormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            if (isEdit && artifactId) {
                await tuleapApi.update(artifactId, 'bug', data);
                router.push(`/bugs/${artifactId}`);
            } else {
                const result = await tuleapApi.create('bug', data);
                router.push(`/bugs/${result.tuleap_artifact_id}`);
            }
        } catch (err: any) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}
            <div className="glass-card rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Bug Details</h3>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title *</label>
                    <Input {...register('bugTitle')} placeholder="Bug title" />
                    {errors.bugTitle && <p className="text-xs text-rose-500 mt-1">{errors.bugTitle.message}</p>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Environment *</label>
                        <Input {...register('environment')} placeholder="e.g. Production, Staging" />
                        {errors.environment && <p className="text-xs text-rose-500 mt-1">{errors.environment.message}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Service Name *</label>
                        <Input {...register('serviceName')} placeholder="e.g. Auth Service" />
                        {errors.serviceName && <p className="text-xs text-rose-500 mt-1">{errors.serviceName.message}</p>}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Steps to Reproduce</label>
                    <textarea {...register('stepsToReproduce')} rows={4} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Describe how to reproduce the bug..." />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Severity</label>
                        <select {...register('severity')} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                        <select {...register('status')} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="New">New</option>
                            <option value="Open">Open</option>
                            <option value="Assigned">Assigned</option>
                            <option value="Fixed">Fixed</option>
                            <option value="Verified">Verified</option>
                            <option value="Closed">Closed</option>
                        </select>
                    </div>
                </div>
            </div>
            <div className="flex gap-3">
                <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-2.5 rounded-xl font-medium">
                    {isSubmitting ? 'Saving...' : isEdit ? 'Update Bug' : 'Create Bug'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2.2: Create `bugs/create/page.tsx`**

```tsx
// apps/web/app/bugs/create/page.tsx
'use client';

import { BugForm } from '@/components/bugs/BugForm';

export default function CreateBugPage() {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create Bug in Tuleap</h1>
            <BugForm />
        </div>
    );
}
```

- [ ] **Step 2.3: Create `bugs/[id]/page.tsx`**

```tsx
// apps/web/app/bugs/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tuleapApi, type TuleapArtifact } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
    New: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    Open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    Assigned: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    Fixed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    Verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    Closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function BugDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const [artifact, setArtifact] = useState<TuleapArtifact | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            tuleapApi.get('bug', id)
                .then(setArtifact)
                .catch(err => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [id]);

    const handleDelete = async () => {
        if (!confirm('Delete this bug from Tuleap? This cannot be undone.')) return;
        try {
            await tuleapApi.remove(id);
            router.push('/bugs');
        } catch (err: any) {
            alert(err.message);
        }
    };

    if (isLoading) return <div className="max-w-3xl mx-auto py-8 px-4 text-center text-slate-400 animate-pulse">Loading...</div>;
    if (error) return <div className="max-w-3xl mx-auto py-8 px-4 text-center text-rose-500">{error}</div>;
    if (!artifact) return <div className="max-w-3xl mx-auto py-8 px-4 text-center text-slate-400">Bug not found</div>;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => router.back()}>← Back</Button>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{artifact.title || artifact.xref || `Bug #${id}`}</h1>
                </div>
                <div className="flex gap-2">
                    <Link href={`/bugs/${id}/edit`}>
                        <Button variant="outline">Edit</Button>
                    </Link>
                    <Button variant="outline" onClick={handleDelete} className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800">
                        Delete
                    </Button>
                </div>
            </div>
            <div className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">ID: {id}</span>
                    {artifact.xref && <span className="text-xs text-slate-500">Ref: {artifact.xref}</span>}
                    {artifact.status && (
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[artifact.status] || 'bg-slate-100 text-slate-600'}`}>
                            {artifact.status}
                        </span>
                    )}
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Details</h3>
                    <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 overflow-auto max-h-96">
                        {JSON.stringify(artifact, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2.4: Create `bugs/[id]/edit/page.tsx`**

```tsx
// apps/web/app/bugs/[id]/edit/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { tuleapApi, type TuleapArtifact } from '@/lib/api';
import { BugForm } from '@/components/bugs/BugForm';

export default function EditBugPage() {
    const params = useParams();
    const id = params?.id as string;
    const [artifact, setArtifact] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (id) {
            tuleapApi.get('bug', id)
                .then(data => setArtifact(data as unknown as Record<string, unknown>))
                .finally(() => setIsLoading(false));
        }
    }, [id]);

    if (isLoading) return <div className="max-w-3xl mx-auto py-8 px-4 text-center text-slate-400 animate-pulse">Loading...</div>;
    if (!artifact) return <div className="max-w-3xl mx-auto py-8 px-4 text-center text-slate-400">Bug not found</div>;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Edit Bug #{id}</h1>
            <BugForm initialData={artifact} isEdit artifactId={id} />
        </div>
    );
}
```

- [ ] **Step 2.5: Update `bugs/page.tsx` — add Create button and row links**

In `apps/web/app/bugs/page.tsx`, find the header section where the page title is rendered. Add a "Create Bug" button next to the heading. Find each bug row in the table and wrap the bug ID with a link to `/bugs/${bug.tuleap_artifact_id || bug.id}`.

In the `BugsContent` function, add after the page title `Bugs` h1:
```tsx
<Link href="/bugs/create">
    <Button className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">+ Create Bug</Button>
</Link>
```

Import `Link` from `next/link` and `Button` from `@/components/ui/Button` if not already imported.

Also wrap the bug display ID in each table row with a link:
```tsx
<Link href={`/bugs/${bug.tuleap_artifact_id || bug.id}`} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
    {bug.display_id}
</Link>
```

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/src/components/bugs/BugForm.tsx apps/web/app/bugs/
git commit -m "feat(web): add Bug CRUD pages (create, detail, edit) with Tuleap API"
```

---

## Task 3: Test Case Form Component + Create/Edit/Detail Pages

**Files:**
- Create: `apps/web/src/components/test-cases/TestCaseForm.tsx`
- Create: `apps/web/app/test-cases/create/page.tsx`
- Create: `apps/web/app/test-cases/[id]/page.tsx`
- Create: `apps/web/app/test-cases/[id]/edit/page.tsx`

This follows the exact same pattern as Task 2 (Bug pages), with test-case-specific fields.

- [ ] **Step 3.1: Create `TestCaseForm.tsx`**

Same structure as BugForm but with these fields:
- `title` (required) — text input
- `testSteps` (required) — textarea
- `expectedResult` (required) — textarea
- `status` — select (active, draft, deprecated)
- `priority` — select (high, medium, low)
- `category` — select (functional, integration, regression, performance, security, usability, other)

The form calls `tuleapApi.create('test-case', data)` on create and `tuleapApi.update(id, 'test-case', fields)` on edit.

- [ ] **Step 3.2: Create `test-cases/create/page.tsx`**

Same pattern as `bugs/create/page.tsx` but with `TestCaseForm` and heading "Create Test Case in Tuleap".

- [ ] **Step 3.3: Create `test-cases/[id]/page.tsx`**

Same pattern as `bugs/[id]/page.tsx` but calling `tuleapApi.get('test-case', id)`.

- [ ] **Step 3.4: Create `test-cases/[id]/edit/page.tsx`**

Same pattern as `bugs/[id]/edit/page.tsx` but with `TestCaseForm`.

- [ ] **Step 3.5: Update `test-cases/page.tsx` — fix Create/Edit/View links**

The existing test cases list page has links to `/test-cases/create`, `/test-cases/[id]/edit`, and `/test-cases/[id]` but those pages don't exist yet. Now they will. No changes needed to the list page — the links will start working.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/components/test-cases/TestCaseForm.tsx apps/web/app/test-cases/
git commit -m "feat(web): add Test Case CRUD pages (create, detail, edit) with Tuleap API"
```

---

## Task 4: User Story Form Component + Create/Edit/Detail Pages

**Files:**
- Create: `apps/web/src/components/user-stories/UserStoryForm.tsx`
- Create: `apps/web/app/user-stories/create/page.tsx`
- Create: `apps/web/app/user-stories/[id]/page.tsx`
- Create: `apps/web/app/user-stories/[id]/edit/page.tsx`

- [ ] **Step 4.1: Create `UserStoryForm.tsx`**

Same structure as BugForm but with these fields:
- `summary` (required) — text input (maps to story_title in Tuleap)
- `overviewDescription` — textarea (maps to overview_description)
- `acceptanceCriteria` — textarea (maps to acceptance_criteria)
- `status` — select (Draft, Changes, Review, Approved)
- `requirementVersion` — text input
- `priority` — select (P1-Critical, P2-High, P3-Medium, P4-Low)

The form calls `tuleapApi.create('user-story', data)` on create and `tuleapApi.update(id, 'user-story', fields)` on edit.

Accepts optional `projectId` prop for pre-filling project context (used when creating from project detail page).

- [ ] **Step 4.2: Create `user-stories/create/page.tsx`**

Same pattern as bugs create but reads `projectId` from URL search params:
```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { UserStoryForm } from '@/components/user-stories/UserStoryForm';

function CreateUserStoryContent() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId');
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create User Story in Tuleap</h1>
            <UserStoryForm projectId={projectId || undefined} />
        </div>
    );
}

export default function CreateUserStoryPage() {
    return <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading...</div>}><CreateUserStoryContent /></Suspense>;
}
```

- [ ] **Step 4.3: Create `user-stories/[id]/page.tsx`**

Same pattern as bug detail page but calls `tuleapApi.get('user-story', id)`. Shows title, status, acceptance criteria, description, requirement version, priority. Edit link goes to `/user-stories/${id}/edit`.

- [ ] **Step 4.4: Create `user-stories/[id]/edit/page.tsx`**

Same pattern as bug edit but with `UserStoryForm`.

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/components/user-stories/UserStoryForm.tsx apps/web/app/user-stories/
git commit -m "feat(web): add User Story CRUD pages (create, detail, edit) with Tuleap API"
```

---

## Task 5: Add User Stories Tab to Project Detail

**File:** `apps/web/app/projects/[id]/page.tsx`

- [ ] **Step 5.1: Add tab state and User Stories tab**

Modify the project detail page to add a tab bar below the header. The existing content becomes the "Overview" tab. Add a "User Stories" tab that loads from `tuleapApi.list('user-story')`.

Add state at the top of the component function:
```tsx
const [activeTab, setActiveTab] = useState<'overview' | 'user-stories'>('overview');
const [userStories, setUserStories] = useState<TuleapArtifact[]>([]);
const [storiesLoading, setStoriesLoading] = useState(false);
```

Add a tab bar below the header (after the header div, before the grid):
```tsx
<div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
    <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Overview</button>
    <button onClick={() => { setActiveTab('user-stories'); if (!userStories.length) loadUserStories(); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'user-stories' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>User Stories</button>
</div>
```

Add the user stories loading function and table:
```tsx
const loadUserStories = async () => {
    setStoriesLoading(true);
    try {
        const result = await tuleapApi.list('user-story', { limit: 100 });
        setUserStories(result.data);
    } catch (err) {
        console.error(err);
    } finally {
        setStoriesLoading(false);
    }
};
```

Conditionally render the overview content or the user stories table based on `activeTab`.

The user stories table has columns: ID, Title, Status, Actions (View/Edit/Delete). Each row links to `/user-stories/${story.id}`.

- [ ] **Step 5.2: Commit**

```bash
git add apps/web/app/projects/[id]/page.tsx
git commit -m "feat(web): add User Stories tab to project detail page"
```

---

## Task 6: Update Routes Config

**File:** `apps/web/src/config/routes.ts`

- [ ] **Step 6.1: Add routes for new pages**

Add these entries to the `ROUTES` array:

```ts
{ path: '/user-stories/create', label: 'Create User Story', permission: 'page:projects', requiresActivation: true },
{ path: '/user-stories/[id]', label: 'User Story Details', permission: 'page:projects', requiresActivation: true },
{ path: '/user-stories/[id]/edit', label: 'Edit User Story', permission: 'page:projects', requiresActivation: true },
{ path: '/bugs/create', label: 'Create Bug', permission: 'page:bugs', requiresActivation: true },
{ path: '/bugs/[id]/edit', label: 'Edit Bug', permission: 'page:bugs', requiresActivation: true },
{ path: '/test-cases/create', label: 'Create Test Case', permission: 'page:test-executions', requiresActivation: true },
{ path: '/test-cases/[id]', label: 'Test Case Details', permission: 'page:test-executions', requiresActivation: true },
{ path: '/test-cases/[id]/edit', label: 'Edit Test Case', permission: 'page:test-executions', requiresActivation: true },
```

Note: `/bugs/[id]` already exists in routes at line 45, so no need to add it.

- [ ] **Step 6.2: Commit**

```bash
git add apps/web/src/config/routes.ts
git commit -m "feat(web): add routes for Tuleap CRUD pages"
```

---

## Task 7: Build verification

- [ ] **Step 7.1: Run Next.js build**

```bash
cd /root/QC-Manager/apps/web && npm run build
```

Expected: Build succeeds with no errors. All new pages compile.

- [ ] **Step 7.2: Commit any fixes if needed**

If the build revealed issues, fix and commit.

- [ ] **Step 7.3: Final git status**

```bash
cd /root/QC-Manager && git status
```

Verify all new files are committed. Working tree should be clean.
