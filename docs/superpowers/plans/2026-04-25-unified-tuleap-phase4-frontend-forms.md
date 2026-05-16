# Phase 4: Frontend Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign BugForm, UserStoryForm, TestCaseForm, and TaskForm with section-based layouts, all unified schema fields, and update the `tuleapApi` client to send the canonical unified payload format.

**Architecture:** Each form uses `react-hook-form` + `zodResolver` (existing pattern). New shared components (`FormSection`, `Textarea`, `ErrorBanner`) eliminate duplication. The `tuleapApi` client gains `createUnified()` / `updateUnified()` methods that send `{ artifact_type, project_id, common, fields }` to a new API route. BugForm, UserStoryForm, and TestCaseForm use these new methods. TaskForm retains `fetchApi('/tasks')` (tasks are QC entities, not pure Tuleap artifacts) but gains the new unified fields.

**Tech Stack:** React 18, Next.js 14 (App Router), TypeScript, react-hook-form, Zod, Tailwind CSS, existing UI primitives (`Input`, `Select`, `Button`, `Card`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/ui/Textarea.tsx` | **Create** | Reusable textarea with label/error support |
| `apps/web/src/components/ui/ErrorBanner.tsx` | **Create** | Reusable error banner (replaces 4x duplication) |
| `apps/web/src/components/ui/FormSection.tsx` | **Create** | Card wrapper with section title for form sections |
| `apps/web/src/lib/api.ts` | **Modify** | Add `createUnified`/`updateUnified` to `tuleapApi`, add `UnifiedPayload` type |
| `apps/api/src/routes/tuleapArtifacts.js` | **Modify** | Update POST handler to accept unified payload, call `toTuleap()` |
| `apps/web/src/components/bugs/BugForm.tsx` | **Modify** | Full redesign with 4 sections + 17 fields |
| `apps/web/src/components/user-stories/UserStoryForm.tsx` | **Modify** | Full redesign with 4 sections + 12 fields |
| `apps/web/src/components/test-cases/TestCaseForm.tsx` | **Modify** | Full redesign with 4 sections + 15 fields |
| `apps/web/src/components/tasks/TaskForm.tsx` | **Modify** | Add unified fields (team, parent_story_id, estimates, blocked_reason) |

---

### Task 1: Shared Form Components

**Files:**
- Create: `apps/web/src/components/ui/Textarea.tsx`
- Create: `apps/web/src/components/ui/ErrorBanner.tsx`
- Create: `apps/web/src/components/ui/FormSection.tsx`

- [ ] **Step 1: Create `Textarea.tsx`**

Follow the exact pattern of `Input.tsx` (forwardRef, `label`/`error` props) but for `<textarea>`.

```tsx
'use client';

import { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, error, className = '', ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {label}
                    </label>
                )}
                <textarea
                    ref={ref}
                    className={`w-full rounded-xl border bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y ${error ? 'border-rose-300 dark:border-rose-700' : 'border-slate-200 dark:border-slate-800'} ${className}`}
                    {...props}
                />
                {error && <p className="text-sm font-medium text-rose-500 mt-1">{error}</p>}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';
```

- [ ] **Step 2: Create `ErrorBanner.tsx`**

Extract the error banner pattern duplicated in all 4 forms.

```tsx
'use client';

interface ErrorBannerProps {
    message: string | null;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
    if (!message) return null;
    return (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {message}
        </div>
    );
}
```

- [ ] **Step 3: Create `FormSection.tsx`**

Card wrapper for form sections with consistent styling.

```tsx
'use client';

interface FormSectionProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

export function FormSection({ title, children, className = '' }: FormSectionProps) {
    return (
        <div className={`bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors ${className}`}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                {title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {children}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds (new components not imported yet, no impact)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/Textarea.tsx apps/web/src/components/ui/ErrorBanner.tsx apps/web/src/components/ui/FormSection.tsx
git commit -m "feat: add shared FormSection, Textarea, and ErrorBanner components"
```

---

### Task 2: Update tuleapApi Client with Unified Payload Methods

**Files:**
- Modify: `apps/web/src/lib/api.ts` (lines ~1284-1317)

- [ ] **Step 1: Add UnifiedPayload type and `createUnified` / `updateUnified` methods**

Add these after the existing `tuleapApi` object and before the `TuleapSyncConfig` interface (around line 1317):

```typescript
export interface UnifiedPayload {
    artifact_type: 'bug' | 'task' | 'user_story' | 'test_case';
    project_id?: string;
    common: {
        title: string;
        description?: string;
        status?: string;
        assigned_to?: string | null;
        priority?: string | null;
        attachments?: Array<{ id?: number | string; name?: string; description?: string }>;
        links?: Array<{ type: string; target_artifact_id: number | string }>;
    };
    fields: Record<string, unknown>;
    tuleap?: {
        project_id?: number;
        tracker_id?: number;
        artifact_id?: number;
        url?: string;
    };
}
```

Add `createUnified` and `updateUnified` methods to the existing `tuleapApi` object (after `remove`):

```typescript
    createUnified: async (payload: UnifiedPayload) => {
        const type = payload.artifact_type;
        return fetchApi<{ tuleap_artifact_id: number; tuleap_url: string; artifact_type: string; xref: string }>(`/tuleap/artifacts/${type}`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
    updateUnified: async (artifactId: string | number, payload: UnifiedPayload) =>
        fetchApi<{ updated: boolean }>(`/tuleap/artifacts/${artifactId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),
```

- [ ] **Step 2: Update API POST handler in `tuleapArtifacts.js` to accept unified payload**

Read `apps/api/src/routes/tuleapArtifacts.js` and find the `POST /` handler (the route that creates artifacts). Modify it to detect whether the incoming body is a unified payload (has `artifact_type` and `common`) and if so, call `toTuleap()` to transform it.

Add this import at the top of `tuleapArtifacts.js`:
```javascript
const { toTuleap } = require('../services/tuleapTransformEngine');
```

In the `POST /` handler, before the existing payload building logic, add:

```javascript
if (req.body.artifact_type && req.body.common) {
    const { artifact_type, project_id, common, fields, tuleap } = req.body;
    const configResult = await pool.query(
        `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = $2 AND is_active = true`,
        [project_id, artifact_type]
    );
    const config = configResult.rows[0];
    if (!config) {
        return res.status(400).json({ error: `No active config for type '${artifact_type}' in project ${project_id}` });
    }
    const tuleapPayload = await toTuleap(
        { artifact_type, common, fields },
        config,
        tuleapClient
    );
    const result = await tuleapClient.createArtifact(config.tuleap_tracker_id, tuleapPayload);
    return res.status(201).json({
        tuleap_artifact_id: result.id,
        tuleap_url: `${config.tuleap_base_url || process.env.TULEAP_BASE_URL}/plugins/tracker/?aid=${result.id}`,
        artifact_type,
        xref: result.xref || null,
    });
}
```

- [ ] **Step 3: Verify API tests still pass**

Run: `cd apps/api && npm test -- --testPathPattern="tuleap" 2>&1 | tail -20`
Expected: All existing Tuleap tests pass (83 tests)

- [ ] **Step 4: Verify web build**

Run: `cd apps/web && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/api/src/routes/tuleapArtifacts.js
git commit -m "feat: add unified payload support to tuleapApi client and outbound API route"
```

---

### Task 3: Redesign BugForm

**Files:**
- Modify: `apps/web/src/components/bugs/BugForm.tsx`

The BugForm currently has 6 fields in a single section. The redesign adds 11 new fields across 4 sections.

**Section layout:**

| Section | Fields |
|---|---|
| **General** | Status, Assigned To, Severity, Close Date, Service Name |
| **Description** | Bug Title, Description + Steps, Environment, CC, Dev Fix Description, QC Verification Notes |
| **Progress** | Initial Effort, Remaining Effort |
| **References** | Linked Test Case IDs |

- [ ] **Step 1: Rewrite BugForm.tsx**

Replace the entire file content with the redesigned form. Key changes:
- 4 `FormSection` cards instead of 1 monolithic card
- New Zod schema matching all unified fields
- `ErrorBanner` component
- `Textarea` component for multi-line fields
- Uses `tuleapApi.createUnified` / `tuleapApi.updateUnified`
- Environment is now an enum (DEV/TEST/PROD) instead of free text
- `cc` is a comma-separated text input (split to array on submit)
- `linked_test_case_ids` is a comma-separated text input (split to array on submit)

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { tuleapApi } from '@/lib/api';

const bugSchema = z.object({
    title: z.string().min(1, 'Bug title is required'),
    description: z.string().optional().default(''),
    steps_to_reproduce: z.string().optional().default(''),
    status: z.enum(['New', 'Open', 'Assigned', 'Fixed', 'Verified', 'Closed']).optional().default('New'),
    assigned_to: z.string().optional().default(''),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
    close_date: z.string().optional().default(''),
    service_name: z.string().optional().default(''),
    environment: z.enum(['DEV', 'TEST', 'PROD']).optional().default('DEV'),
    cc: z.string().optional().default(''),
    dev_fix_description: z.string().optional().default(''),
    qc_verification_notes: z.string().optional().default(''),
    initial_effort: z.coerce.number().nullable().optional(),
    remaining_effort: z.coerce.number().nullable().optional(),
    linked_test_case_ids: z.string().optional().default(''),
});

type FormData = z.infer<typeof bugSchema>;

interface BugFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
    projectId?: string;
}

export function BugForm({ initialData, isEdit, artifactId, projectId }: BugFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(bugSchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || (initialData?.bugTitle as string) || '',
            description: (initialData?.description as string) || '',
            steps_to_reproduce: (initialData?.steps_to_reproduce as string) || (initialData?.stepsToReproduce as string) || '',
            status: (initialData?.status as any) || 'New',
            assigned_to: (initialData?.assigned_to as string) || '',
            severity: (initialData?.severity as any) || 'medium',
            close_date: (initialData?.close_date as string) || '',
            service_name: (initialData?.service_name as string) || (initialData?.serviceName as string) || '',
            environment: (initialData?.environment as any) || 'DEV',
            cc: Array.isArray(initialData?.cc) ? (initialData.cc as string[]).join(', ') : ((initialData?.cc as string) || ''),
            dev_fix_description: (initialData?.dev_fix_description as string) || '',
            qc_verification_notes: (initialData?.qc_verification_notes as string) || '',
            initial_effort: initialData?.initial_effort != null ? Number(initialData.initial_effort) : null,
            remaining_effort: initialData?.remaining_effort != null ? Number(initialData.remaining_effort) : null,
            linked_test_case_ids: Array.isArray(initialData?.linked_test_case_ids)
                ? (initialData.linked_test_case_ids as string[]).join(', ')
                : ((initialData?.linked_test_case_ids as string) || ''),
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                artifact_type: 'bug' as const,
                project_id: projectId,
                common: {
                    title: data.title,
                    description: data.description || undefined,
                    status: data.status,
                    assigned_to: data.assigned_to || null,
                    priority: data.severity,
                },
                fields: {
                    severity: data.severity,
                    environment: data.environment,
                    service_name: data.service_name || undefined,
                    steps_to_reproduce: data.steps_to_reproduce || undefined,
                    dev_fix_description: data.dev_fix_description || undefined,
                    qc_verification_notes: data.qc_verification_notes || undefined,
                    close_date: data.close_date || null,
                    cc: data.cc ? data.cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                    linked_test_case_ids: data.linked_test_case_ids ? data.linked_test_case_ids.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                    initial_effort: data.initial_effort ?? null,
                    remaining_effort: data.remaining_effort ?? null,
                },
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, payload);
                router.push(`/bugs/${artifactId}`);
            } else {
                const result = await tuleapApi.createUnified(payload);
                router.push(`/bugs/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save bug');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <Select
                    label="Status"
                    options={[
                        { value: 'New', label: 'New' },
                        { value: 'Open', label: 'Open' },
                        { value: 'Assigned', label: 'Assigned' },
                        { value: 'Fixed', label: 'Fixed' },
                        { value: 'Verified', label: 'Verified' },
                        { value: 'Closed', label: 'Closed' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Assigned To"
                    {...register('assigned_to')}
                    placeholder="email@example.com"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Severity"
                    options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                    {...register('severity')}
                    error={errors.severity?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Close Date"
                    type="date"
                    {...register('close_date')}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Service Name"
                    {...register('service_name')}
                    placeholder="e.g. Auth Service"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description">
                <div className="md:col-span-2">
                    <Input
                        label="Bug Title"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="e.g. Login page crashes on mobile"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Description + Steps to Reproduce"
                        {...register('steps_to_reproduce')}
                        placeholder="1. Go to login page&#10;2. Enter credentials&#10;3. Click submit..."
                    />
                </div>
                <Select
                    label="Environment"
                    options={[
                        { value: 'DEV', label: 'DEV' },
                        { value: 'TEST', label: 'TEST' },
                        { value: 'PROD', label: 'PROD' },
                    ]}
                    {...register('environment')}
                    error={errors.environment?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="CC (comma-separated emails)"
                    {...register('cc')}
                    placeholder="user1@example.com, user2@example.com"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Dev Fix Description"
                        {...register('dev_fix_description')}
                        placeholder="Developer notes on the fix..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="QC Verification Notes"
                        {...register('qc_verification_notes')}
                        placeholder="QC verification steps and results..."
                    />
                </div>
            </FormSection>

            <FormSection title="Progress">
                <Input
                    label="Initial Effort (hours)"
                    type="number"
                    step="0.5"
                    {...register('initial_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Remaining Effort (hours)"
                    type="number"
                    step="0.5"
                    {...register('remaining_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="References">
                <div className="md:col-span-2">
                    <Input
                        label="Linked Test Case IDs (comma-separated)"
                        {...register('linked_test_case_ids')}
                        placeholder="T-123, T-456"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-36 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Bug'}
                </Button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Update the Bug create page to pass `projectId` prop**

Read `apps/web/app/bugs/create/page.tsx`. Add projectId prop support (from URL search params or context):

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { BugForm } from '@/components/bugs/BugForm';

export default function CreateBugPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId') || undefined;
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create Bug in Tuleap</h1>
            <BugForm projectId={projectId} />
        </div>
    );
}
```

- [ ] **Step 3: Verify web build**

Run: `cd apps/web && npm run build 2>&1 | tail -15`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/bugs/BugForm.tsx apps/web/app/bugs/create/page.tsx
git commit -m "feat: redesign BugForm with section-based layout and all unified fields"
```

---

### Task 4: Redesign UserStoryForm

**Files:**
- Modify: `apps/web/src/components/user-stories/UserStoryForm.tsx`

**Section layout:**

| Section | Fields |
|---|---|
| **General** | Status, Summary, Priority |
| **Description** | Description, Acceptance Criteria, Change Reason |
| **Progress** | Initial Effort, Remaining Effort, Requirement Version |
| **References** | BA Author |

- [ ] **Step 1: Rewrite UserStoryForm.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { tuleapApi } from '@/lib/api';

const userStorySchema = z.object({
    title: z.string().min(1, 'Summary is required'),
    description: z.string().optional().default(''),
    acceptance_criteria: z.string().optional().default(''),
    change_reason: z.string().optional().default(''),
    status: z.enum(['Draft', 'Changes', 'Review', 'Approved']).optional().default('Draft'),
    priority: z.enum(['P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low']).optional().default('P3-Medium'),
    requirement_version: z.string().optional().default('1'),
    ba_author: z.string().optional().default(''),
    initial_effort: z.coerce.number().nullable().optional(),
    remaining_effort: z.coerce.number().nullable().optional(),
    assigned_to: z.string().optional().default(''),
});

type FormData = z.infer<typeof userStorySchema>;

interface UserStoryFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
    projectId?: string;
}

export function UserStoryForm({ initialData, isEdit, artifactId, projectId }: UserStoryFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(userStorySchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || (initialData?.story_title as string) || (initialData?.summary as string) || '',
            description: (initialData?.description as string) || (initialData?.overview_description as string) || '',
            acceptance_criteria: (initialData?.acceptance_criteria as string) || '',
            change_reason: (initialData?.change_reason as string) || '',
            status: (initialData?.status as any) || 'Draft',
            priority: (initialData?.priority as any) || 'P3-Medium',
            requirement_version: (initialData?.requirement_version as string) || '1',
            ba_author: (initialData?.ba_author as string) || '',
            initial_effort: initialData?.initial_effort != null ? Number(initialData.initial_effort) : null,
            remaining_effort: initialData?.remaining_effort != null ? Number(initialData.remaining_effort) : null,
            assigned_to: (initialData?.assigned_to as string) || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                artifact_type: 'user_story' as const,
                project_id: projectId,
                common: {
                    title: data.title,
                    description: data.description || undefined,
                    status: data.status,
                    assigned_to: data.assigned_to || null,
                    priority: data.priority,
                },
                fields: {
                    acceptance_criteria: data.acceptance_criteria || undefined,
                    requirement_version: data.requirement_version || '1',
                    change_reason: data.change_reason || undefined,
                    ba_author: data.ba_author || undefined,
                    initial_effort: data.initial_effort ?? null,
                    remaining_effort: data.remaining_effort ?? null,
                },
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, payload);
                router.push(`/user-stories/${artifactId}`);
            } else {
                const result = await tuleapApi.createUnified(payload);
                router.push(`/user-stories/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save user story');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <div className="md:col-span-2">
                    <Input
                        label="Summary"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="User story summary"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Status"
                    options={[
                        { value: 'Draft', label: 'Draft' },
                        { value: 'Changes', label: 'Changes' },
                        { value: 'Review', label: 'Review' },
                        { value: 'Approved', label: 'Approved' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Priority"
                    options={[
                        { value: 'P1-Critical', label: 'P1 - Critical' },
                        { value: 'P2-High', label: 'P2 - High' },
                        { value: 'P3-Medium', label: 'P3 - Medium' },
                        { value: 'P4-Low', label: 'P4 - Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description">
                <div className="md:col-span-2">
                    <Textarea
                        label="Description"
                        {...register('description')}
                        placeholder="Describe the user story..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Acceptance Criteria"
                        {...register('acceptance_criteria')}
                        placeholder="List acceptance criteria..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Change Reason"
                        {...register('change_reason')}
                        placeholder="Reason for this change..."
                    />
                </div>
            </FormSection>

            <FormSection title="Progress">
                <Input
                    label="Initial Effort (hours)"
                    type="number"
                    step="0.5"
                    {...register('initial_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Remaining Effort (hours)"
                    type="number"
                    step="0.5"
                    {...register('remaining_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Requirement Version"
                    {...register('requirement_version')}
                    placeholder="e.g. 1.0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="References">
                <Input
                    label="BA Author"
                    {...register('ba_author')}
                    placeholder="Business analyst name"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User Story'}
                </Button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Verify web build**

Run: `cd apps/web && npm run build 2>&1 | tail -15`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/user-stories/UserStoryForm.tsx
git commit -m "feat: redesign UserStoryForm with section-based layout and all unified fields"
```

---

### Task 5: Redesign TestCaseForm

**Files:**
- Modify: `apps/web/src/components/test-cases/TestCaseForm.tsx`

**Section layout:**

| Section | Fields |
|---|---|
| **General** | Title, Status, Priority, Assigned To |
| **Details** | Service Name, Preconditions, Task Number |
| **Test Definition** | Test Steps, Expected Result, Actual Result |
| **Progress** | Is Regression (checkbox), Execution Count, Note |

- [ ] **Step 1: Rewrite TestCaseForm.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { tuleapApi } from '@/lib/api';

const testCaseSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().default(''),
    status: z.enum(['active', 'draft', 'deprecated']).default('draft'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    assigned_to: z.string().optional().default(''),
    service_name: z.string().optional().default(''),
    preconditions: z.string().optional().default(''),
    test_steps: z.string().min(1, 'Test steps are required'),
    expected_result: z.string().min(1, 'Expected result is required'),
    actual_result: z.string().optional().default(''),
    task_number: z.string().optional().default(''),
    is_regression: z.boolean().optional().default(false),
    execution_count: z.coerce.number().optional(),
    note: z.string().optional().default(''),
});

type FormData = z.infer<typeof testCaseSchema>;

interface TestCaseFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
    projectId?: string;
}

export function TestCaseForm({ initialData, isEdit, artifactId, projectId }: TestCaseFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(testCaseSchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || '',
            description: (initialData?.description as string) || '',
            status: ((initialData?.status as string) || 'draft') as FormData['status'],
            priority: ((initialData?.priority as string) || 'medium') as FormData['priority'],
            assigned_to: (initialData?.assigned_to as string) || '',
            service_name: (initialData?.service_name as string) || '',
            preconditions: (initialData?.preconditions as string) || '',
            test_steps: (initialData?.test_steps as string) || (initialData?.testSteps as string) || '',
            expected_result: (initialData?.expected_result as string) || (initialData?.expectedResult as string) || '',
            actual_result: (initialData?.actual_result as string) || '',
            task_number: (initialData?.task_number as string) || '',
            is_regression: (initialData?.is_regression as boolean) || false,
            execution_count: initialData?.execution_count != null ? Number(initialData.execution_count) : undefined,
            note: (initialData?.note as string) || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                artifact_type: 'test_case' as const,
                project_id: projectId,
                common: {
                    title: data.title,
                    description: data.description || undefined,
                    status: data.status,
                    assigned_to: data.assigned_to || null,
                    priority: data.priority,
                },
                fields: {
                    service_name: data.service_name || undefined,
                    preconditions: data.preconditions || undefined,
                    test_steps: data.test_steps,
                    expected_result: data.expected_result,
                    actual_result: data.actual_result || undefined,
                    task_number: data.task_number || undefined,
                    is_regression: data.is_regression,
                    execution_count: data.execution_count,
                    note: data.note || undefined,
                },
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, payload);
                router.push(`/test-cases/${artifactId}`);
            } else {
                const result = await tuleapApi.createUnified(payload);
                router.push(`/test-cases/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save test case');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit) as any} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <div className="md:col-span-2">
                    <Input
                        label="Title"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="Enter test case title"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Status"
                    options={[
                        { value: 'active', label: 'Active' },
                        { value: 'draft', label: 'Draft' },
                        { value: 'deprecated', label: 'Deprecated' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Priority"
                    options={[
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Assigned To"
                    {...register('assigned_to')}
                    placeholder="email@example.com"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Details">
                <Input
                    label="Service Name"
                    {...register('service_name')}
                    placeholder="e.g. Auth Service"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Task Number"
                    {...register('task_number')}
                    placeholder="e.g. TSK-001"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Preconditions"
                        {...register('preconditions')}
                        placeholder="Prerequisites for this test..."
                    />
                </div>
            </FormSection>

            <FormSection title="Test Definition">
                <div className="md:col-span-2">
                    <Textarea
                        label="Test Steps"
                        {...register('test_steps')}
                        error={errors.test_steps?.message}
                        placeholder="Describe the test steps..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Expected Result"
                        {...register('expected_result')}
                        error={errors.expected_result?.message}
                        placeholder="Describe the expected result..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Actual Result"
                        {...register('actual_result')}
                        placeholder="Describe the actual result (if executed)..."
                    />
                </div>
            </FormSection>

            <FormSection title="Progress">
                <div className="flex items-center gap-3 h-10">
                    <input
                        type="checkbox"
                        {...register('is_regression')}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Is Regression</label>
                </div>
                <Input
                    label="Execution Count"
                    type="number"
                    {...register('execution_count')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Note"
                        {...register('note')}
                        placeholder="Additional notes..."
                    />
                </div>
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Test Case'}
                </Button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Verify web build**

Run: `cd apps/web && npm run build 2>&1 | tail -15`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/test-cases/TestCaseForm.tsx
git commit -m "feat: redesign TestCaseForm with section-based layout and all unified fields"
```

---

### Task 6: Redesign TaskForm

**Files:**
- Modify: `apps/web/src/components/tasks/TaskForm.tsx`

The TaskForm is different — it uses `fetchApi('/tasks')` directly, not `tuleapApi`. Tasks are QC-Manager entities first (with optional Tuleap sync). Keep `fetchApi` but add the new unified fields (team, parent_story_id, initial_estimate, final_estimate, actual_effort, blocked_reason) and use the shared components.

**Section layout:**

| Section | Fields |
|---|---|
| **Task Details** | Task ID (auto), Task Name, Status, Priority |
| **Description** | Description/Notes, Team, Blocked Reason |
| **Assignment & Planning** | Project, Resource 1, Resource 2, Estimates, Dates |
| **Links** | Parent Story ID |

- [ ] **Step 1: Rewrite TaskForm.tsx**

Key changes from current:
- Add fields: `team`, `parent_story_id`, `initial_estimate`, `final_estimate`, `actual_effort`, `blocked_reason`
- Use `FormSection`, `Textarea`, `ErrorBanner` shared components
- Keep `fetchApi('/tasks')` for API calls
- Keep existing resource/project props and logic

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { Project, Resource, Task } from '@/types';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';

const taskSchema = z.object({
    task_id: z.string().regex(/^TSK-[0-9]{3}$/, 'Format: TSK-XXX'),
    project_id: z.string().uuid(),
    task_name: z.string().min(1, 'Required'),
    status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']),
    priority: z.enum(['High', 'Medium', 'Low']).optional(),
    description: z.string().optional().default(''),
    team: z.string().optional().default(''),
    blocked_reason: z.string().optional().default(''),
    resource1_uuid: z.string().uuid(),
    resource2_uuid: z.string().optional().or(z.literal('')),
    initial_estimate: z.coerce.number().nullable().optional(),
    final_estimate: z.coerce.number().nullable().optional(),
    actual_effort: z.coerce.number().nullable().optional(),
    estimate_days: z.coerce.number().positive().optional(),
    r1_estimate_hrs: z.coerce.number().min(0).optional(),
    r1_actual_hrs: z.coerce.number().min(0).optional(),
    r2_estimate_hrs: z.coerce.number().min(0).optional(),
    r2_actual_hrs: z.coerce.number().min(0).optional(),
    expected_start_date: z.string().optional().or(z.literal('')),
    actual_start_date: z.string().optional().or(z.literal('')),
    deadline: z.string().optional().or(z.literal('')),
    completed_date: z.string().optional().or(z.literal('')),
    parent_story_id: z.string().optional().default(''),
});

type FormData = z.infer<typeof taskSchema>;

interface TaskFormProps {
    initialData?: Task;
    projects: Project[];
    resources: Resource[];
    isEdit?: boolean;
}

function normalizePriority(priority?: string): 'High' | 'Medium' | 'Low' {
    if (!priority) return 'Medium';
    const lower = priority.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'low') return 'Low';
    return 'Medium';
}

export function TaskForm({ initialData, projects, resources, isEdit }: TaskFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
        resolver: zodResolver(taskSchema) as any,
        defaultValues: {
            task_id: initialData?.task_id || `TSK-${Math.floor(Math.random() * 900) + 100}`,
            project_id: initialData?.project_id || '',
            task_name: initialData?.task_name || '',
            status: (initialData?.status as any) || 'Backlog',
            priority: normalizePriority(initialData?.priority),
            description: initialData?.notes || initialData?.description || '',
            team: (initialData as any)?.team || '',
            blocked_reason: (initialData as any)?.blocked_reason || '',
            resource1_uuid: initialData?.resource1_uuid || initialData?.resource1_id || '',
            resource2_uuid: initialData?.resource2_uuid || initialData?.resource2_id || '',
            initial_estimate: (initialData as any)?.initial_estimate != null ? Number((initialData as any).initial_estimate) : null,
            final_estimate: (initialData as any)?.final_estimate != null ? Number((initialData as any).final_estimate) : null,
            actual_effort: (initialData as any)?.actual_effort != null ? Number((initialData as any).actual_effort) : null,
            estimate_days: initialData?.estimate_days ? Number(initialData.estimate_days) : undefined,
            r1_estimate_hrs: initialData?.r1_estimate_hrs ? Number(initialData.r1_estimate_hrs) : (initialData?.estimate_days ? Number(initialData.estimate_days) * 8 : undefined),
            r1_actual_hrs: initialData?.r1_actual_hrs ? Number(initialData.r1_actual_hrs) : 0,
            r2_estimate_hrs: initialData?.r2_estimate_hrs ? Number(initialData.r2_estimate_hrs) : 0,
            r2_actual_hrs: initialData?.r2_actual_hrs ? Number(initialData.r2_actual_hrs) : 0,
            expected_start_date: initialData?.expected_start_date ? initialData.expected_start_date.split('T')[0] : '',
            actual_start_date: initialData?.actual_start_date ? initialData.actual_start_date.split('T')[0] : '',
            deadline: initialData?.deadline ? initialData.deadline.split('T')[0] : '',
            completed_date: initialData?.completed_date ? initialData.completed_date.split('T')[0] : '',
            parent_story_id: (initialData as any)?.parent_story_id?.toString() || '',
        },
    });

    const resource1Value = watch('resource1_uuid');
    const resource2Value = watch('resource2_uuid');

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                ...data,
                resource1_uuid: data.resource1_uuid || undefined,
                resource2_uuid: data.resource2_uuid || undefined,
                expected_start_date: data.expected_start_date || undefined,
                actual_start_date: data.actual_start_date || undefined,
                deadline: data.deadline || undefined,
                completed_date: data.completed_date || undefined,
                estimate_days: data.estimate_days ? Number(data.estimate_days) : undefined,
                r1_estimate_hrs: data.r1_estimate_hrs ? Number(data.r1_estimate_hrs) : (data.estimate_days ? Number(data.estimate_days) * 8 : 0),
                r1_actual_hrs: data.r1_actual_hrs ? Number(data.r1_actual_hrs) : 0,
                r2_estimate_hrs: data.resource2_uuid && data.r2_estimate_hrs ? Number(data.r2_estimate_hrs) : 0,
                r2_actual_hrs: data.resource2_uuid && data.r2_actual_hrs ? Number(data.r2_actual_hrs) : 0,
                initial_estimate: data.initial_estimate ?? undefined,
                final_estimate: data.final_estimate ?? undefined,
                actual_effort: data.actual_effort ?? undefined,
                parent_story_id: data.parent_story_id ? parseInt(data.parent_story_id, 10) || undefined : undefined,
            };

            if (isEdit && initialData) {
                await fetchApi(`/tasks/${initialData.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
            } else {
                await fetchApi('/tasks', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            router.push('/');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save task');
        } finally {
            setIsSubmitting(false);
        }
    };

    const projectOptions = projects.map(p => ({ value: p.id, label: `${p.project_id} - ${p.project_name || 'Unnamed'}` }));
    const activeResources = resources.filter(r => r.is_active !== false);
    const resourceOptions = activeResources.map(r => {
        const util = r.utilization_pct != null ? ` (${Number(r.utilization_pct).toFixed(0)}% utilized)` : '';
        return { value: r.id, label: `${r.resource_name || r.name || 'Unnamed'}${util}` };
    });
    const resource2Options = [
        { value: '', label: '-- None --' },
        ...activeResources.filter(r => r.id !== resource1Value).map(r => {
            const util = r.utilization_pct != null ? ` (${Number(r.utilization_pct).toFixed(0)}% utilized)` : '';
            return { value: r.id, label: `${r.resource_name || r.name || 'Unnamed'}${util}` };
        }),
    ];

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="Task Details">
                <Input
                    label="Task ID"
                    {...register('task_id')}
                    error={errors.task_id?.message}
                    placeholder="TSK-001"
                    disabled
                    className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                />
                <Select
                    label="Status"
                    options={[
                        { value: 'Backlog', label: 'Backlog' },
                        { value: 'In Progress', label: 'In Progress' },
                        { value: 'Done', label: 'Done' },
                        { value: 'Cancelled', label: 'Cancelled' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Input
                        label="Task Name"
                        {...register('task_name')}
                        error={errors.task_name?.message}
                        placeholder="e.g. Implement Authorization Logic"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Priority"
                    options={[
                        { value: 'High', label: 'High' },
                        { value: 'Medium', label: 'Medium' },
                        { value: 'Low', label: 'Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description">
                <div className="md:col-span-2">
                    <Textarea
                        label="Description / Notes"
                        {...register('description')}
                        placeholder="Add detailed notes about this task..."
                    />
                </div>
                <Input
                    label="Team"
                    {...register('team')}
                    placeholder="e.g. QA-Team"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Blocked Reason"
                        {...register('blocked_reason')}
                        placeholder="Reason this task is blocked (if applicable)..."
                    />
                </div>
            </FormSection>

            <FormSection title="Assignment & Planning">
                <Select
                    label="Project"
                    options={projectOptions}
                    {...register('project_id')}
                    error={errors.project_id?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Estimate (Days)"
                    type="number"
                    step="0.5"
                    {...register('estimate_days')}
                    error={errors.estimate_days?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Primary Resource"
                    options={resourceOptions}
                    {...register('resource1_uuid')}
                    error={errors.resource1_uuid?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Secondary Resource (Optional)"
                    options={resource2Options}
                    {...register('resource2_uuid')}
                    error={errors.resource2_uuid?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Initial Estimate (hrs)"
                    type="number"
                    step="0.5"
                    {...register('initial_estimate')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Final Estimate (hrs)"
                    type="number"
                    step="0.5"
                    {...register('final_estimate')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Est. Hours (R1)"
                    type="number"
                    step="0.5"
                    placeholder="8 hours per day"
                    {...register('r1_estimate_hrs')}
                    error={errors.r1_estimate_hrs?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Actual Hours (R1)"
                    type="number"
                    step="0.5"
                    placeholder="Hours worked"
                    {...register('r1_actual_hrs')}
                    error={errors.r1_actual_hrs?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                {resource2Value && (
                    <>
                        <Input
                            label="Est. Hours (R2)"
                            type="number"
                            step="0.5"
                            placeholder="Hours for R2"
                            {...register('r2_estimate_hrs')}
                            error={errors.r2_estimate_hrs?.message}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                        <Input
                            label="Actual Hours (R2)"
                            type="number"
                            step="0.5"
                            placeholder="Hours worked by R2"
                            {...register('r2_actual_hrs')}
                            error={errors.r2_actual_hrs?.message}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </>
                )}
                <Input
                    label="Actual Effort (hrs)"
                    type="number"
                    step="0.5"
                    {...register('actual_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Expected Start Date"
                    type="date"
                    {...register('expected_start_date')}
                    error={errors.expected_start_date?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Actual Start Date"
                    type="date"
                    {...register('actual_start_date')}
                    error={errors.actual_start_date?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Deadline"
                    type="date"
                    {...register('deadline')}
                    error={errors.deadline?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Completed Date"
                    type="date"
                    {...register('completed_date')}
                    error={errors.completed_date?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Links">
                <Input
                    label="Parent Story ID"
                    {...register('parent_story_id')}
                    placeholder="e.g. 140"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-36 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Task'}
                </Button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Verify web build**

Run: `cd apps/web && npm run build 2>&1 | tail -15`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/tasks/TaskForm.tsx
git commit -m "feat: redesign TaskForm with section-based layout and unified fields"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run all API tests**

Run: `cd apps/api && npm test -- --testPathPattern="tuleap" 2>&1 | tail -20`
Expected: All 83+ Tuleap tests pass

- [ ] **Step 2: Run full web build**

Run: `cd apps/web && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Verify no regressions in existing page imports**

Check that pages importing the redesigned forms still compile:
- `apps/web/app/bugs/create/page.tsx` — imports `BugForm`
- `apps/web/app/bugs/[id]/edit/page.tsx` — imports `BugForm`
- `apps/web/app/user-stories/create/page.tsx` — imports `UserStoryForm` (if exists)
- `apps/web/app/test-cases/create/page.tsx` — imports `TestCaseForm` (if exists)

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors

- [ ] **Step 4: Final commit (if any fixups needed)**

Only if there are fixups from verification.
