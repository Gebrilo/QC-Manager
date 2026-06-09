# Audit Run — <YYYY-MM-DD> (<env>)

> Copy this file to `runs/<YYYY-MM-DD>-<env>-run.md` at the start of an audit; fill in as you go.

## Environment

- URL: <https://gebrils.cloud>
- Test user: <admin email>
- Browser: Chromium (Browserbase)
- Started: <ISO timestamp>
- Finished: <ISO timestamp>
- Run mode: <Playwright | manual | hybrid>

## Coverage

One row per route from `inventory.md` that was attempted this run.

| Page | Spec file | Status | Findings |
| --- | --- | --- | --- |
| Dashboard | `pages/dashboard.md` | pass / findings / blocked / skipped | 0 |

Status values:
- `pass` — every check in the spec passed
- `findings` — at least one finding filed (count in the Findings column)
- `blocked` — page could not be audited (e.g. 5xx all run)
- `skipped` — spec status was not `reviewed`, so not audited this run

## Findings filed

One bullet per `gh issue create` performed this run.

- #<num> [audit][<type>][<page>] <title> — <severity>

## Findings re-confirmed (dedup hits)

- #<num> still reproducing — added comment with fresh evidence

## Skipped / blocked

- <Page>: <reason>

## Cleanup gaps

Any data the agent created that it could not delete at end-of-run.

## Notes — needs human eyes

Free-form observations the agent wants to surface.
