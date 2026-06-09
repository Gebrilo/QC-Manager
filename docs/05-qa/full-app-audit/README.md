# QC-Manager Full-App Audit Pack

This pack is the contract for an end-to-end functional and UX sweep of QC-Manager. It is the sibling of `docs/05-qa/ui-role-scenarios/`, which covers RBAC per role. **This pack covers everything else**: every page, every interactive control, UX heuristics, data integrity, and known historical traps.

A single audit run is driven by an agent (Playwright via the `playwright-cli` skill is the primary execution model) or by a human tester. Same MD specs serve both. Findings are filed as GitHub issues using the conventions in `bug-reporting.md`.

## Pack contents

| File | Purpose |
| --- | --- |
| `README.md` | This file. |
| `setup.md` | Admin user, baseline data, URLs, browser notes. Read first. |
| `bug-reporting.md` | GitHub issue conventions: title format, labels, severity rubric, body template, dedup rule. |
| `ux-heuristics.md` | Global UX checklist applied to every page. |
| `inventory.md` | Every route under `apps/web/app/` → its `pages/<page>.md` spec file. Coverage checklist. |
| `pages/_template.md` | Canonical per-page spec template. Copy this when drafting a new page spec. |
| `pages/<page>.md` | Per-page spec: control inventory, happy paths, edge cases, page-specific UX checks, known traps. |
| `runs/YYYY-MM-DD-<env>-run.md` | Audit run reports (produced output). |
| `discovery-prompt.md` | The prompt operator gives to an agent to kick off Phase 2 (per-page spec drafting from the live app). |

## Source-of-truth files in the codebase

The pack documents observed behavior, but the codebase is the authority. When the two disagree, fix the spec or file an issue against the code.

- **Routes:** `apps/web/app/**/page.tsx`
- **RBAC catalog:** `apps/shared/rbac/catalog.ts`
- **UI route guards:** `apps/web/src/config/routes.ts`, `apps/web/src/components/providers/RouteGuard.tsx`
- **UI permission checks:** `apps/web/src/components/providers/AuthProvider.tsx`
- **API permission middleware:** `apps/api/src/middleware/authMiddleware.js`
- **Historical incidents / known traps:** `CLAUDE.md` (root) and the `qc-manager-testing` skill

## How to invoke the audit agent (Phase 3, the real sweep)

```text
You are running an audit of QC-Manager. Read in order:

  1. docs/05-qa/full-app-audit/README.md (this file)
  2. docs/05-qa/full-app-audit/setup.md — log in as admin per the instructions
  3. docs/05-qa/full-app-audit/bug-reporting.md — memorize labels, severity rubric, title format, dedup rule
  4. docs/05-qa/full-app-audit/ux-heuristics.md — memorize the global checks
  5. docs/05-qa/full-app-audit/inventory.md — ordered list of pages to audit

For each page in inventory.md in order:
  - Open docs/05-qa/full-app-audit/pages/<page>.md
  - Navigate to the route via Playwright (playwright-cli skill)
  - Walk the Control Inventory; for every control verify Expected and Must NOT happen
  - Run every Happy Path Scenario; verify data via the listed API check
  - Walk Negative / Edge Cases
  - Apply ux-heuristics.md globally
  - Apply this page's UX Checks Specific To This Page
  - Verify Known Traps explicitly

For every finding:
  - Classify type (bug | ux | enhancement) and severity (critical | high | medium | low)
  - Run `gh issue list --state open --search "[audit][<type>][<page>] <keyword>"` to dedup
  - If new: capture a screenshot, build the body from bug-reporting.md's template, run `gh issue create` with labels
  - If existing: `gh issue comment` with "still reproducing on <date>" and fresh evidence
  - Append the finding to runs/<date>-<env>-run.md

At end of run, write the full per-run audit report at runs/<date>-<env>-run.md.
```

To kick off **Phase 2** (drafting per-page specs from the live app, one-time prerequisite to Phase 3), see `discovery-prompt.md`.

## Related packs

- `docs/05-qa/ui-role-scenarios/` — RBAC per role; complement to this pack.
- `docs/05-qa/user-stories/` — role-level user journeys.
