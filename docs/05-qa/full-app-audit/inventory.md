# Inventory — Full-App Audit

Master coverage checklist. Every route under `apps/web/app/` appears here exactly once.

## Status legend

- `not drafted` — `pages/<slug>.md` does not yet exist
- `drafted` — spec exists, awaiting human review
- `reviewed` — spec reviewed and approved; ready for audit runs
- `audited` — at least one audit run completed
- `blocked` — cannot be audited until something else is fixed

## Routes

| # | Route | Source | Spec | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `/admin/integrations/tuleap` | `apps/web/app/admin/integrations/tuleap/page.tsx` | `pages/admin-integrations-tuleap.md` | not drafted | |
| 2 | `/admin/journeys/[id]` | `apps/web/app/admin/journeys/[id]/page.tsx` | `pages/admin-journeys-id-detail.md` | not drafted | |
| 3 | `/admin/journeys` | `apps/web/app/admin/journeys/page.tsx` | `pages/admin-journeys.md` | not drafted | |
| 4 | `/admin` | `apps/web/app/admin/page.tsx` | `pages/admin.md` | not drafted | |
| 5 | `/admin/permissions/matrix` | `apps/web/app/admin/permissions/matrix/page.tsx` | `pages/admin-permissions-matrix.md` | not drafted | |
| 6 | `/admin/roles` | `apps/web/app/admin/roles/page.tsx` | `pages/admin-roles.md` | not drafted | |
| 7 | `/admin/teams` | `apps/web/app/admin/teams/page.tsx` | `pages/admin-teams.md` | not drafted | |
| 8 | `/admin/users` | `apps/web/app/admin/users/page.tsx` | `pages/admin-users.md` | not drafted | |
| 9 | `/auth/confirmed` | `apps/web/app/auth/confirmed/page.tsx` | `pages/auth-confirmed.md` | not drafted | |
| 10 | `/auth/reset-password` | `apps/web/app/auth/reset-password/page.tsx` | `pages/auth-reset-password.md` | not drafted | |
| 11 | `/bugs` | `apps/web/app/bugs/page.tsx` | `pages/bugs.md` | not drafted | |
| 12 | `/dashboard` | `apps/web/app/dashboard/page.tsx` | `pages/dashboard.md` | not drafted | |
| 13 | `/dashboards/member` | `apps/web/app/dashboards/member/page.tsx` | `pages/dashboards-member.md` | not drafted | |
| 14 | `/dashboards/pm` | `apps/web/app/dashboards/pm/page.tsx` | `pages/dashboards-pm.md` | not drafted | |
| 15 | `/dashboards/team-manager` | `apps/web/app/dashboards/team-manager/page.tsx` | `pages/dashboards-team-manager.md` | not drafted | |
| 16 | `/governance` | `apps/web/app/governance/page.tsx` | `pages/governance.md` | not drafted | |
| 17 | `/login` | `apps/web/app/login/page.tsx` | `pages/login.md` | not drafted | |
| 18 | `/me/dashboard` | `apps/web/app/me/dashboard/page.tsx` | `pages/me-dashboard.md` | not drafted | |
| 19 | `/me/idp/history/[planId]` | `apps/web/app/me/idp/history/[planId]/page.tsx` | `pages/me-idp-history-planId-detail.md` | not drafted | |
| 20 | `/me/idp/history` | `apps/web/app/me/idp/history/page.tsx` | `pages/me-idp-history.md` | not drafted | |
| 21 | `/me/idp` | `apps/web/app/me/idp/page.tsx` | `pages/me-idp.md` | not drafted | |
| 22 | `/me/journeys/[id]` | `apps/web/app/me/journeys/[id]/page.tsx` | `pages/me-journeys-id-detail.md` | not drafted | |
| 23 | `/me/journeys` | `apps/web/app/me/journeys/page.tsx` | `pages/me-journeys.md` | not drafted | |
| 24 | `/me/preferences` | `apps/web/app/me/preferences/page.tsx` | `pages/me-preferences.md` | not drafted | |
| 25 | `/me/tasks` | `apps/web/app/me/tasks/page.tsx` | `pages/me-tasks.md` | not drafted | |
| 26 | `/page.tsx` | `apps/web/app/page.tsx` | `pages/page.tsx.md` | not drafted | |
| 27 | `/qa/cases` | `apps/web/app/qa/cases/page.tsx` | `pages/qa-cases.md` | not drafted | |
| 28 | `/qa/suites` | `apps/web/app/qa/suites/page.tsx` | `pages/qa-suites.md` | not drafted | |
| 29 | `/quality/governance` | `apps/web/app/quality/governance/page.tsx` | `pages/quality-governance.md` | not drafted | |
| 30 | `/quality/projects` | `apps/web/app/quality/projects/page.tsx` | `pages/quality-projects.md` | not drafted | |
| 31 | `/quality/reports` | `apps/web/app/quality/reports/page.tsx` | `pages/quality-reports.md` | not drafted | |
| 32 | `/quality/results` | `apps/web/app/quality/results/page.tsx` | `pages/quality-results.md` | not drafted | |
| 33 | `/quality/runs` | `apps/web/app/quality/runs/page.tsx` | `pages/quality-runs.md` | not drafted | |
| 34 | `/quality/stories` | `apps/web/app/quality/stories/page.tsx` | `pages/quality-stories.md` | not drafted | |
| 35 | `/quality/tasks` | `apps/web/app/quality/tasks/page.tsx` | `pages/quality-tasks.md` | not drafted | |
| 36 | `/register` | `apps/web/app/register/page.tsx` | `pages/register.md` | not drafted | |
| 37 | `/reports` | `apps/web/app/reports/page.tsx` | `pages/reports.md` | not drafted | |
| 38 | `/resources` | `apps/web/app/resources/page.tsx` | `pages/resources.md` | not drafted | |
| 39 | `/team/development-plans` | `apps/web/app/team/development-plans/page.tsx` | `pages/team-development-plans.md` | not drafted | |
| 40 | `/team/history` | `apps/web/app/team/history/page.tsx` | `pages/team-history.md` | not drafted | |
| 41 | `/team/idp/[userId]` | `apps/web/app/team/idp/[userId]/page.tsx` | `pages/team-idp-userId-detail.md` | not drafted | |
| 42 | `/team/idp` | `apps/web/app/team/idp/page.tsx` | `pages/team-idp.md` | not drafted | |
| 43 | `/team/journeys/[userId]/[journeyId]` | `apps/web/app/team/journeys/[userId]/[journeyId]/page.tsx` | `pages/team-journeys-userId-detail-journeyId-detail.md` | not drafted | |
| 44 | `/team/journeys` | `apps/web/app/team/journeys/page.tsx` | `pages/team-journeys.md` | not drafted | |
| 45 | `/team/resources/[id]` | `apps/web/app/team/resources/[id]/page.tsx` | `pages/team-resources-id-detail.md` | not drafted | |
| 46 | `/team/resources/create` | `apps/web/app/team/resources/create/page.tsx` | `pages/team-resources-create.md` | not drafted | |
| 47 | `/team/resources` | `apps/web/app/team/resources/page.tsx` | `pages/team-resources.md` | not drafted | |
| 48 | `/test/cases/[id]/edit` | `apps/web/app/test/cases/[id]/edit/page.tsx` | `pages/test-cases-id-detail-edit.md` | not drafted | |
| 49 | `/test/cases/[id]` | `apps/web/app/test/cases/[id]/page.tsx` | `pages/test-cases-id-detail.md` | not drafted | |
| 50 | `/test/cases/bulk-upload` | `apps/web/app/test/cases/bulk-upload/page.tsx` | `pages/test-cases-bulk-upload.md` | not drafted | |
| 51 | `/test/cases/create` | `apps/web/app/test/cases/create/page.tsx` | `pages/test-cases-create.md` | not drafted | |
| 52 | `/test/cases` | `apps/web/app/test/cases/page.tsx` | `pages/test-cases.md` | not drafted | |
| 53 | `/test/results` | `apps/web/app/test/results/page.tsx` | `pages/test-results.md` | not drafted | |
| 54 | `/test/results/upload` | `apps/web/app/test/results/upload/page.tsx` | `pages/test-results-upload.md` | not drafted | |
| 55 | `/test/runs/[id]` | `apps/web/app/test/runs/[id]/page.tsx` | `pages/test-runs-id-detail.md` | not drafted | |
| 56 | `/test/runs/create` | `apps/web/app/test/runs/create/page.tsx` | `pages/test-runs-create.md` | not drafted | |
| 57 | `/test/runs` | `apps/web/app/test/runs/page.tsx` | `pages/test-runs.md` | not drafted | |
| 58 | `/test/suites/[id]/edit` | `apps/web/app/test/suites/[id]/edit/page.tsx` | `pages/test-suites-id-detail-edit.md` | not drafted | |
| 59 | `/test/suites/[id]` | `apps/web/app/test/suites/[id]/page.tsx` | `pages/test-suites-id-detail.md` | not drafted | |
| 60 | `/test/suites/create` | `apps/web/app/test/suites/create/page.tsx` | `pages/test-suites-create.md` | not drafted | |
| 61 | `/test/suites` | `apps/web/app/test/suites/page.tsx` | `pages/test-suites.md` | not drafted | |
| 62 | `/work/bugs/[id]/edit` | `apps/web/app/work/bugs/[id]/edit/page.tsx` | `pages/work-bugs-id-detail-edit.md` | not drafted | |
| 63 | `/work/bugs/[id]` | `apps/web/app/work/bugs/[id]/page.tsx` | `pages/work-bugs-id-detail.md` | not drafted | |
| 64 | `/work/bugs/create` | `apps/web/app/work/bugs/create/page.tsx` | `pages/work-bugs-create.md` | not drafted | |
| 65 | `/work/bugs` | `apps/web/app/work/bugs/page.tsx` | `pages/work-bugs.md` | not drafted | |
| 66 | `/work/projects/[id]/edit` | `apps/web/app/work/projects/[id]/edit/page.tsx` | `pages/work-projects-id-detail-edit.md` | not drafted | |
| 67 | `/work/projects/[id]` | `apps/web/app/work/projects/[id]/page.tsx` | `pages/work-projects-id-detail.md` | not drafted | |
| 68 | `/work/projects/[id]/quality` | `apps/web/app/work/projects/[id]/quality/page.tsx` | `pages/work-projects-id-detail-quality.md` | not drafted | |
| 69 | `/work/projects/create` | `apps/web/app/work/projects/create/page.tsx` | `pages/work-projects-create.md` | not drafted | |
| 70 | `/work/projects` | `apps/web/app/work/projects/page.tsx` | `pages/work-projects.md` | not drafted | |
| 71 | `/work/stories/[id]/edit` | `apps/web/app/work/stories/[id]/edit/page.tsx` | `pages/work-stories-id-detail-edit.md` | not drafted | |
| 72 | `/work/stories/[id]` | `apps/web/app/work/stories/[id]/page.tsx` | `pages/work-stories-id-detail.md` | not drafted | |
| 73 | `/work/stories/create` | `apps/web/app/work/stories/create/page.tsx` | `pages/work-stories-create.md` | not drafted | |
| 74 | `/work/stories` | `apps/web/app/work/stories/page.tsx` | `pages/work-stories.md` | not drafted | |
| 75 | `/work/tasks/[id]/edit` | `apps/web/app/work/tasks/[id]/edit/page.tsx` | `pages/work-tasks-id-detail-edit.md` | not drafted | |
| 76 | `/work/tasks/[id]` | `apps/web/app/work/tasks/[id]/page.tsx` | `pages/work-tasks-id-detail.md` | not drafted | |
| 77 | `/work/tasks/create` | `apps/web/app/work/tasks/create/page.tsx` | `pages/work-tasks-create.md` | not drafted | |
| 78 | `/work/tasks` | `apps/web/app/work/tasks/page.tsx` | `pages/work-tasks.md` | not drafted | |

## Coverage summary

- Total routes: 78
- Drafted: 0
- Reviewed: 0
- Audited: 0
- Blocked: 0
