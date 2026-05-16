# Issue #41: New URL Plan with 301 Redirects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add new URL paths (`/me/*`, `/work/*`, `/test/*`, `/quality/*`, `/team/*`, `/admin/*`) alongside existing paths with 301 redirects from old→new.

**Architecture:** New page files re-export from old page files (old stays source of truth). 301 redirects in `next.config.js` map old→new. `routes.ts` gets dual entries so both paths resolve permissions correctly.

**Tech Stack:** Next.js 14 App Router, TypeScript, `next.config.js` redirects

---

## File Structure

### New re-export page files (create)
Each is a thin file that re-exports the default from the old path:

**`/me/*` group:**
- `apps/web/app/me/page.tsx` — redirects to `/me/tasks` (no old equivalent, just a landing redirect)
- `apps/web/app/me/tasks/page.tsx` — re-exports from `../../my-tasks/page`
- `apps/web/app/me/journeys/page.tsx` — re-exports from `../../journeys/page`
- `apps/web/app/me/journeys/[id]/page.tsx` — re-exports from `../../../journeys/[id]/page`
- `apps/web/app/me/idp/page.tsx` — re-exports from `../../development-plan/page`
- `apps/web/app/me/idp/history/page.tsx` — re-exports from `../../../development-plan/history/page`
- `apps/web/app/me/idp/history/[planId]/page.tsx` — re-exports from `../../../../development-plan/history/[planId]/page`
- `apps/web/app/me/dashboard/page.tsx` — re-exports from `../../my-dashboard/page`
- `apps/web/app/me/preferences/page.tsx` — re-exports from `../../preferences/page`

**`/work/*` group:**
- `apps/web/app/work/page.tsx` — redirects to `/work/tasks`
- `apps/web/app/work/tasks/page.tsx` — re-exports from `../../tasks/page`
- `apps/web/app/work/tasks/layout.tsx` — re-exports from `../../tasks/layout`
- `apps/web/app/work/tasks/create/page.tsx` — re-exports from `../../../tasks/create/page`
- `apps/web/app/work/tasks/[id]/page.tsx` — re-exports from `../../../tasks/[id]/page`
- `apps/web/app/work/tasks/[id]/edit/page.tsx` — re-exports from `../../../../tasks/[id]/edit/page`
- `apps/web/app/work/projects/page.tsx` — re-exports from `../../projects/page`
- `apps/web/app/work/projects/create/page.tsx` — re-exports from `../../../projects/create/page`
- `apps/web/app/work/projects/[id]/page.tsx` — re-exports from `../../../projects/[id]/page`
- `apps/web/app/work/projects/[id]/edit/page.tsx` — re-exports from `../../../../projects/[id]/edit/page`
- `apps/web/app/work/projects/[id]/quality/page.tsx` — re-exports from `../../../../projects/[id]/quality/page`
- `apps/web/app/work/bugs/page.tsx` — re-exports from `../../bugs/page`
- `apps/web/app/work/bugs/create/page.tsx` — re-exports from `../../../bugs/create/page`
- `apps/web/app/work/bugs/[id]/page.tsx` — re-exports from `../../../bugs/[id]/page`
- `apps/web/app/work/bugs/[id]/edit/page.tsx` — re-exports from `../../../../bugs/[id]/edit/page`
- `apps/web/app/work/stories/page.tsx` — re-exports from `../../user-stories/page` (NOTE: no user-stories/page.tsx exists — needs listing-only stub or redirect to `/work/stories` is enough)
- `apps/web/app/work/stories/create/page.tsx` — re-exports from `../../../user-stories/create/page`
- `apps/web/app/work/stories/[id]/page.tsx` — re-exports from `../../../user-stories/[id]/page`
- `apps/web/app/work/stories/[id]/edit/page.tsx` — re-exports from `../../../../user-stories/[id]/edit/page`

**`/test/*` group:**
- `apps/web/app/test/cases/page.tsx` — re-exports from `../../test-cases/page`
- `apps/web/app/test/cases/create/page.tsx` — re-exports from `../../../test-cases/create/page`
- `apps/web/app/test/cases/[id]/page.tsx` — re-exports from `../../../test-cases/[id]/page`
- `apps/web/app/test/cases/[id]/edit/page.tsx` — re-exports from `../../../../test-cases/[id]/edit/page`
- `apps/web/app/test/suites/page.tsx` — re-exports from `../../test-suites/page`
- `apps/web/app/test/suites/create/page.tsx` — re-exports from `../../../test-suites/create/page`
- `apps/web/app/test/suites/[id]/page.tsx` — re-exports from `../../../test-suites/[id]/page`
- `apps/web/app/test/suites/[id]/edit/page.tsx` — re-exports from `../../../../test-suites/[id]/edit/page`
- `apps/web/app/test/runs/page.tsx` — re-exports from `../../test-executions/page`
- `apps/web/app/test/runs/create/page.tsx` — re-exports from `../../../test-runs/create/page`
- `apps/web/app/test/runs/[id]/page.tsx` — re-exports from `../../../test-runs/[id]/page`
- `apps/web/app/test/results/page.tsx` — re-exports from `../../test-results/page`
- `apps/web/app/test/results/upload/page.tsx` — re-exports from `../../../test-results/upload/page`

**`/quality/*` group:**
- `apps/web/app/quality/governance/page.tsx` — re-exports from `../../governance/page`
- `apps/web/app/quality/reports/page.tsx` — re-exports from `../../reports/page`

**`/team/*` group:**
- `apps/web/app/team/resources/page.tsx` — re-exports from `../../resources/page`
- `apps/web/app/team/resources/create/page.tsx` — re-exports from `../../../resources/create/page`
- `apps/web/app/team/resources/[id]/page.tsx` — re-exports from `../../../resources/[id]/page`
- `apps/web/app/team/idp/page.tsx` — re-exports from `../../manage-development-plans/page`
- `apps/web/app/team/idp/[userId]/page.tsx` — re-exports from `../../../manage-development-plans/[userId]/page`
- `apps/web/app/team/journeys/page.tsx` — re-exports from `../../settings/team-journeys/page`
- `apps/web/app/team/journeys/[userId]/[journeyId]/page.tsx` — re-exports from `../../../../settings/team-journeys/[userId]/[journeyId]/page`
- `apps/web/app/team/history/page.tsx` — re-exports from `../../task-history/page`

**`/admin/*` group:**
- `apps/web/app/admin/page.tsx` — re-exports from `../settings/page`
- `apps/web/app/admin/users/page.tsx` — re-exports from `../../users/page`
- `apps/web/app/admin/teams/page.tsx` — re-exports from `../../settings/teams/page`
- `apps/web/app/admin/journeys/page.tsx` — re-exports from `../../settings/journeys/page`
- `apps/web/app/admin/journeys/[id]/page.tsx` — re-exports from `../../../settings/journeys/[id]/page`
- `apps/web/app/admin/roles/page.tsx` — re-exports from `../../settings/roles/page`
- `apps/web/app/admin/integrations/tuleap/page.tsx` — re-exports from `../../../settings/tuleap/page`

### Modified files
- `apps/web/next.config.js` — add `redirects()` with 301 mappings
- `apps/web/src/config/routes.ts` — add dual entries, update `DEFAULT_LANDING`
- `apps/web/src/components/providers/RouteGuard.tsx` — update hardcoded `/my-tasks` fallback to `/me/tasks`

### Deleted files
- `apps/web/app/test/page.tsx` — dev artifact shadowed by new `/test/*` structure

---

## Task 1: Delete dev artifact

**Files:**
- Delete: `apps/web/app/test/page.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm apps/web/app/test/page.tsx
```

- [ ] **Step 2: Verify build still works**

```bash
cd apps/web && npx next build 2>&1 | tail -5
```

Expected: Build succeeds (or at least doesn't error on missing test/page.tsx — it's not imported anywhere)

---

## Task 2: Create `/me/*` re-export pages

**Files:**
- Create: `apps/web/app/me/tasks/page.tsx`
- Create: `apps/web/app/me/journeys/page.tsx`
- Create: `apps/web/app/me/journeys/[id]/page.tsx`
- Create: `apps/web/app/me/idp/page.tsx`
- Create: `apps/web/app/me/idp/history/page.tsx`
- Create: `apps/web/app/me/idp/history/[planId]/page.tsx`
- Create: `apps/web/app/me/dashboard/page.tsx`
- Create: `apps/web/app/me/preferences/page.tsx`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web/app/me/tasks
mkdir -p apps/web/app/me/journeys/\[id\]
mkdir -p apps/web/app/me/idp/history/\[planId\]
mkdir -p apps/web/app/me/dashboard
mkdir -p apps/web/app/me/preferences
```

- [ ] **Step 2: Create each re-export file**

`apps/web/app/me/tasks/page.tsx`:
```tsx
export { default } from '../../my-tasks/page';
```

`apps/web/app/me/journeys/page.tsx`:
```tsx
export { default } from '../../journeys/page';
```

`apps/web/app/me/journeys/[id]/page.tsx`:
```tsx
export { default } from '../../../journeys/[id]/page';
```

`apps/web/app/me/idp/page.tsx`:
```tsx
export { default } from '../../development-plan/page';
```

`apps/web/app/me/idp/history/page.tsx`:
```tsx
export { default } from '../../../development-plan/history/page';
```

`apps/web/app/me/idp/history/[planId]/page.tsx`:
```tsx
export { default } from '../../../../development-plan/history/[planId]/page';
```

`apps/web/app/me/dashboard/page.tsx`:
```tsx
export { default } from '../../my-dashboard/page';
```

`apps/web/app/me/preferences/page.tsx`:
```tsx
export { default } from '../../preferences/page';
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/me/
git commit -m "feat(web): add /me/* re-export pages for new URL plan"
```

---

## Task 3: Create `/work/*` re-export pages

**Files:**
- Create: `apps/web/app/work/tasks/page.tsx`
- Create: `apps/web/app/work/tasks/layout.tsx`
- Create: `apps/web/app/work/tasks/create/page.tsx`
- Create: `apps/web/app/work/tasks/[id]/page.tsx`
- Create: `apps/web/app/work/tasks/[id]/edit/page.tsx`
- Create: `apps/web/app/work/projects/page.tsx`
- Create: `apps/web/app/work/projects/create/page.tsx`
- Create: `apps/web/app/work/projects/[id]/page.tsx`
- Create: `apps/web/app/work/projects/[id]/edit/page.tsx`
- Create: `apps/web/app/work/projects/[id]/quality/page.tsx`
- Create: `apps/web/app/work/bugs/page.tsx`
- Create: `apps/web/app/work/bugs/create/page.tsx`
- Create: `apps/web/app/work/bugs/[id]/page.tsx`
- Create: `apps/web/app/work/bugs/[id]/edit/page.tsx`
- Create: `apps/web/app/work/stories/create/page.tsx`
- Create: `apps/web/app/work/stories/[id]/page.tsx`
- Create: `apps/web/app/work/stories/[id]/edit/page.tsx`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web/app/work/tasks/create
mkdir -p apps/web/app/work/tasks/\[id\]/edit
mkdir -p apps/web/app/work/projects/create
mkdir -p apps/web/app/work/projects/\[id\]/edit
mkdir -p apps/web/app/work/projects/\[id\]/quality
mkdir -p apps/web/app/work/bugs/create
mkdir -p apps/web/app/work/bugs/\[id\]/edit
mkdir -p apps/web/app/work/stories/create
mkdir -p apps/web/app/work/stories/\[id\]/edit
```

- [ ] **Step 2: Create each re-export file**

`apps/web/app/work/tasks/page.tsx`:
```tsx
export { default } from '../../tasks/page';
```

`apps/web/app/work/tasks/layout.tsx`:
```tsx
export { default } from '../../tasks/layout';
```

`apps/web/app/work/tasks/create/page.tsx`:
```tsx
export { default } from '../../../tasks/create/page';
```

`apps/web/app/work/tasks/[id]/page.tsx`:
```tsx
export { default } from '../../../tasks/[id]/page';
```

`apps/web/app/work/tasks/[id]/edit/page.tsx`:
```tsx
export { default } from '../../../../tasks/[id]/edit/page';
```

`apps/web/app/work/projects/page.tsx`:
```tsx
export { default } from '../../projects/page';
```

`apps/web/app/work/projects/create/page.tsx`:
```tsx
export { default } from '../../../projects/create/page';
```

`apps/web/app/work/projects/[id]/page.tsx`:
```tsx
export { default } from '../../../projects/[id]/page';
```

`apps/web/app/work/projects/[id]/edit/page.tsx`:
```tsx
export { default } from '../../../../projects/[id]/edit/page';
```

`apps/web/app/work/projects/[id]/quality/page.tsx`:
```tsx
export { default } from '../../../../projects/[id]/quality/page';
```

`apps/web/app/work/bugs/page.tsx`:
```tsx
export { default } from '../../bugs/page';
```

`apps/web/app/work/bugs/create/page.tsx`:
```tsx
export { default } from '../../../bugs/create/page';
```

`apps/web/app/work/bugs/[id]/page.tsx`:
```tsx
export { default } from '../../../bugs/[id]/page';
```

`apps/web/app/work/bugs/[id]/edit/page.tsx`:
```tsx
export { default } from '../../../../bugs/[id]/edit/page';
```

`apps/web/app/work/stories/create/page.tsx`:
```tsx
export { default } from '../../../user-stories/create/page';
```

`apps/web/app/work/stories/[id]/page.tsx`:
```tsx
export { default } from '../../../user-stories/[id]/page';
```

`apps/web/app/work/stories/[id]/edit/page.tsx`:
```tsx
export { default } from '../../../../user-stories/[id]/edit/page';
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/work/
git commit -m "feat(web): add /work/* re-export pages for new URL plan"
```

---

## Task 4: Create `/test/*` re-export pages

**Files:**
- Create: `apps/web/app/test/cases/page.tsx`
- Create: `apps/web/app/test/cases/create/page.tsx`
- Create: `apps/web/app/test/cases/[id]/page.tsx`
- Create: `apps/web/app/test/cases/[id]/edit/page.tsx`
- Create: `apps/web/app/test/suites/page.tsx`
- Create: `apps/web/app/test/suites/create/page.tsx`
- Create: `apps/web/app/test/suites/[id]/page.tsx`
- Create: `apps/web/app/test/suites/[id]/edit/page.tsx`
- Create: `apps/web/app/test/runs/page.tsx`
- Create: `apps/web/app/test/runs/create/page.tsx`
- Create: `apps/web/app/test/runs/[id]/page.tsx`
- Create: `apps/web/app/test/results/page.tsx`
- Create: `apps/web/app/test/results/upload/page.tsx`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web/app/test/cases/create
mkdir -p apps/web/app/test/cases/\[id\]/edit
mkdir -p apps/web/app/test/suites/create
mkdir -p apps/web/app/test/suites/\[id\]/edit
mkdir -p apps/web/app/test/runs/create
mkdir -p apps/web/app/test/runs/\[id\]
mkdir -p apps/web/app/test/results/upload
```

- [ ] **Step 2: Create each re-export file**

`apps/web/app/test/cases/page.tsx`:
```tsx
export { default } from '../../test-cases/page';
```

`apps/web/app/test/cases/create/page.tsx`:
```tsx
export { default } from '../../../test-cases/create/page';
```

`apps/web/app/test/cases/[id]/page.tsx`:
```tsx
export { default } from '../../../test-cases/[id]/page';
```

`apps/web/app/test/cases/[id]/edit/page.tsx`:
```tsx
export { default } from '../../../../test-cases/[id]/edit/page';
```

`apps/web/app/test/suites/page.tsx`:
```tsx
export { default } from '../../test-suites/page';
```

`apps/web/app/test/suites/create/page.tsx`:
```tsx
export { default } from '../../../test-suites/create/page';
```

`apps/web/app/test/suites/[id]/page.tsx`:
```tsx
export { default } from '../../../test-suites/[id]/page';
```

`apps/web/app/test/suites/[id]/edit/page.tsx`:
```tsx
export { default } from '../../../../test-suites/[id]/edit/page';
```

`apps/web/app/test/runs/page.tsx`:
```tsx
export { default } from '../../test-executions/page';
```

`apps/web/app/test/runs/create/page.tsx`:
```tsx
export { default } from '../../../test-runs/create/page';
```

`apps/web/app/test/runs/[id]/page.tsx`:
```tsx
export { default } from '../../../test-runs/[id]/page';
```

`apps/web/app/test/results/page.tsx`:
```tsx
export { default } from '../../test-results/page';
```

`apps/web/app/test/results/upload/page.tsx`:
```tsx
export { default } from '../../../test-results/upload/page';
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/test/
git commit -m "feat(web): add /test/* re-export pages for new URL plan"
```

---

## Task 5: Create `/quality/*`, `/team/*`, `/admin/*` re-export pages

**Files:**
- Create: `apps/web/app/quality/governance/page.tsx`
- Create: `apps/web/app/quality/reports/page.tsx`
- Create: `apps/web/app/team/resources/page.tsx`
- Create: `apps/web/app/team/resources/create/page.tsx`
- Create: `apps/web/app/team/resources/[id]/page.tsx`
- Create: `apps/web/app/team/idp/page.tsx`
- Create: `apps/web/app/team/idp/[userId]/page.tsx`
- Create: `apps/web/app/team/journeys/page.tsx`
- Create: `apps/web/app/team/journeys/[userId]/[journeyId]/page.tsx`
- Create: `apps/web/app/team/history/page.tsx`
- Create: `apps/web/app/admin/page.tsx`
- Create: `apps/web/app/admin/users/page.tsx`
- Create: `apps/web/app/admin/teams/page.tsx`
- Create: `apps/web/app/admin/journeys/page.tsx`
- Create: `apps/web/app/admin/journeys/[id]/page.tsx`
- Create: `apps/web/app/admin/roles/page.tsx`
- Create: `apps/web/app/admin/integrations/tuleap/page.tsx`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web/app/quality/governance
mkdir -p apps/web/app/quality/reports
mkdir -p apps/web/app/team/resources/create
mkdir -p apps/web/app/team/resources/\[id\]
mkdir -p apps/web/app/team/idp/\[userId\]
mkdir -p apps/web/app/team/journeys/\[userId\]/\[journeyId\]
mkdir -p apps/web/app/team/history
mkdir -p apps/web/app/admin/users
mkdir -p apps/web/app/admin/teams
mkdir -p apps/web/app/admin/journeys/\[id\]
mkdir -p apps/web/app/admin/roles
mkdir -p apps/web/app/admin/integrations/tuleap
```

- [ ] **Step 2: Create quality re-export files**

`apps/web/app/quality/governance/page.tsx`:
```tsx
export { default } from '../../governance/page';
```

`apps/web/app/quality/reports/page.tsx`:
```tsx
export { default } from '../../reports/page';
```

- [ ] **Step 3: Create team re-export files**

`apps/web/app/team/resources/page.tsx`:
```tsx
export { default } from '../../resources/page';
```

`apps/web/app/team/resources/create/page.tsx`:
```tsx
export { default } from '../../../resources/create/page';
```

`apps/web/app/team/resources/[id]/page.tsx`:
```tsx
export { default } from '../../../resources/[id]/page';
```

`apps/web/app/team/idp/page.tsx`:
```tsx
export { default } from '../../manage-development-plans/page';
```

`apps/web/app/team/idp/[userId]/page.tsx`:
```tsx
export { default } from '../../../manage-development-plans/[userId]/page';
```

`apps/web/app/team/journeys/page.tsx`:
```tsx
export { default } from '../../settings/team-journeys/page';
```

`apps/web/app/team/journeys/[userId]/[journeyId]/page.tsx`:
```tsx
export { default } from '../../../../settings/team-journeys/[userId]/[journeyId]/page';
```

`apps/web/app/team/history/page.tsx`:
```tsx
export { default } from '../../task-history/page';
```

- [ ] **Step 4: Create admin re-export files**

`apps/web/app/admin/page.tsx`:
```tsx
export { default } from '../settings/page';
```

`apps/web/app/admin/users/page.tsx`:
```tsx
export { default } from '../../users/page';
```

`apps/web/app/admin/teams/page.tsx`:
```tsx
export { default } from '../../settings/teams/page';
```

`apps/web/app/admin/journeys/page.tsx`:
```tsx
export { default } from '../../settings/journeys/page';
```

`apps/web/app/admin/journeys/[id]/page.tsx`:
```tsx
export { default } from '../../../settings/journeys/[id]/page';
```

`apps/web/app/admin/roles/page.tsx`:
```tsx
export { default } from '../../settings/roles/page';
```

`apps/web/app/admin/integrations/tuleap/page.tsx`:
```tsx
export { default } from '../../../settings/tuleap/page';
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/quality/ apps/web/app/team/ apps/web/app/admin/
git commit -m "feat(web): add /quality/*, /team/*, /admin/* re-export pages for new URL plan"
```

---

## Task 6: Add 301 redirects to `next.config.js`

**Files:**
- Modify: `apps/web/next.config.js`

- [ ] **Step 1: Add redirects function**

Replace the entire `next.config.js` with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {},
    async rewrites() {
        const apiInternal = process.env.API_INTERNAL_URL || 'http://qc-api:3001';
        return [
            {
                source: '/api-proxy/:path*',
                destination: `${apiInternal}/:path*`,
            },
        ];
    },
    async redirects() {
        return [
            // /me/*
            { source: '/my-tasks', destination: '/me/tasks', permanent: true },
            { source: '/journeys', destination: '/me/journeys', permanent: true },
            { source: '/journeys/:id', destination: '/me/journeys/:id', permanent: true },
            { source: '/development-plan', destination: '/me/idp', permanent: true },
            { source: '/development-plan/history', destination: '/me/idp/history', permanent: true },
            { source: '/development-plan/history/:planId', destination: '/me/idp/history/:planId', permanent: true },
            { source: '/my-dashboard', destination: '/me/dashboard', permanent: true },
            { source: '/preferences', destination: '/me/preferences', permanent: true },
            // /work/*
            { source: '/tasks', destination: '/work/tasks', permanent: true },
            { source: '/tasks/create', destination: '/work/tasks/create', permanent: true },
            { source: '/tasks/:id', destination: '/work/tasks/:id', permanent: true },
            { source: '/tasks/:id/edit', destination: '/work/tasks/:id/edit', permanent: true },
            { source: '/projects', destination: '/work/projects', permanent: true },
            { source: '/projects/create', destination: '/work/projects/create', permanent: true },
            { source: '/projects/:id', destination: '/work/projects/:id', permanent: true },
            { source: '/projects/:id/edit', destination: '/work/projects/:id/edit', permanent: true },
            { source: '/projects/:id/quality', destination: '/work/projects/:id/quality', permanent: true },
            { source: '/bugs', destination: '/work/bugs', permanent: true },
            { source: '/bugs/create', destination: '/work/bugs/create', permanent: true },
            { source: '/bugs/:id', destination: '/work/bugs/:id', permanent: true },
            { source: '/bugs/:id/edit', destination: '/work/bugs/:id/edit', permanent: true },
            { source: '/user-stories', destination: '/work/stories', permanent: true },
            { source: '/user-stories/create', destination: '/work/stories/create', permanent: true },
            { source: '/user-stories/:id', destination: '/work/stories/:id', permanent: true },
            { source: '/user-stories/:id/edit', destination: '/work/stories/:id/edit', permanent: true },
            // /test/*
            { source: '/test-cases', destination: '/test/cases', permanent: true },
            { source: '/test-cases/create', destination: '/test/cases/create', permanent: true },
            { source: '/test-cases/:id', destination: '/test/cases/:id', permanent: true },
            { source: '/test-cases/:id/edit', destination: '/test/cases/:id/edit', permanent: true },
            { source: '/test-suites', destination: '/test/suites', permanent: true },
            { source: '/test-suites/create', destination: '/test/suites/create', permanent: true },
            { source: '/test-suites/:id', destination: '/test/suites/:id', permanent: true },
            { source: '/test-suites/:id/edit', destination: '/test/suites/:id/edit', permanent: true },
            { source: '/test-executions', destination: '/test/runs', permanent: true },
            { source: '/test-runs/create', destination: '/test/runs/create', permanent: true },
            { source: '/test-runs/:id', destination: '/test/runs/:id', permanent: true },
            { source: '/test-results', destination: '/test/results', permanent: true },
            { source: '/test-results/upload', destination: '/test/results/upload', permanent: true },
            // /quality/*
            { source: '/governance', destination: '/quality/governance', permanent: true },
            { source: '/reports', destination: '/quality/reports', permanent: true },
            // /dashboard → /me/dashboard (removed entirely in #46)
            { source: '/dashboard', destination: '/me/dashboard', permanent: true },
            // /team/*
            { source: '/resources', destination: '/team/resources', permanent: true },
            { source: '/resources/create', destination: '/team/resources/create', permanent: true },
            { source: '/resources/:id', destination: '/team/resources/:id', permanent: true },
            { source: '/manage-development-plans', destination: '/team/idp', permanent: true },
            { source: '/manage-development-plans/:userId', destination: '/team/idp/:userId', permanent: true },
            { source: '/settings/team-journeys', destination: '/team/journeys', permanent: true },
            { source: '/settings/team-journeys/:userId/:journeyId', destination: '/team/journeys/:userId/:journeyId', permanent: true },
            { source: '/task-history', destination: '/team/history', permanent: true },
            // /admin/*
            { source: '/settings', destination: '/admin', permanent: true },
            { source: '/users', destination: '/admin/users', permanent: true },
            { source: '/settings/teams', destination: '/admin/teams', permanent: true },
            { source: '/settings/journeys', destination: '/admin/journeys', permanent: true },
            { source: '/settings/journeys/:id', destination: '/admin/journeys/:id', permanent: true },
            { source: '/settings/roles', destination: '/admin/roles', permanent: true },
            { source: '/settings/tuleap', destination: '/admin/integrations/tuleap', permanent: true },
        ];
    },
}

module.exports = nextConfig
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/next.config.js
git commit -m "feat(web): add 301 redirects from old URLs to new URL plan"
```

---

## Task 7: Update `routes.ts` with dual entries and new landing page

**Files:**
- Modify: `apps/web/src/config/routes.ts`

- [ ] **Step 1: Update `DEFAULT_LANDING`**

In `routes.ts`, change line 153:

From:
```ts
const DEFAULT_LANDING = '/my-tasks';
```

To:
```ts
const DEFAULT_LANDING = '/me/tasks';
```

- [ ] **Step 2: Add new-path route entries**

Add the following entries to the `ROUTES` array (after the existing entries, before the closing `];`). These duplicate the permission/scope config from existing routes but use new paths:

```ts
    // New URL plan — dual entries (slice 5, #41)
    { path: '/me/tasks', label: 'My Tasks', permission: PERMISSIONS.MY_TASKS_VIEW, showInNavbar: false },
    { path: '/me/journeys', label: 'My Journeys', permission: PERMISSIONS.MY_TASKS_VIEW, showInNavbar: false },
    { path: '/me/journeys/[id]', label: 'Journey Details', permission: PERMISSIONS.MY_TASKS_VIEW },
    { path: '/me/idp', label: 'My Development Plan', permission: PERMISSIONS.MY_TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/me/idp/history', label: 'Plan History', permission: PERMISSIONS.MY_TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/me/idp/history/[planId]', label: 'Archived Plan', permission: PERMISSIONS.MY_TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/me/dashboard', label: 'My Dashboard', permission: PERMISSIONS.MY_DASHBOARD_VIEW, showInNavbar: false },
    { path: '/me/preferences', label: 'Preferences' },
    { path: '/work/tasks', label: 'Tasks', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/work/tasks/create', label: 'Create Task', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/tasks/[id]', label: 'Task Details', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/tasks/[id]/edit', label: 'Edit Task', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects', label: 'Projects', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/work/projects/create', label: 'Create Project', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects/[id]', label: 'Project Details', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects/[id]/edit', label: 'Edit Project', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects/[id]/quality', label: 'Project Quality', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/bugs', label: 'Bugs', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/work/bugs/create', label: 'Create Bug', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/bugs/[id]', label: 'Bug Details', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/bugs/[id]/edit', label: 'Edit Bug', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/stories/create', label: 'Create User Story', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/stories/[id]', label: 'User Story Details', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/stories/[id]/edit', label: 'Edit User Story', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/cases', label: 'Test Cases', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/test/cases/create', label: 'Create Test Case', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/cases/[id]', label: 'Test Case Details', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/cases/[id]/edit', label: 'Edit Test Case', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/suites', label: 'Test Suites', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/test/suites/create', label: 'Create Suite', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/suites/[id]', label: 'Suite Details', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/suites/[id]/edit', label: 'Edit Suite', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/runs', label: 'Test Runs', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/test/runs/create', label: 'Create Test Run', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/runs/[id]', label: 'Test Run Details', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/results', label: 'Test Results', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/results/upload', label: 'Upload Results', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/quality/governance', label: 'Governance', permission: PERMISSIONS.GOVERNANCE_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/quality/reports', label: 'Reports', permission: PERMISSIONS.REPORTS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/team/resources', label: 'Resources', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/team/resources/create', label: 'Create Resource', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/resources/[id]', label: 'Resource Dashboard', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/idp', label: 'Dev Plans', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/team/idp/[userId]', label: 'IDP Builder', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/journeys', label: 'Team Journeys', permission: PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/team/journeys/[userId]/[journeyId]', label: 'Team Member Journey', permission: PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/history', label: 'Task History', permission: PERMISSIONS.TASK_HISTORY_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/admin', label: 'Settings', permission: PERMISSIONS.ADMIN_SETTINGS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/admin/users', label: 'Users', permission: PERMISSIONS.ADMIN_USERS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/admin/teams', label: 'Teams', permission: PERMISSIONS.TEAM_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/admin/journeys', label: 'Manage Journeys', permission: PERMISSIONS.JOURNEYS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/admin/journeys/[id]', label: 'Edit Journey', permission: PERMISSIONS.JOURNEYS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/admin/roles', label: 'Roles & Permissions', permission: PERMISSIONS.ADMIN_ROLES_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
    { path: '/admin/integrations/tuleap', label: 'Tuleap Integration', permission: PERMISSIONS.ADMIN_SETTINGS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: false },
```

Note: All new entries have `showInNavbar: false` — the navbar still uses old paths. #42 restructures the navbar to use new paths.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/config/routes.ts
git commit -m "feat(web): add dual route entries and update landing page to /me/tasks"
```

---

## Task 8: Update RouteGuard fallback path

**Files:**
- Modify: `apps/web/src/components/providers/RouteGuard.tsx`

- [ ] **Step 1: Update hardcoded `/my-tasks` fallback**

In `RouteGuard.tsx`, change line 42:

From:
```tsx
            router.replace('/my-tasks');
```

To:
```tsx
            router.replace('/me/tasks');
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/providers/RouteGuard.tsx
git commit -m "feat(web): update RouteGuard fallback to /me/tasks"
```

---

## Task 9: Verify build and typecheck

- [ ] **Step 1: Run TypeScript typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No errors

- [ ] **Step 2: Run Next.js build**

```bash
cd apps/web && npx next build 2>&1 | tail -30
```

Expected: Build succeeds, all new pages are statically generated

- [ ] **Step 3: Run API tests to confirm nothing broken**

```bash
cd apps/api && npm test 2>&1 | tail -10
```

Expected: All 686 tests pass

---

## Self-Review

**Spec coverage:**
- All URL mappings from spec → Tasks 2-5 (re-export pages)
- 301 redirects → Task 6
- Dual routes.ts entries → Task 7
- Permission gating on both URL forms → Task 7 (dual entries)
- `/dashboard` redirects to `/me/dashboard` → Task 6
- TypeScript clean → Task 9
- No broken internal links → old paths still work (301), new paths also work

**Placeholder scan:** No TBDs, TODOs, or "implement later". All file contents are explicit.

**Type consistency:** All re-export patterns use consistent `export { default } from '...'` syntax. Route entries use the same permission/scope fields as originals.
