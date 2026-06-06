# Shared UI Scenario Setup

Use this setup before running any role scenario.

## Environment

1. Start the app with `docker compose up -d` or use the deployed environment.
2. Confirm the web app loads at the target base URL.
3. Confirm API calls are pointed at the matching API environment through `NEXT_PUBLIC_API_URL`.
4. Use a clean browser context per role.
5. Keep browser devtools network capture enabled when possible.

## Test Accounts

Create or identify one account for each role:

| Placeholder | Required role | Required status | Required data relationship |
| --- | --- | --- | --- |
| `ADMIN_USER` | `admin` | `ACTIVE` | None. |
| `TEAM_MANAGER_USER` | `team_manager` | `ACTIVE` | Manages Team A. |
| `MANAGER_ALIAS_USER` | `manager` | `ACTIVE` | Manages Team A. |
| `PM_USER` | `pm` | `ACTIVE` | Project manager for Project A only. |
| `MEMBER_A_USER` | `member` | `ACTIVE` | Member of Team A, owns or is assigned some artifacts. |
| `MEMBER_B_USER` | `member` | `ACTIVE` | Member of Team B, owns or is assigned comparison artifacts. |
| `TESTER_USER` | `tester` | `ACTIVE` | Can create work and test artifacts. |
| `VIEWER_USER` | `viewer` | `ACTIVE` | Has no create/edit/delete overrides. |
| `CONTRIBUTOR_USER` | `contributor` | `PREPARATION` | Has onboarding journey and assigned personal tasks. |
| `USER_ALIAS_USER` | `user` | `ACTIVE` | Legacy alias for tester. |

## Required Seed Data

Use data names that are easy to find in the UI:

- Team A and Team B.
- Project A owned by or associated with Team A.
- Project B owned by or associated with Team B.
- PM User assigned as project manager for Project A only.
- At least one task, story, bug, test case, test suite, and test run in Project A.
- At least one task, story, bug, test case, test suite, and test run in Project B.
- At least one artifact assigned to `MEMBER_A_USER`.
- At least one artifact assigned to `MEMBER_B_USER`.
- At least one onboarding journey assigned to `CONTRIBUTOR_USER`.
- At least one development plan for `MEMBER_A_USER`.

## Universal Checks For Every Role

Run these before role-specific scenarios:

1. Log in with the role account.
2. Confirm `/login` redirects to the role landing page after login.
3. Confirm the user menu or profile state identifies the expected account.
4. Open `/me/preferences` and confirm it is accessible.
5. Sign out and confirm protected pages redirect to `/login`.

## Evidence Format

For every scenario, record:

```text
Scenario ID:
Role:
Account:
Result: PASS | FAIL | BLOCKED
Observed:
Expected:
Evidence:
Notes:
```

## Data Safety

- Prefix created records with `RBAC UI <role> <timestamp>`.
- Prefer soft-delete cleanup through the UI where supported.
- Do not reuse records from another role scenario unless the scenario explicitly checks cross-role visibility.

