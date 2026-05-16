# Issue #41: New URL Plan with 301 Redirects — Design Spec

**Date:** 2026-05-15
**Status:** Draft
**Blocks:** #42, #46

## Goal

Add new URL paths alongside existing paths. Old URLs 301 redirect to new. Both URL sets work during this slice. Cutover (deleting old paths) happens in #46.

## URL Mapping Table

| Old Path | New Path |
|----------|----------|
| `/my-tasks` | `/me/tasks` |
| `/journeys` | `/me/journeys` |
| `/journeys/[id]` | `/me/journeys/[id]` |
| `/development-plan` | `/me/idp` |
| `/development-plan/history` | `/me/idp/history` |
| `/development-plan/history/[planId]` | `/me/idp/history/[planId]` |
| `/my-dashboard` | `/me/dashboard` |
| `/preferences` | `/me/preferences` |
| `/tasks` | `/work/tasks` |
| `/tasks/create` | `/work/tasks/create` |
| `/tasks/[id]` | `/work/tasks/[id]` |
| `/tasks/[id]/edit` | `/work/tasks/[id]/edit` |
| `/projects` | `/work/projects` |
| `/projects/create` | `/work/projects/create` |
| `/projects/[id]` | `/work/projects/[id]` |
| `/projects/[id]/edit` | `/work/projects/[id]/edit` |
| `/projects/[id]/quality` | `/work/projects/[id]/quality` |
| `/bugs` | `/work/bugs` |
| `/bugs/create` | `/work/bugs/create` |
| `/bugs/[id]` | `/work/bugs/[id]` |
| `/bugs/[id]/edit` | `/work/bugs/[id]/edit` |
| `/user-stories/[id]` | `/work/stories/[id]` |
| `/user-stories/[id]/edit` | `/work/stories/[id]/edit` |
| `/user-stories/create` | `/work/stories/create` |
| `/test-cases` | `/test/cases` |
| `/test-cases/create` | `/test/cases/create` |
| `/test-cases/[id]` | `/test/cases/[id]` |
| `/test-cases/[id]/edit` | `/test/cases/[id]/edit` |
| `/test-suites` | `/test/suites` |
| `/test-suites/create` | `/test/suites/create` |
| `/test-suites/[id]` | `/test/suites/[id]` |
| `/test-suites/[id]/edit` | `/test/suites/[id]/edit` |
| `/test-executions` | `/test/runs` |
| `/test-runs/create` | `/test/runs/create` |
| `/test-runs/[id]` | `/test/runs/[id]` |
| `/test-results` | `/test/results` |
| `/test-results/upload` | `/test/results/upload` |
| `/governance` | `/quality/governance` |
| `/reports` | `/quality/reports` |
| `/dashboard` | `/me/dashboard` (redirect only; no new page at `/dashboard`) |
| `/resources` | `/team/resources` |
| `/resources/create` | `/team/resources/create` |
| `/resources/[id]` | `/team/resources/[id]` |
| `/manage-development-plans` | `/team/idp` |
| `/manage-development-plans/[userId]` | `/team/idp/[userId]` |
| `/settings/team-journeys` | `/team/journeys` |
| `/settings/team-journeys/[userId]/[journeyId]` | `/team/journeys/[userId]/[journeyId]` |
| `/task-history` | `/team/history` |
| `/users` | `/admin/users` |
| `/settings/teams` | `/admin/teams` |
| `/settings/journeys` | `/admin/journeys` |
| `/settings/journeys/[id]` | `/admin/journeys/[id]` |
| `/settings/roles` | `/admin/roles` |
| `/settings/tuleap` | `/admin/integrations/tuleap` |
| `/settings` | `/admin` |

## Architecture

### 1. Re-export page files

New page files at new paths re-export from old paths. Old pages remain source of truth.

Pattern:
```tsx
// apps/web/app/me/tasks/page.tsx
export { default } from '../../my-tasks/page';
```

For pages with layouts, also create a re-export layout:
```tsx
// apps/web/app/work/tasks/layout.tsx
export { default } from '../../tasks/layout';
```

For nested dynamic routes, the relative path depth increases accordingly.

### 2. 301 redirects in `next.config.js`

Add `redirects()` to `next.config.js` with `permanent: true`. Each old URL redirects to its new counterpart.

Dynamic route patterns use Next.js colon syntax:
```js
{
  source: '/tasks/:id',
  destination: '/work/tasks/:id',
  permanent: true,
}
```

The `/dashboard` redirect to `/me/dashboard` is included here. In slice #46, `/dashboard` will be changed to return 410 or 404.

### 3. `routes.ts` dual entries

Add new-path entries to the `ROUTES` array alongside existing entries. Both share the same permission/scope/icon config. This allows `getRouteConfig()` to match either path.

Update `DEFAULT_LANDING` from `/my-tasks` to `/me/tasks`.
Update `getLandingPage()` fallback accordingly.

No changes to navbar rendering in this slice — that's #42.

### 4. Out of scope

- Navbar restructure (#42)
- Deleting old URLs (#46)
- `/dashboard` returning 410/404 (#46)
- New sidebar sections (#42)

## Acceptance Criteria

- All new URLs serve the same content as their old counterparts
- Old URLs 301 redirect to new URLs
- Both URL sets are accessible (cutover in #46)
- Permission gating applies to both URL forms
- `/dashboard` redirects to `/me/dashboard`
- TypeScript compiles clean
- No broken internal links

## Cleanup

- **Delete `apps/web/app/test/page.tsx`:** Dev artifact ("Test Page Working") not referenced in `routes.ts`. The new `/test/*` directory structure will shadow it; removing avoids confusion.

## Risks

- **Relative import depth:** Each re-export file needs correct relative path to old page. Script generation mitigates this.
- **Layout nesting:** Some routes have layouts (e.g. `/tasks/layout.tsx`). New paths need corresponding layout re-exports to avoid Next.js default layout breaking styling. Auth-related layouts (`/login`, `/register`) are NOT duplicated since auth routes are not part of this URL plan.
- **Build size:** ~65 thin re-export files add negligible bundle size but increase file count.
