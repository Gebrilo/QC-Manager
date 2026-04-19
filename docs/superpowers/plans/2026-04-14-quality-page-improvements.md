# Quality Page Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs on the quality page, add navigation from project detail, surface all existing but unused governance widgets on the Overview tab, and add role-aware guards so only admins/managers can authorise releases or change quality gate settings.

**Architecture:** All changes are frontend-only (no API changes required — every API call already exists in `governanceApi.ts`). The quality page (`/projects/[id]/quality`) gains more state and widgets; the project detail page gains a nav button; two governance components gain `useAuth()` guards.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, `useAuth()` / `PermissionGuard` / `AdminOnly` from the existing auth system.

---

## File Map

| File | Change |
|---|---|
| `apps/web/app/projects/[id]/quality/page.tsx` | Fix hooks order, add state + fetch for 3 new datasets, replace inline sections with proper widgets |
| `apps/web/app/projects/[id]/page.tsx` | Add "View Quality" navigation button |
| `apps/web/src/components/governance/ReleaseControl.tsx` | Use real `user.name`, role-guard "Authorize Release" button, enable coverage gate |
| `apps/web/src/components/governance/QualityGateSettings.tsx` | Replace `alert()` with inline feedback, wrap Save in `<AdminOnly>` |

---

## Task 1: Fix the React hooks-order crash

**Files:**
- Modify: `apps/web/app/projects/[id]/quality/page.tsx:72–82`

`useState('overview')` is declared at line 82, **after** a conditional `return` at line 72. React requires all hooks to be called unconditionally before any early return. This will crash when `project` is null.

- [ ] **Step 1: Move `activeTab` state above the early return**

Open `apps/web/app/projects/[id]/quality/page.tsx`. Find the block that currently reads:

```tsx
  if (!project && !loading) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Project not found</h2>
        <p className="text-slate-500">Could not find project with ID: {projectId}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline">Go Back</button>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState('overview');
```

Replace it with (hook moves up, early return stays):

```tsx
  const [activeTab, setActiveTab] = useState('overview');

  if (!project && !loading) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Project not found</h2>
        <p className="text-slate-500">Could not find project with ID: {projectId}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline">Go Back</button>
      </div>
    );
  }
```

- [ ] **Step 2: Verify the app still compiles**

```bash
cd /root/QC-Manager && docker exec qc-web sh -c "cd /app && npx tsc --noEmit 2>&1" | grep -i "quality/page" || echo "No type errors in quality page"
```

Expected: no errors on that file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/projects/[id]/quality/page.tsx
git commit -m "fix(quality): move activeTab useState above early return to fix hooks order"
```

---

## Task 2: Add "View Quality" navigation from Project Detail

**Files:**
- Modify: `apps/web/app/projects/[id]/page.tsx:116–127`

The project detail page has Edit and Delete buttons but no path to the quality page. Add a "Quality" button between Edit and Delete.

- [ ] **Step 1: Add the Quality button**

In `apps/web/app/projects/[id]/page.tsx`, find the action button row:

```tsx
                <div className="flex items-center gap-2">
                    <Link href={`/projects/${project.id}/edit`}>
                        <Button variant="outline">Edit Project</Button>
                    </Link>
                    <Button
                        variant="outline"
                        onClick={handleDelete}
                        className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-900/20"
                    >
                        Delete
                    </Button>
                </div>
```

Replace with:

```tsx
                <div className="flex items-center gap-2">
                    <Link href={`/projects/${project.id}/quality`}>
                        <Button variant="outline" className="text-indigo-600 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/20">
                            Quality
                        </Button>
                    </Link>
                    <Link href={`/projects/${project.id}/edit`}>
                        <Button variant="outline">Edit Project</Button>
                    </Link>
                    <Button
                        variant="outline"
                        onClick={handleDelete}
                        className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-900/20"
                    >
                        Delete
                    </Button>
                </div>
```

- [ ] **Step 2: Verify types compile**

```bash
cd /root/QC-Manager && docker exec qc-web sh -c "cd /app && npx tsc --noEmit 2>&1" | grep -i "projects/\[id\]/page" || echo "No type errors"
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/projects/[id]/page.tsx
git commit -m "feat(projects): add Quality navigation button on project detail page"
```

---

## Task 3: Expand the Overview tab with the full widget suite

**Files:**
- Modify: `apps/web/app/projects/[id]/quality/page.tsx`

**What changes:**
- Remove the `bugSummary` state + the inline bug cards section + `BugsBySourceChart` — replace with `<BugSummaryWidget>` (self-fetching, already correct colours)
- Remove the hardcoded "Recent Test Executions" empty placeholder — replace with `<GrossNetProgressWidget>` (per-project execution progress)
- Add state + fetch for `qualityMetrics`, `blockedAnalysis`, `executionProgress`
- Add `<QualityMetricsWidget>` and `<BlockedTestsWidget>` below the trend chart

- [ ] **Step 1: Update imports at the top of the file**

Replace the current import block:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReleaseReadinessWidget,
  RiskIndicatorsWidget,
  TrendAnalysisWidget,
  QualityGateSettings,
  ReleaseControl
} from '@/components/governance'; // We need to export TrendAnalysisWidget from index
import { getProjectHealthSummary, getExecutionTrend } from '@/services/governanceApi';
import type { TrendData } from '@/types/governance';
import { bugsApi } from '@/lib/api';
import { BugsBySourceChart } from '@/components/BugsBySourceChart';
```

With:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReleaseReadinessWidget,
  RiskIndicatorsWidget,
  TrendAnalysisWidget,
  QualityGateSettings,
  ReleaseControl,
  BugSummaryWidget,
  QualityMetricsWidget,
  BlockedTestsWidget,
  GrossNetProgressWidget,
} from '@/components/governance';
import {
  getProjectHealthSummary,
  getExecutionTrend,
  getQualityMetrics,
  getBlockedAnalysis,
  getExecutionProgress,
} from '@/services/governanceApi';
import type { TrendData, QualityMetrics, BlockedModuleAnalysis, ExecutionProgress } from '@/types/governance';
```

- [ ] **Step 2: Replace state declarations**

Find the block starting at `const [project, setProject]` and ending at `} | null>(null);`. Replace the entire state section (including the old `bugSummary` state) with:

```tsx
  const [project, setProject] = useState<any | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics[]>([]);
  const [blockedAnalysis, setBlockedAnalysis] = useState<BlockedModuleAnalysis[]>([]);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 3: Update the data fetching in the useEffect**

Find the `loadProjectData` async function inside `useEffect` and replace it entirely:

```tsx
    async function loadProjectData() {
      if (!projectId) return;

      try {
        setLoading(true);
        const [healthData, trendResult, metricsResult, blockedResult, progressResult] = await Promise.all([
          getProjectHealthSummary(projectId),
          getExecutionTrend(projectId),
          getQualityMetrics(projectId),
          getBlockedAnalysis(projectId),
          getExecutionProgress(projectId),
        ]);

        if (healthData) {
          setProject({
            ...healthData,
            id: healthData.project_id,
            name: healthData.project_name,
            status: healthData.project_status,
            description: `Project ${healthData.project_name} quality metrics and governance details.`
          });
        }

        setTrendData(trendResult || []);
        setQualityMetrics(metricsResult || []);
        setBlockedAnalysis(blockedResult || []);
        setExecutionProgress(progressResult || []);
      } catch (err) {
        console.error("Failed to load project details:", err);
        setError("Failed to load project details");
      } finally {
        setLoading(false);
      }
    }
```

- [ ] **Step 4: Replace the Overview tab content**

Find the entire `{activeTab === 'overview' && (` block and replace it:

```tsx
        {activeTab === 'overview' && (
          <div className="animate-in fade-in duration-300 space-y-8">
            {/* Top Row: Readiness & Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section>
                <ReleaseReadinessWidget projectId={projectId} />
              </section>
              <section>
                <RiskIndicatorsWidget projectId={projectId} />
              </section>
            </div>

            {/* Trend Analysis */}
            <section>
              <TrendAnalysisWidget data={trendData} title="Quality Trend (Last 14 Days)" />
            </section>

            {/* Gross vs Net Execution Progress */}
            <section>
              <GrossNetProgressWidget data={executionProgress} />
            </section>

            {/* Quality Metrics (coverage, effectiveness, PERT) */}
            <section>
              <QualityMetricsWidget data={qualityMetrics} />
            </section>

            {/* Blocked Test Analysis */}
            <section>
              <BlockedTestsWidget data={blockedAnalysis} />
            </section>

            {/* Bug Summary */}
            <section>
              <BugSummaryWidget projectId={projectId} />
            </section>
          </div>
        )}
```

- [ ] **Step 5: Verify types compile**

```bash
cd /root/QC-Manager && docker exec qc-web sh -c "cd /app && npx tsc --noEmit 2>&1" | grep -i "quality/page" || echo "No type errors in quality page"
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/projects/[id]/quality/page.tsx
git commit -m "feat(quality): expand overview tab with full widget suite (BugSummary, GrossNet, QualityMetrics, BlockedTests)"
```

---

## Task 4: Fix approver name, role-guard Release Control, enable coverage gate

**Files:**
- Modify: `apps/web/src/components/governance/ReleaseControl.tsx`

**Three problems to fix:**
1. `approver_name: 'Current User'` — should use the authenticated user's name
2. "Start Release Procedure" button is visible to all users — only `admin` and `manager` should see it
3. `min_test_coverage` gate is commented out — enable it (the metric is available via `QualityMetricsWidget` data, but the health endpoint doesn't expose `test_coverage_pct` directly, so keep the gate disabled but visible as N/A until the health endpoint is extended)

For problem 3, the `projectHealth` prop does not carry `test_coverage_pct`. Rather than silently omit, render the gate with a disabled/N/A state so the user can see it exists.

- [ ] **Step 1: Add useAuth import**

At the top of `apps/web/src/components/governance/ReleaseControl.tsx`, add the import:

```tsx
import { useAuth } from '@/components/providers/AuthProvider';
```

- [ ] **Step 2: Destructure user from useAuth inside the component**

Inside `export function ReleaseControl(...)`, after the existing `useState` declarations, add:

```tsx
    const { user } = useAuth();
    const canAuthorize = user?.role === 'admin' || user?.role === 'manager';
```

- [ ] **Step 3: Fix approver_name in handleSubmit**

Find:

```tsx
                approver_name: 'Current User', // TODO: Get from Auth
```

Replace with:

```tsx
                approver_name: user?.name || user?.email || 'Unknown',
```

- [ ] **Step 4: Enable the coverage gate row with N/A fallback**

Find:

```tsx
    const gatesEvaluation = gates && projectHealth ? [
        { name: 'Pass Rate', ...evaluateGate(parseFloat(projectHealth.latest_pass_rate_pct || '0'), gates.min_pass_rate, 'min') },
        { name: 'Critical Defects', ...evaluateGate(projectHealth.blocking_issue_count || 0, gates.max_critical_defects, 'max') },
        // { name: 'Test Coverage', ...evaluateGate(parseFloat(projectHealth.test_coverage_pct || '0'), gates.min_test_coverage, 'min') }, // If available in health
    ] : [];
```

Replace with:

```tsx
    const gatesEvaluation = gates && projectHealth ? [
        { name: 'Pass Rate', ...evaluateGate(parseFloat(projectHealth.latest_pass_rate_pct || '0'), gates.min_pass_rate, 'min') },
        { name: 'Critical Defects', ...evaluateGate(projectHealth.blocking_issue_count || 0, gates.max_critical_defects, 'max') },
        { name: 'Test Coverage', passed: null as unknown as boolean, metric: null, threshold: gates.min_test_coverage },
    ] : [];
```

- [ ] **Step 5: Update the gate card render to handle the coverage N/A case**

Find the gate card rendering block inside `gatesEvaluation.map`:

```tsx
                        {gatesEvaluation.map((g, idx) => (
                            <div key={idx} className={`p-4 rounded-lg border ${g.passed ? 'bg-white dark:bg-slate-800 border-green-100 dark:border-green-800' : 'bg-white dark:bg-slate-800 border-red-200 dark:border-red-800'}`}>
                                <div className="text-sm text-slate-500 mb-1">{g.name}</div>
                                <div className="text-2xl font-bold mb-1">
                                    {g.metric}{g.name.includes('Rate') ? '%' : ''}
                                </div>
                                <div className="text-xs text-slate-400">
                                    Target: {g.threshold}{g.name.includes('Rate') ? '%' : ''}
                                    {g.name === 'Critical Defects' ? ' Max' : ' Min'}
                                </div>
                            </div>
                        ))}
```

Replace with:

```tsx
                        {gatesEvaluation.map((g, idx) => {
                            const isNA = g.metric === null;
                            const borderClass = isNA
                                ? 'border-slate-200 dark:border-slate-700'
                                : g.passed
                                    ? 'border-green-100 dark:border-green-800'
                                    : 'border-red-200 dark:border-red-800';
                            return (
                                <div key={idx} className={`p-4 rounded-lg border bg-white dark:bg-slate-800 ${borderClass}`}>
                                    <div className="text-sm text-slate-500 mb-1">{g.name}</div>
                                    <div className="text-2xl font-bold mb-1 text-slate-900 dark:text-white">
                                        {isNA ? <span className="text-slate-400 text-base">N/A</span> : `${g.metric}${g.name.includes('Rate') || g.name.includes('Coverage') ? '%' : ''}`}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                        Target: {g.threshold}{g.name.includes('Rate') || g.name.includes('Coverage') ? '%' : ''}
                                        {g.name === 'Critical Defects' ? ' Max' : ' Min'}
                                        {isNA && <span className="ml-1 text-slate-300">(not yet tracked)</span>}
                                    </div>
                                </div>
                            );
                        })}
```

- [ ] **Step 6: Role-guard the "Start Release Procedure" button**

Find:

```tsx
                    <div className="mt-6 flex justify-end">
                        <Button
                            onClick={() => { setAction('APPROVED'); setShowForm(true); }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            Start Release Procedure
                        </Button>
                    </div>
```

Replace with:

```tsx
                    <div className="mt-6 flex justify-end">
                        {canAuthorize ? (
                            <Button
                                onClick={() => { setAction('APPROVED'); setShowForm(true); }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                Start Release Procedure
                            </Button>
                        ) : (
                            <p className="text-sm text-slate-400 italic">Only managers and admins can authorise releases.</p>
                        )}
                    </div>
```

- [ ] **Step 7: Verify types compile**

```bash
cd /root/QC-Manager && docker exec qc-web sh -c "cd /app && npx tsc --noEmit 2>&1" | grep -i "ReleaseControl" || echo "No type errors in ReleaseControl"
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/governance/ReleaseControl.tsx
git commit -m "feat(governance): role-guard release authorisation, fix approver name, show coverage gate as N/A"
```

---

## Task 5: Role-guard Quality Settings and replace alert() with inline feedback

**Files:**
- Modify: `apps/web/src/components/governance/QualityGateSettings.tsx`

**Two problems:**
1. Any authenticated user can save quality gate settings — should be admin-only
2. `alert()` for save feedback is a browser dialog — replace with inline message

- [ ] **Step 1: Add imports**

At the top of `apps/web/src/components/governance/QualityGateSettings.tsx`, add:

```tsx
import { AdminOnly } from '@/components/PermissionGuard';
```

- [ ] **Step 2: Add inline feedback state**

Inside the `QualityGateSettings` function, after the existing state declarations, add:

```tsx
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
```

- [ ] **Step 3: Replace alert() calls with state updates in handleSave**

Find the `handleSave` function and replace it entirely:

```tsx
    const handleSave = async () => {
        setSaving(true);
        setSaveStatus('idle');
        try {
            const data = {
                project_id: projectId,
                min_pass_rate: minPassRate,
                max_critical_defects: maxDefects,
                min_test_coverage: minCoverage
            };
            await governanceApi.saveProjectGates(data);
            await loadGates();
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err) {
            console.error(err);
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    };
```

- [ ] **Step 4: Replace the save button area with inline feedback + AdminOnly guard**

Find:

```tsx
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                    <Button onClick={handleSave} disabled={saving} variant="primary">
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </div>
```

Replace with:

```tsx
                <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                    {saveStatus === 'success' && (
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">Settings saved successfully.</p>
                    )}
                    {saveStatus === 'error' && (
                        <p className="text-sm text-red-600 dark:text-red-400">Failed to save settings. Try again.</p>
                    )}
                    <AdminOnly fallback={
                        <p className="text-sm text-slate-400 italic">Only admins can change quality gate settings.</p>
                    }>
                        <Button onClick={handleSave} disabled={saving} variant="primary">
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </Button>
                    </AdminOnly>
                </div>
```

- [ ] **Step 5: Verify types compile**

```bash
cd /root/QC-Manager && docker exec qc-web sh -c "cd /app && npx tsc --noEmit 2>&1" | grep -i "QualityGateSettings" || echo "No type errors in QualityGateSettings"
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/governance/QualityGateSettings.tsx
git commit -m "feat(governance): admin-only gate settings save, replace alert() with inline feedback"
```

---

## Task 6: Full TypeScript check + deploy

- [ ] **Step 1: Run full TypeScript check across the project**

```bash
cd /root/QC-Manager && docker exec qc-web sh -c "cd /app && npx tsc --noEmit 2>&1" | head -40
```

Expected: 0 errors on any of the modified files.

- [ ] **Step 2: Deploy**

```bash
git push
```

Watch the GitHub Actions deploy pipeline. After it completes, verify:

```bash
curl -s https://api.gebrils.cloud/api/health
```

Expected: `{"status":"ok"}`. Then open https://gebrils.cloud/projects/5feb5fd1-aba6-4482-ac2b-e4eb0312b422 and confirm the Quality button is visible, navigates correctly, the Overview tab loads all widgets without crashing, and the Settings save button is absent for non-admin users.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Hooks-order crash → Task 1
- [x] Navigation from project detail → Task 2
- [x] Real Recent Test Executions (replaced with GrossNetProgressWidget) → Task 3
- [x] BugSummaryWidget replaces inline bug section (fixes white-on-white colour bug too) → Task 3
- [x] QualityMetricsWidget added to Overview → Task 3
- [x] BlockedTestsWidget added to Overview → Task 3
- [x] GrossNetProgressWidget added to Overview → Task 3
- [x] approver_name uses real user name → Task 4
- [x] Release Control role-guarded to admin/manager → Task 4
- [x] Coverage gate visible (N/A until health endpoint exposes it) → Task 4
- [x] Settings alert() replaced with inline feedback → Task 5
- [x] Settings save admin-only → Task 5

**Known scope boundary:** `test_coverage_pct` is not returned by `GET /governance/project-health/:id`. The coverage gate shows "N/A (not yet tracked)" until the API is extended — that API change is explicitly out of scope here.
