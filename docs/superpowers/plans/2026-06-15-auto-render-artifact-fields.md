# Auto-render All Artifact Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every artifact detail page (bug, story, task, test case, test suite, test run) automatically display all populated fields the API returns, instead of a hardcoded subset.

**Architecture:** A pure helper module (`src/lib/detailFields.ts`) turns any record object into label/value rows — humanizing keys, formatting values, and hiding internal plumbing (UUIDs, `_can`, sync internals, empty fields). A thin `<AutoDetailsCard>` component renders those rows using the existing `DetailCard` primitives. Each detail page drops the card into its right column with a small per-page `exclude` list for fields already shown in the header, body cards, or bespoke widgets.

**Tech Stack:** TypeScript, Next.js 14 (App Router), React, Tailwind. New: **vitest** for unit-testing the pure helper (apps/web currently has only Playwright e2e).

**Spec:** `docs/superpowers/specs/2026-06-15-auto-render-artifact-fields-design.md`

**Branch:** `feat/auto-render-artifact-fields` (already created; spec already committed there).

---

## File Structure

- **Create** `apps/web/vitest.config.ts` — vitest config (node env, `@` alias).
- **Create** `apps/web/src/lib/detailFields.ts` — pure functions: `humanizeLabel`, `isUuid`, `formatFieldValue`, `buildAutoDetailFields`, plus `GLOBAL_FIELD_DENYLIST`.
- **Create** `apps/web/src/lib/detailFields.test.ts` — unit tests for the above.
- **Create** `apps/web/src/components/shared/AutoDetailsCard.tsx` — render component.
- **Modify** `apps/web/package.json` — add `vitest` devDependency + `test` script.
- **Modify** the six detail pages to use `<AutoDetailsCard>`:
  - `apps/web/app/work/stories/[id]/page.tsx`
  - `apps/web/app/work/bugs/[id]/page.tsx`
  - `apps/web/app/test/cases/[id]/page.tsx`
  - `apps/web/app/test/suites/[id]/page.tsx`
  - `apps/web/app/work/tasks/[id]/page.tsx`
  - `apps/web/app/test/runs/[id]/page.tsx`

All commands below assume the working directory is `/root/QC-Manager/apps/web` unless stated otherwise.

---

## Task 1: Set up vitest

**Files:**
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install vitest**

Run (in `apps/web`): `npm install -D vitest`
Expected: `vitest` added to `devDependencies`, install completes with no errors.

- [ ] **Step 2: Create the vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        passWithNoTests: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
```

- [ ] **Step 3: Add the test script**

In `apps/web/package.json`, add to `"scripts"` (keep existing scripts):

```json
        "test": "vitest run",
        "test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs**

Run: `npm test`
Expected: exits 0 with a "no test files found, passing" style message (passWithNoTests).

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/vitest.config.ts apps/web/package.json apps/web/package-lock.json
git commit -m "Add vitest for unit-testing web helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `humanizeLabel`

**Files:**
- Create: `apps/web/src/lib/detailFields.ts`
- Test: `apps/web/src/lib/detailFields.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/detailFields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { humanizeLabel } from './detailFields';

describe('humanizeLabel', () => {
    it('title-cases snake_case keys', () => {
        expect(humanizeLabel('story_points')).toBe('Story Points');
        expect(humanizeLabel('submitted_by_resource_name')).toBe('Submitted By Resource Name');
    });

    it('uppercases known acronyms', () => {
        expect(humanizeLabel('tuleap_artifact_id')).toBe('Tuleap Artifact ID');
        expect(humanizeLabel('tuleap_url')).toBe('Tuleap URL');
        expect(humanizeLabel('qc_verification_notes')).toBe('QC Verification Notes');
        expect(humanizeLabel('cc')).toBe('CC');
    });

    it('handles single words', () => {
        expect(humanizeLabel('priority')).toBe('Priority');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/detailFields.test.ts`
Expected: FAIL — cannot import `humanizeLabel` (module/file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/detailFields.ts`:

```ts
const ACRONYMS: Record<string, string> = {
    id: 'ID',
    url: 'URL',
    cc: 'CC',
    qc: 'QC',
    api: 'API',
    ui: 'UI',
    tuleap: 'Tuleap',
};

export function humanizeLabel(key: string): string {
    return key
        .split('_')
        .filter(Boolean)
        .map(word => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/detailFields.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/lib/detailFields.ts apps/web/src/lib/detailFields.test.ts
git commit -m "Add humanizeLabel helper for detail fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `isUuid` and `formatFieldValue`

**Files:**
- Modify: `apps/web/src/lib/detailFields.ts`
- Test: `apps/web/src/lib/detailFields.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/detailFields.test.ts`:

```ts
import { isUuid, formatFieldValue } from './detailFields';

describe('isUuid', () => {
    it('detects UUID strings', () => {
        expect(isUuid('7f3a9c2e-1b2c-4d5e-8f90-1a2b3c4d5e6f')).toBe(true);
    });
    it('rejects non-UUIDs', () => {
        expect(isUuid('BUG-123')).toBe(false);
        expect(isUuid('140')).toBe(false);
        expect(isUuid(42)).toBe(false);
        expect(isUuid(null)).toBe(false);
    });
});

describe('formatFieldValue', () => {
    it('skips empty values', () => {
        expect(formatFieldValue(null)).toBeNull();
        expect(formatFieldValue(undefined)).toBeNull();
        expect(formatFieldValue('')).toBeNull();
        expect(formatFieldValue('   ')).toBeNull();
    });
    it('formats booleans', () => {
        expect(formatFieldValue(true)).toBe('Yes');
        expect(formatFieldValue(false)).toBe('No');
    });
    it('joins primitive arrays and skips empty/object arrays', () => {
        expect(formatFieldValue(['a', 'b'])).toBe('a, b');
        expect(formatFieldValue([])).toBeNull();
        expect(formatFieldValue([{ x: 1 }])).toBeNull();
    });
    it('stringifies numbers including zero', () => {
        expect(formatFieldValue(42)).toBe('42');
        expect(formatFieldValue(0)).toBe('0');
    });
    it('formats ISO date strings', () => {
        expect(formatFieldValue('2026-06-14')).toContain('2026');
        expect(formatFieldValue('2026-06-14T10:30:00Z')).toContain('2026');
    });
    it('strips HTML from strings', () => {
        expect(formatFieldValue('<b>hi</b>')).toBe('hi');
    });
    it('skips plain objects', () => {
        expect(formatFieldValue({ a: 1 })).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/detailFields.test.ts`
Expected: FAIL — `isUuid` and `formatFieldValue` are not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the top of `apps/web/src/lib/detailFields.ts` (after the `ACRONYMS` const), and the functions below:

```ts
import { stripHtml } from '@/lib/stripHtml';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

export function isUuid(value: unknown): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function formatFieldValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'boolean') return value ? 'Yes' : 'No';

    if (Array.isArray(value)) {
        const primitives = value.filter(
            v => v !== null && v !== undefined && typeof v !== 'object',
        );
        if (primitives.length === 0) return null;
        return primitives.map(String).join(', ');
    }

    if (typeof value === 'object') return null;

    if (typeof value === 'number') return String(value);

    const str = String(value);
    if (str.trim() === '') return null;
    if (ISO_DATE_RE.test(str)) {
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return stripHtml(str);
}
```

> Place the `import { stripHtml }` line at the very top of the file (above `ACRONYMS`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/detailFields.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/lib/detailFields.ts apps/web/src/lib/detailFields.test.ts
git commit -m "Add isUuid and formatFieldValue helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `buildAutoDetailFields`

**Files:**
- Modify: `apps/web/src/lib/detailFields.ts`
- Test: `apps/web/src/lib/detailFields.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/detailFields.test.ts`:

```ts
import { buildAutoDetailFields } from './detailFields';

describe('buildAutoDetailFields', () => {
    it('skips denylisted keys', () => {
        const rows = buildAutoDetailFields({ _can: {}, deleted_at: 'x', title: 'T' });
        expect(rows).toEqual([{ key: 'title', label: 'Title', value: 'T' }]);
    });

    it('hides UUID values', () => {
        const rows = buildAutoDetailFields({
            id: '7f3a9c2e-1b2c-4d5e-8f90-1a2b3c4d5e6f',
            name: 'x',
        });
        expect(rows.map(r => r.key)).toEqual(['name']);
    });

    it('hides empty values', () => {
        const rows = buildAutoDetailFields({ a: null, b: '', c: 'v' });
        expect(rows.map(r => r.key)).toEqual(['c']);
    });

    it('honours the exclude list', () => {
        const rows = buildAutoDetailFields({ a: '1', b: '2' }, { exclude: ['a'] });
        expect(rows.map(r => r.key)).toEqual(['b']);
    });

    it('applies label overrides', () => {
        const rows = buildAutoDetailFields({ a: '1' }, { labels: { a: 'Alpha' } });
        expect(rows[0].label).toBe('Alpha');
    });

    it('applies value formatters, skipping null results', () => {
        const formatters = { effort: (v: unknown) => (v == null ? null : `${v}h`) };
        expect(buildAutoDetailFields({ effort: 5 }, { formatters })[0].value).toBe('5h');
        expect(buildAutoDetailFields({ effort: null }, { formatters })).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/detailFields.test.ts`
Expected: FAIL — `buildAutoDetailFields` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/web/src/lib/detailFields.ts`:

```ts
export const GLOBAL_FIELD_DENYLIST = new Set<string>([
    '_can',
    'deleted_at',
    'embedding',
    'tsv',
    'search_vector',
    'sync_status',
    'last_sync_attempted_at',
    'last_sync_error',
    'last_sync_at',
]);

export interface AutoDetailField {
    key: string;
    label: string;
    value: string;
}

export interface BuildAutoDetailFieldsOptions {
    exclude?: string[];
    labels?: Record<string, string>;
    formatters?: Record<string, (value: unknown) => string | null>;
}

export function buildAutoDetailFields(
    record: Record<string, unknown> | null | undefined,
    options: BuildAutoDetailFieldsOptions = {},
): AutoDetailField[] {
    if (!record) return [];
    const exclude = new Set(options.exclude ?? []);
    const labels = options.labels ?? {};
    const formatters = options.formatters ?? {};

    const rows: AutoDetailField[] = [];
    for (const [key, raw] of Object.entries(record)) {
        if (GLOBAL_FIELD_DENYLIST.has(key)) continue;
        if (exclude.has(key)) continue;
        if (isUuid(raw)) continue;

        const formatted = formatters[key] ? formatters[key](raw) : formatFieldValue(raw);
        if (formatted === null || formatted === '') continue;

        rows.push({ key, label: labels[key] ?? humanizeLabel(key), value: formatted });
    }
    return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in `detailFields.test.ts` green.

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/lib/detailFields.ts apps/web/src/lib/detailFields.test.ts
git commit -m "Add buildAutoDetailFields with denylist, UUID and exclude filtering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `<AutoDetailsCard>` component

**Files:**
- Create: `apps/web/src/components/shared/AutoDetailsCard.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/shared/AutoDetailsCard.tsx`:

```tsx
import React from 'react';
import { QCCard, SectionLabel, DetailRow } from '@/components/shared/DetailCard';
import {
    buildAutoDetailFields,
    type BuildAutoDetailFieldsOptions,
} from '@/lib/detailFields';

interface AutoDetailsCardProps extends BuildAutoDetailFieldsOptions {
    record: Record<string, unknown> | null | undefined;
    title?: string;
    className?: string;
}

/**
 * Renders every populated, non-internal field of `record` as a label/value list.
 * Pass `exclude` for fields already shown in the header, body cards, or bespoke
 * widgets. Renders nothing when there are no qualifying fields.
 */
export function AutoDetailsCard({
    record,
    title = 'Details',
    className,
    exclude,
    labels,
    formatters,
}: AutoDetailsCardProps) {
    const fields = buildAutoDetailFields(record, { exclude, labels, formatters });
    if (fields.length === 0) return null;

    return (
        <QCCard className={className}>
            <SectionLabel>{title}</SectionLabel>
            <div className="space-y-0">
                {fields.map(({ key, label, value }) => (
                    <DetailRow key={key} label={label} value={value} />
                ))}
            </div>
        </QCCard>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the project may have pre-existing unrelated errors; there must be none referencing `AutoDetailsCard.tsx` or `detailFields.ts`).

- [ ] **Step 3: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/components/shared/AutoDetailsCard.tsx
git commit -m "Add AutoDetailsCard component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire the Story page (biggest win — no Details card today)

**Files:**
- Modify: `apps/web/app/work/stories/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/app/work/stories/[id]/page.tsx`, find:

```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
```

Add immediately below it:

```tsx
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
```

- [ ] **Step 2: Add the card to the right column**

Find (the right column, currently only a SyncPanel):

```tsx
                {/* Right column (1/3) */}
                <div className="space-y-5">
                    <SyncPanel
                        status={story.sync_status}
                        lastAttemptedAt={story.last_sync_attempted_at}
                        error={story.last_sync_error}
                        tuleapUrl={story.tuleap_url}
                        artifactType="user_story"
                        artifactId={story.id}
                        syncFn={(id) => userStoriesApi.sync(id)}
                    />
                </div>
```

Replace with:

```tsx
                {/* Right column (1/3) */}
                <div className="space-y-5">
                    <SyncPanel
                        status={story.sync_status}
                        lastAttemptedAt={story.last_sync_attempted_at}
                        error={story.last_sync_error}
                        tuleapUrl={story.tuleap_url}
                        artifactType="user_story"
                        artifactId={story.id}
                        syncFn={(id) => userStoriesApi.sync(id)}
                    />

                    <AutoDetailsCard
                        record={story}
                        exclude={['title', 'status', 'description', 'acceptance_criteria', 'tuleap_url']}
                    />
                </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 4: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/work/stories/[id]/page.tsx
git commit -m "Auto-render all fields on user story detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire the Bug page

**Files:**
- Modify: `apps/web/app/work/bugs/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/app/work/bugs/[id]/page.tsx`, find:

```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon, DetailRow } from '@/components/shared/DetailCard';
```

Add immediately below it:

```tsx
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
```

- [ ] **Step 2: Remove the hardcoded `metaFields` array**

Find and delete this whole block (it starts right after the `bodyFields` block):

```tsx
    const metaFields = [
        { label: 'Severity', value: bug.severity },
        { label: 'Priority', value: bug.priority },
        { label: 'Source', value: bug.source === 'TEST_CASE' ? 'Test Case' : 'Exploratory' },
        { label: 'Environment', value: bug.environment },
        { label: 'Service', value: bug.service_name },
        { label: 'Component', value: bug.component },
        { label: 'Type', value: bug.bug_type },
        { label: 'Initial Effort', value: bug.initial_effort != null ? `${bug.initial_effort}h` : undefined },
        { label: 'Remaining Effort', value: bug.remaining_effort != null ? `${bug.remaining_effort}h` : undefined },
        { label: 'CC', value: bug.cc?.length ? bug.cc.join(', ') : undefined },
        { label: 'Assigned To', value: bug.assigned_to },
        { label: 'Reported By', value: bug.reported_by },
        { label: 'Updated By', value: bug.updated_by },
        { label: 'Project', value: bug.project_name },
        { label: 'Reported', value: bug.reported_date ? new Date(bug.reported_date).toLocaleDateString() : undefined },
        { label: 'Created', value: bug.created_at ? new Date(bug.created_at).toLocaleDateString() : undefined },
        { label: 'Last Updated', value: bug.updated_at ? new Date(bug.updated_at).toLocaleDateString() : undefined },
    ].filter(f => f.value);
```

- [ ] **Step 3: Replace the Details card with AutoDetailsCard**

Find:

```tsx
                    <QCCard>
                        <SectionLabel>Details</SectionLabel>
                        <div className="space-y-0">
                            {metaFields.map(({ label, value }) => (
                                <DetailRow key={label} label={label} value={<span className="capitalize">{value}</span>} />
                            ))}
                        </div>
                    </QCCard>
```

Replace with:

```tsx
                    <AutoDetailsCard
                        record={bug}
                        exclude={[
                            'title',
                            'status',
                            'bug_id',
                            'description',
                            'dev_fix_description',
                            'qc_verification_notes',
                            'tuleap_url',
                        ]}
                        labels={{
                            service_name: 'Service',
                            bug_type: 'Type',
                            reported_date: 'Reported',
                            created_at: 'Created',
                            updated_at: 'Last Updated',
                            project_name: 'Project',
                        }}
                        formatters={{
                            source: (v) =>
                                v === 'TEST_CASE' ? 'Test Case' : v === 'EXPLORATORY' ? 'Exploratory' : v ? String(v) : null,
                            initial_effort: (v) => (v == null ? null : `${v}h`),
                            remaining_effort: (v) => (v == null ? null : `${v}h`),
                        }}
                    />
```

- [ ] **Step 4: Remove now-unused imports**

`QCCard`, `SectionLabel`, and `DetailRow` are still used for the body cards (`QCCard`, `SectionLabel`) — but `DetailRow` is no longer used on this page. Update the DetailCard import to drop `DetailRow`:

Find:
```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon, DetailRow } from '@/components/shared/DetailCard';
```
Replace with:
```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file (in particular, no "DetailRow is declared but never used" or "metaFields not found").

- [ ] **Step 6: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/work/bugs/[id]/page.tsx
git commit -m "Auto-render all fields on bug detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Wire the Test Case page

**Files:**
- Modify: `apps/web/app/test/cases/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/app/test/cases/[id]/page.tsx`, find:

```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon, DetailRow } from '@/components/shared/DetailCard';
```

Add immediately below it:

```tsx
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
```

- [ ] **Step 2: Replace the Details card body, keep the Tags block**

Find:

```tsx
                    <QCCard>
                        <SectionLabel>Details</SectionLabel>
                        <div className="space-y-0">
                            <DetailRow label="Category" value={testCase.category ? <span className="capitalize">{testCase.category}</span> : null} />
                            <DetailRow label="Suite Title" value={testCase.suite_title} />
                            <DetailRow label="Component" value={testCase.component} />
                            <DetailRow label="Assigned To" value={testCase.assigned_to_name || 'Unassigned'} />
                            <DetailRow label="Est. Duration" value={testCase.estimated_duration_minutes ? `${testCase.estimated_duration_minutes} min` : null} />
                            <DetailRow label="Requirement" value={testCase.linked_requirement_id} />
                            {testCase.tuleap_artifact_id && (
                                <DetailRow
                                    label="Tuleap"
                                    value={
                                        <a href={testCase.tuleap_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                            Artifact #{testCase.tuleap_artifact_id}
                                        </a>
                                    }
                                />
                            )}
                        </div>
                        {testCase.tags && testCase.tags.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Tags</div>
                                <div className="flex flex-wrap gap-1">
                                    {testCase.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                                </div>
                            </div>
                        )}
                    </QCCard>
```

Replace with:

```tsx
                    <AutoDetailsCard
                        record={testCase}
                        exclude={[
                            'title',
                            'status',
                            'test_case_id',
                            'description',
                            'preconditions',
                            'test_steps',
                            'expected_result',
                            'tags',
                            'tuleap_url',
                        ]}
                        labels={{
                            assigned_to_name: 'Assigned To',
                            estimated_duration_minutes: 'Est. Duration',
                            linked_requirement_id: 'Requirement',
                            suite_title: 'Suite Title',
                        }}
                        formatters={{
                            estimated_duration_minutes: (v) => (v == null ? null : `${v} min`),
                        }}
                    />

                    {testCase.tags && testCase.tags.length > 0 && (
                        <QCCard>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Tags</div>
                            <div className="flex flex-wrap gap-1">
                                {testCase.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                            </div>
                        </QCCard>
                    )}
```

- [ ] **Step 3: Remove the now-unused `DetailRow` import**

`QCCard` and `SectionLabel` are still used (body cards, execution history, tags card). `DetailRow` is no longer used. Update:

Find:
```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon, DetailRow } from '@/components/shared/DetailCard';
```
Replace with:
```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/test/cases/[id]/page.tsx
git commit -m "Auto-render all fields on test case detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Wire the Test Suite page

**Files:**
- Modify: `apps/web/app/test/suites/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/app/test/suites/[id]/page.tsx`, find:

```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon, DetailRow } from '@/components/shared/DetailCard';
```

Add immediately below it:

```tsx
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
```

- [ ] **Step 2: Replace the Overview card with AutoDetailsCard**

Find:

```tsx
                    <QCCard>
                        <SectionLabel>Overview</SectionLabel>
                        <div className="space-y-0">
                            <DetailRow label="Cases" value={String(suite.test_case_count ?? testCases.length)} />
                            {passRate !== null && <DetailRow label="Pass Rate" value={`${passRate}%`} valueClass={passRateClass} />}
                            <DetailRow label="Created By" value={suite.created_by_name} />
                            <DetailRow label="Created" value={formatDistanceToNow(new Date(suite.created_at), { addSuffix: true })} />
                            <DetailRow label="Last Updated" value={formatDistanceToNow(new Date(suite.updated_at), { addSuffix: true })} />
                        </div>
                    </QCCard>
```

Replace with:

```tsx
                    <AutoDetailsCard
                        record={suite}
                        title="Overview"
                        exclude={['name', 'status', 'suite_id', 'description', 'test_cases']}
                        labels={{
                            test_case_count: 'Cases',
                            last_run_pass_rate: 'Pass Rate',
                            created_by_name: 'Created By',
                            created_at: 'Created',
                            updated_at: 'Last Updated',
                        }}
                        formatters={{
                            last_run_pass_rate: (v) => (v == null ? null : `${Math.round(Number(v) * 100)}%`),
                        }}
                    />
```

- [ ] **Step 3: Remove now-unused symbols**

`DetailRow` is no longer used. The `passRate` / `passRateClass` consts (lines ~197-202) were only used by the Overview card — verify they're now unused and remove them too.

Find and remove:
```tsx
    const passRate = suite.last_run_pass_rate != null ? Math.round(suite.last_run_pass_rate * 100) : null;
    const passRateClass = passRate == null
        ? undefined
        : passRate >= 80 ? 'text-emerald-600 dark:text-emerald-400'
        : passRate >= 50 ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';
```

Update the import:
Find:
```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon, DetailRow } from '@/components/shared/DetailCard';
```
Replace with:
```tsx
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
```

> Note: `formatDistanceToNow` is still imported and may now be unused on this page. After removing the Overview card, run the type-check; if TS/lint flags `formatDistanceToNow` as unused, remove it from the `date-fns` import line. (`SectionLabel` is still used by the Quick Actions card; keep it.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/test/suites/[id]/page.tsx
git commit -m "Auto-render all fields on test suite detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Wire the Task page (keep visual widgets, add auto-list)

**Files:**
- Modify: `apps/web/app/work/tasks/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/app/work/tasks/[id]/page.tsx`, find:

```tsx
import { QCCard, SectionLabel } from '@/components/shared/DetailCard';
```

Add immediately below it:

```tsx
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
```

- [ ] **Step 2: Add the auto-list after the Quick Actions card**

The Quick Actions card is the last card in the right column. Its final lines (the disabled "Export task" button, then the card and right-column close) are a unique anchor.

Find:

```tsx
                                Export task
                            </button>
                        </div>
                    </QCCard>
                </div>
```

Replace with (insert `<AutoDetailsCard>` between the Quick Actions card close and the right-column `</div>`):

```tsx
                                Export task
                            </button>
                        </div>
                    </QCCard>

                    <AutoDetailsCard
                        record={task}
                        title="More Details"
                        exclude={[
                            'task_name',
                            'status',
                            'task_id',
                            'project_name',
                            'description',
                            'notes',
                            'total_est_hrs',
                            'total_actual_hrs',
                            'overall_completion_pct',
                            'resource1_name',
                            'resource2_name',
                            'expected_start_date',
                            'actual_start_date',
                            'deadline',
                            'completed_date',
                            'tuleap_url',
                        ]}
                    />
                </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 4: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/work/tasks/[id]/page.tsx
git commit -m "Auto-render remaining fields on task detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Wire the Test Run page

**Files:**
- Modify: `apps/web/app/test/runs/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/app/test/runs/[id]/page.tsx`, find:

```tsx
import { formatDistanceToNow, format } from 'date-fns';
```

Add immediately below it:

```tsx
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
```

- [ ] **Step 2: Insert the auto-list after the meta info bar**

Find the meta info bar block (ends just before the bulk-update block):

```tsx
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-4">
                {run.project_name && <span>Project: <strong className="text-slate-900 dark:text-white">{run.project_name}</strong></span>}
                {run.created_by_name && <span>Created by: <strong className="text-slate-900 dark:text-white">{run.created_by_name}</strong></span>}
                <span>Started: <strong className="text-slate-900 dark:text-white">{formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</strong></span>
                {run.completed_at && <span>Completed: <strong className="text-slate-900 dark:text-white">{formatDistanceToNow(new Date(run.completed_at), { addSuffix: true })}</strong></span>}
                {run.suite_id && (
                    <span>Suite: <Link href={`/test/suites/${run.suite_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">View Suite</Link></span>
                )}
            </div>
```

Add immediately after that closing `</div>`:

```tsx
            <div className="mb-4">
                <AutoDetailsCard
                    record={run}
                    exclude={[
                        'run_id',
                        'name',
                        'status',
                        'description',
                        'metrics',
                        'executions',
                        'project_name',
                        'created_by_name',
                        'started_at',
                        'completed_at',
                        'suite_id',
                        'source',
                        'environment',
                        'version_tag',
                    ]}
                />
            </div>
```

> `AutoDetailsCard` brings its own `QCCard` styling (rounded-2xl); on this page it will sit alongside the page's `rounded-xl` panels. That minor visual difference is acceptable — this page is the one that doesn't use the shared detail layout. `buildAutoDetailFields` iterates the actual response object at runtime, so any columns beyond the `TestRunDetail` interface still surface; objects/arrays like `metrics`/`executions` are skipped automatically (the explicit excludes are just for clarity).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 4: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/test/runs/[id]/page.tsx
git commit -m "Auto-render all fields on test run detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Full verification

**Files:** none (verification + housekeeping).

- [ ] **Step 1: Run the full unit suite**

Run (in `apps/web`): `npm test`
Expected: all `detailFields.test.ts` tests PASS.

- [ ] **Step 2: Full type-check**

Run (in `apps/web`): `npx tsc --noEmit`
Expected: no errors introduced by this work (compare against any pre-existing baseline errors unrelated to these files).

- [ ] **Step 3: Manual verification (dev server)**

Run (in `apps/web`): `npm run dev`, then open each detail page and confirm:
- Story page now shows a Details card with priority, story points, dates, etc.
- Bug / test case / test suite pages still show their prior fields plus any previously-hidden ones, and effort shows as `Nh`, duration as `N min`, source as "Test Case"/"Exploratory", pass rate as `N%`.
- Task and test run pages keep their visual widgets AND show a new Details / More Details card with the remaining fields.
- No raw UUIDs, no `[object Object]`, no `_can`, no empty `—`-only rows appear anywhere.

- [ ] **Step 4: Rebuild the graphify code graph (project rule)**

Run (in `/root/QC-Manager`):
```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
Expected: "graph.json and GRAPH_REPORT.md updated".

- [ ] **Step 5: Commit any graph changes**

```bash
cd /root/QC-Manager
git add graphify-out/graph.json graphify-out/GRAPH_REPORT.md
git commit -m "Rebuild graphify code graph after detail-page field auto-render

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "no graph changes to commit"
```

---

## Self-Review notes

- **Spec coverage:** shared helper (Tasks 2–4), denylist/UUID/empty filtering (Task 4), `<AutoDetailsCard>` (Task 5), long-text-as-body-cards preserved (Tasks 6–11 leave body cards untouched), all six pages wired (Tasks 6–11), Task/Test-Run widgets preserved (Tasks 10–11), unit tests + tsc gate (Tasks 2–4, 12). All spec sections covered.
- **No API changes** — consistent with spec "out of scope".
- **Type consistency:** `buildAutoDetailFields(record, options)` signature and `AutoDetailField`/`BuildAutoDetailFieldsOptions` types defined in Task 4 are reused unchanged by `<AutoDetailsCard>` (Task 5) and all pages. Formatters always return `string | null`.
