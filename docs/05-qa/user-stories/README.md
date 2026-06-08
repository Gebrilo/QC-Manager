# QC-Manager — Role User Stories

Standalone user story files for each built-in role, written in Agile Given/When/Then format.
Intended for use by human testers or automated agents (Playwright, etc.) to verify role behaviour.

## Files

| Role | File | Notes |
|------|------|-------|
| Tester | [tester.md](tester.md) | Canonical QA authoring + execution role |
| Project Manager | [pm.md](pm.md) | Read + export; project-scoped visibility |
| Team Manager | [team-manager.md](team-manager.md) | Inherits tester; adds team management + governance approval |
| Manager (legacy) | [manager.md](manager.md) | Backwards-compatible alias for `team_manager` |
| User (legacy) | [user.md](user.md) | Backwards-compatible alias for `tester` |

## Relationship to Role Scenario Docs

The detailed step-by-step test scenarios live in `docs/05-qa/ui-role-scenarios/roles/`.
These user story files are the *intent* layer — they describe what each role needs to accomplish.
Use them to guide exploratory testing or to seed automated test suites.

## Story ID Convention

| Prefix | Role |
|--------|------|
| `US-T` | Tester |
| `US-PM` | Project Manager |
| `US-TM` | Team Manager |
| `US-MG` | Manager (legacy) |
| `US-U` | User (legacy) |
