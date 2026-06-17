# Test Coverage Panel — Aggregate View Design

**Date:** 2026-06-17
**Branch:** `feat/test-coverage-aggregate`
**Status:** Approved

## Problem

`TestCoveragePanel` is rendered at `app/quality/governance/page.tsx:271` without a `projectId`. Inside the panel (`TestCoveragePanel.tsx:23`), the per-project readiness fetch is gated on `projectId`:

```tsx
projectId ? getProjectReadiness(projectId) : Promise.resolve(null),
```

With no `projectId`, `readiness` stays `null` and lines 53–95 (`{readiness && (...)}`) hide the entire **Project Readiness** card — the top half of the panel containing the big % numbers (Status / Task Coverage / Story Coverage / Required Suites). The bottom half (Task Test Coverage / Story Test Coverage bars) renders normally with per-project data from `getTestCoverage()`.

This is pre-existing (since `bac2101` IA cutover) and surfaced during post-deploy verification of the unrelated workload-balance work. The governance page is **global by design** — every other widget aggregates across projects. `TestCoveragePanel` should match that pattern.

## Goal

When `projectId` is not provided, render an **aggregate card** with global coverage numbers in place of the hidden per-project readiness card. Per-project bars below remain unchanged.

## Approach

Single-file change to `apps/web/src/components/governance/TestCoveragePanel.tsx`. No backend, no new types, no new API calls.

The panel already receives `taskCoverage` and `storyCoverage` arrays from `getTestCoverage()`. Each row has the fields needed for aggregation:

- `taskCoverage[i]`: `{ project_id, project_name, total_tasks, tasks_with_active_test_cases, task_test_coverage_pct }`
- `storyCoverage[i]`: `{ project_id, project_name, total_user_stories, user_stories_with_active_test_cases, story_test_coverage_pct }`

### Aggregate layout (replaces the hidden `{readiness && (...)}` block when `projectId` is absent)

Four metric tiles, same grid shape as the per-project readiness card:

| Tile | Big number | Sub |
|------|-----------|-----|
| Tasks Covered | `{tasksWithTests} / {totalTasks}` | `{taskCoveragePct}%` |
| Stories Covered | `{storiesWithTests} / {totalStories}` | `{storyCoveragePct}%` |
| Projects | `{projectCount}` total | with test activity |
| Zero Coverage | `{projectsZeroCoverage} of {projectCount}` | no tasks have tests |

Where:
- `totalTasks = Σ taskCoverage.total_tasks`
- `tasksWithTests = Σ taskCoverage.tasks_with_active_test_cases`
- `taskCoveragePct = totalTasks > 0 ? round(tasksWithTests / totalTasks * 100, 1) : 0`
- `totalStories`, `storiesWithTests`, `storyCoveragePct` mirror the above
- `projectCount = taskCoverage.length`
- `projectsZeroCoverage = count(taskCoverage where tasks_with_active_test_cases === 0)`

The "Status" tile from the per-project card (ready/blocked/warning) is **dropped** from the aggregate view — `readiness_status` requires the `/project-readiness` endpoint (which needs a single `project_id`) and has no aggregate equivalent. The "Zero Coverage" tile replaces it as the headline risk signal.

### Per-project mode (unchanged)

When `projectId` **is** provided, the existing `{readiness && (...)}` block renders exactly as today. No change to the per-project flow.

## Out of scope

- Backend changes to `/project-readiness` or `/test-coverage` endpoints
- Adding an aggregate readiness computation to the API (would require iterating suites across all projects — expensive, deferred)
- Adding a project selector (would break the page's global-aggregate UX)
- Changes to per-project bars (lines 99–142)
- Changes to `WorkloadBalanceWidget`, `TrendAnalysisWidget`, or any other governance widget
- The `0%` data itself — investigating why no tasks have active test cases is a separate data-quality issue

## Verification

- `cd apps/web && npx tsc --noEmit` — no new errors referencing `TestCoveragePanel.tsx`
- Manual UI check after deploy — global governance page should show the aggregate card; the per-project bars should still render below
- Existing per-project flow (when `projectId` is passed) is unchanged — same render path as before

## Files

| File | Change |
|------|--------|
| `apps/web/src/components/governance/TestCoveragePanel.tsx` | Add `useMemo` aggregate derivation; conditional render of aggregate card vs per-project readiness card |
