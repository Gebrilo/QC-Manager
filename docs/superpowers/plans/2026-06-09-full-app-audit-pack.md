# Full-App Audit Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the `docs/05-qa/full-app-audit/` pack (top-level contracts + per-page template + route inventory + Phase-2 discovery prompt) and create the GitHub labels the audit agent will use, so a subsequent audit run can populate per-page specs from the live app and file findings as labelled GitHub issues.

**Architecture:** A documentation-only pack consisting of (a) five top-level contract files the agent reads at start-of-run (`README.md`, `setup.md`, `bug-reporting.md`, `ux-heuristics.md`, `inventory.md`), (b) a per-page MD template the agent fills in during Phase 2, (c) a `runs/` folder for per-run audit reports, and (d) a `discovery-prompt.md` file containing the canonical prompt to kick off Phase 2 against an agent. GitHub labels (`source:audit`, `type:*`, `severity:*`, `area:*`) are created via `gh label create` so audit issues can be filtered and triaged consistently.

**Tech Stack:** Markdown, `gh` CLI (GitHub label management), `git`. No application code changes in Phase 1.

**Source spec:** `docs/superpowers/specs/2026-06-09-full-app-audit-design.md`

**Scope of this plan:** Phase 1 only (pack scaffolding) plus the Phase 2 kickoff artifact. Phase 2 (discovery / per-page authoring) is an audit-agent run, not a coding task, and is invoked separately after this plan completes. Phase 3 and 4 are operational and outside any code-plan scope.

---

## File Structure

Files created by this plan:

| Path | Responsibility |
|---|---|
| `docs/05-qa/full-app-audit/README.md` | Pack purpose, how to invoke an agent, links to source-of-truth files in the codebase |
| `docs/05-qa/full-app-audit/setup.md` | Admin user provisioning, baseline data, URLs (prod + staging), browser/Playwright notes |
| `docs/05-qa/full-app-audit/bug-reporting.md` | GitHub issue conventions: title format, labels, severity rubric, body template, dedup rule |
| `docs/05-qa/full-app-audit/ux-heuristics.md` | Global UX checklist applied to every page |
| `docs/05-qa/full-app-audit/inventory.md` | Master route → spec file mapping (coverage checklist), every route from `apps/web/app/` |
| `docs/05-qa/full-app-audit/pages/_template.md` | The canonical per-page template the agent copies to draft each spec in Phase 2 |
| `docs/05-qa/full-app-audit/pages/.gitkeep` | Keeps the pages folder in git pre-Phase-2 |
| `docs/05-qa/full-app-audit/runs/_template.md` | Canonical per-run audit report template the agent fills out at end-of-run |
| `docs/05-qa/full-app-audit/runs/.gitkeep` | Keeps the runs folder in git pre-Phase-3 |
| `docs/05-qa/full-app-audit/discovery-prompt.md` | The prompt operator gives to an agent to kick off Phase 2 |

Files modified by this plan:

| Path | Change |
|---|---|
| `docs/05-qa/ui-role-scenarios/README.md` | Add a "Related packs" link to the new full-app-audit pack |

GitHub side-effects created by this plan (via `gh label create`):

- `source:audit`, `type:bug`, `type:ux`, `type:enhancement`
- `severity:critical`, `severity:high`, `severity:medium`, `severity:low`
- `area:web`, `area:api`, `area:data`

Page-scoped labels (`page:dashboard`, `page:bugs`, …) are **not** pre-created — the audit agent creates them lazily when filing the first finding against a page. This avoids label sprawl for routes that never get findings.

---

## Task 1: Create the pack directory and the README

**Files:**
- Create: `docs/05-qa/full-app-audit/README.md`
- Create: `docs/05-qa/full-app-audit/pages/.gitkeep`
- Create: `docs/05-qa/full-app-audit/runs/.gitkeep`

- [ ] **Step 1: Create the pack directories**

Run from the repo root:
```bash
mkdir -p docs/05-qa/full-app-audit/pages docs/05-qa/full-app-audit/runs
touch docs/05-qa/full-app-audit/pages/.gitkeep docs/05-qa/full-app-audit/runs/.gitkeep
```

Expected: no output, both `.gitkeep` files exist.

- [ ] **Step 2: Write README.md**

Write the following exact content to `docs/05-qa/full-app-audit/README.md`:

````markdown
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
- **Historical incidents / known traps:** `CLAUDE.md` (root) and `/root/.claude/skills/qc-manager/SKILL.md`

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
````

- [ ] **Step 3: Verify the README parses and references all expected sections**

Run:
```bash
grep -E "^## " docs/05-qa/full-app-audit/README.md
```
Expected output (in this order):
```
## Pack contents
## Source-of-truth files in the codebase
## How to invoke the audit agent (Phase 3, the real sweep)
## Related packs
```

- [ ] **Step 4: Commit**

```bash
git add docs/05-qa/full-app-audit/README.md \
        docs/05-qa/full-app-audit/pages/.gitkeep \
        docs/05-qa/full-app-audit/runs/.gitkeep
git commit -m "docs(audit): scaffold full-app-audit pack with README"
```

---

## Task 2: Write setup.md

**Files:**
- Create: `docs/05-qa/full-app-audit/setup.md`

- [ ] **Step 1: Write setup.md**

Write the following exact content to `docs/05-qa/full-app-audit/setup.md`:

````markdown
# Setup — Full-App Audit

Read this before any audit run. Same setup applies whether the agent uses Playwright, raw API calls, or a human tester walks through manually.

## Environments

| Env | Web URL | API URL | When to use |
| --- | --- | --- | --- |
| Production | https://gebrils.cloud | https://api.gebrils.cloud | Quarterly full sweeps; spot-checks after a production deploy |
| Staging | https://staging.gebrils.cloud (if provisioned) or whatever `/opt/qc-manager-staging` is exposing | matching staging API | Pre-release validation; the place to file new findings before they reach prod |

**Default audit target:** staging. Only sweep production after staging is green.

API health check (run before starting any audit):
```bash
curl -s https://api.gebrils.cloud/api/health
```
Expected: `{"status":"ok"}` or similar 200 body. **Note:** the health endpoint is `/api/health`, not `/health`.

## Admin test user

Log in as an admin user — admin has wildcard access (`*`) per `apps/shared/rbac/catalog.ts`, so this single user can reach every page.

- **Email:** _(fill in the audit admin email — coordinate with the project owner; do not commit credentials here)_
- **Password / magic link:** _(coordinate with the project owner; if SSO/magic-link only, see "Magic-link automation" below)_

> The placeholder lines above are intentional. Real credentials live in a private location (1Password / vault / `.env`). When provisioning the audit agent, paste creds into the agent's session config, never into this file.

### Magic-link automation

If the admin user only supports magic-link auth, the audit agent needs an inbox the link arrives at. Two options:

1. **Dedicated audit mailbox.** Provision an account whose inbox the agent can read (e.g. via IMAP) and parse for the magic-link URL. Document the mailbox host in the agent's session config.
2. **Issue a direct token.** Run a one-off script on the VPS that signs a JWT with the same secret the API uses, and hand the agent the token. See the `JWT_SECRET` notes in `/root/.claude/skills/qc-manager/SKILL.md`.

Pick whichever is in place when Phase 3 starts; this file is updated to record the choice.

## Baseline data prerequisites

Before sweeping, confirm the target environment has enough data for the per-page scenarios to be meaningful. If a value below is zero on the target environment, that environment may not be ready for an audit.

| Entity | Minimum count | Notes |
| --- | --- | --- |
| Projects | 2 | At least one with active tasks and one with bugs |
| Tasks | 10 | Mixed status / priority / project |
| Bugs | 5 | Mixed `status` and `severity`. Check both canonical labels (`New`, `In Progress`, …) — see `bugs_status_canonical` constraint |
| Test cases | 5 | Linked to at least one task |
| Test executions | 3 | Across different dates (so trend chart has more than one point) |
| Resources | 3 | At least one with `owner_resource_id` matching a bug |

Quick sanity check from the VPS:
```bash
docker exec supabase-db psql -U postgres -d postgres -c "
  SELECT 'projects' AS entity, count(*) FROM project
  UNION ALL SELECT 'tasks', count(*) FROM task
  UNION ALL SELECT 'bugs', count(*) FROM bug
  UNION ALL SELECT 'test_cases', count(*) FROM test_case
  UNION ALL SELECT 'test_executions', count(*) FROM test_execution
  UNION ALL SELECT 'resources', count(*) FROM resource;"
```

> Always query `supabase-db`, never `qc-postgres` — `qc-api` connects to Supabase only.

If baseline data is missing on staging: seed it before the audit. Do not seed production. If production has insufficient data for a scenario, mark the scenario as `blocked` in the run report and move on.

## Browser / Playwright configuration

- Default browser: Chromium (latest). Mobile breakpoint tests use viewport 375×812 (iPhone SE-ish).
- Time zone: UTC for run reports; the UI may render local time — note both in evidence.
- Disable browser auto-fill for forms; auto-fill can mask validation bugs.
- Capture console errors and failed network requests for the entire run; attach excerpts to findings.

## Test data isolation

Any data the agent creates during a run **must** use a recognisable prefix so cleanup is trivial:

- Bugs / tasks / stories created by the agent: title starts with `[AUDIT-YYYY-MM-DD]`
- Resources / users created by the agent: name starts with `audit-`
- Files uploaded by the agent: filename starts with `audit-`

At end of run, the agent attempts to delete every record it created. If deletion fails, list the leftover records in the run report under "Cleanup gaps."

## Stop conditions

The audit agent must stop and surface for human review (rather than silently continuing) if:

- The login flow itself fails — every downstream check would be invalid.
- More than three consecutive pages return 5xx — likely an infra problem, not a per-page bug.
- A finding looks security-sensitive (auth bypass, exposed PII, leaked secrets in network responses). File the issue privately if possible, then stop.
````

- [ ] **Step 2: Verify expected sections exist**

Run:
```bash
grep -E "^## " docs/05-qa/full-app-audit/setup.md
```
Expected output (in this order):
```
## Environments
## Admin test user
## Baseline data prerequisites
## Browser / Playwright configuration
## Test data isolation
## Stop conditions
```

- [ ] **Step 3: Commit**

```bash
git add docs/05-qa/full-app-audit/setup.md
git commit -m "docs(audit): add setup.md for full-app audit pack"
```

---

## Task 3: Write bug-reporting.md

**Files:**
- Create: `docs/05-qa/full-app-audit/bug-reporting.md`

- [ ] **Step 1: Write bug-reporting.md**

Write the following exact content to `docs/05-qa/full-app-audit/bug-reporting.md`:

````markdown
# Bug Reporting — Full-App Audit

The contract for filing audit findings as GitHub issues. Every issue the agent files must follow this exactly. The conventions exist so we can filter `source:audit`, group by `page:*`, and triage by `severity:*` in one query.

## Title format

```
[audit][<type>][<page>] <one-line summary>
```

- `<type>` ∈ { `bug`, `ux`, `enh` }
- `<page>` is the spec file slug (the filename under `pages/` without `.md`)
- `<one-line summary>` is imperative-mood, < 80 chars, no trailing period

Examples:
- `[audit][bug][bugs] Status filter resets to "All" on page reload`
- `[audit][ux][dashboard] Empty state shows raw "null" instead of placeholder`
- `[audit][enh][resources] Task summary card lacks "view all" link`

## Labels (every audit issue gets all five groups)

| Group | Allowed values | Required? |
| --- | --- | --- |
| `source` | `audit` (literally this one label) | Yes — always |
| `type` | `type:bug`, `type:ux`, `type:enhancement` | Yes — exactly one |
| `severity` | `severity:critical`, `severity:high`, `severity:medium`, `severity:low` | Yes — exactly one |
| `page` | `page:<slug>` matching the spec file name | Yes — exactly one |
| `area` | `area:web`, `area:api`, `area:data` | Yes — exactly one (best guess where the root cause lives) |

If a `page:<slug>` label doesn't yet exist, the agent creates it on the fly:
```bash
gh label create "page:<slug>" --color BFD4F2 --description "Audit finding on the <slug> page"
```

## Severity rubric

| Level | Definition | Examples |
| --- | --- | --- |
| `critical` | Blocks core workflow, data loss, security, or production-breaking | Login broken; save action silently drops data; API 500 on a main page |
| `high` | Workflow degraded; user can finish but with friction or wrong data shown | Filter doesn't apply; summary card shows wrong count; action requires page refresh to take effect |
| `medium` | UX issue or minor functional bug with workaround | Empty state ugly; button label confusing; toast disappears too fast |
| `low` | Polish, enhancement, cosmetic | Misalignment; copy nit; missing tooltip |

When in doubt, pick the lower severity and note the uncertainty in the body. Inflation is the more common failure mode and burns the triage queue.

## Body template

Copy this verbatim; fill in the angle-bracketed placeholders.

```markdown
## Summary
<one paragraph: what's wrong>

## Steps to reproduce
1. Logged in as admin
2. Navigate to <route>
3. <action>
4. <observation>

## Expected
<copy the Expected line from the spec file>

## Actual
<what happened, including any console errors / network failures>

## Spec reference
- Pack: `docs/05-qa/full-app-audit/pages/<page>.md`
- Section: `<exact heading from that spec file>`

## Evidence
- Screenshot: <inline GitHub attachment>
- Console excerpt (if any):
  ```
  <copy/paste>
  ```
- Network excerpt (if any): `<METHOD> <url>` → `<status>` + response snippet

## Environment
- URL: <https://staging.gebrils.cloud or https://gebrils.cloud>
- Browser: <name + version>
- Audit run: `docs/05-qa/full-app-audit/runs/<run-file>.md`
```

## Dedup rule (run before every `gh issue create`)

```bash
gh issue list --state open \
  --search "[audit][<type>][<page>] <keyword>" \
  --json number,title
```

Parse the result:

- **Exact title match or near-match (≥ 0.8 cosine on the summary):** do **not** create a new issue. Instead:
  ```bash
  gh issue comment <number> --body-file /tmp/still-repro.md
  ```
  Where `/tmp/still-repro.md` contains: "Still reproducing on YYYY-MM-DD during audit run `<run-file>`." plus fresh evidence (screenshot, console excerpt).
- **No match:** create the issue with `gh issue create`.

## `gh issue create` shape

```bash
gh issue create \
  --title "[audit][<type>][<page>] <summary>" \
  --label "source:audit" \
  --label "type:<type>" \
  --label "severity:<level>" \
  --label "page:<slug>" \
  --label "area:<area>" \
  --body-file /tmp/finding-body.md
```

The agent writes the templated body to `/tmp/finding-body.md` (not as a heredoc on the command line — body content with backticks and code blocks breaks shell quoting).

## When in doubt: don't file

A finding has to be reproducible and meaningfully wrong against the spec. If the agent can't reproduce it twice in a row, or if the spec doesn't actually say what should happen, surface it in the per-run report under "Notes — needs human eyes" rather than filing an ambiguous issue.
````

- [ ] **Step 2: Verify expected sections exist**

Run:
```bash
grep -E "^## " docs/05-qa/full-app-audit/bug-reporting.md
```
Expected output (in this order):
```
## Title format
## Labels (every audit issue gets all five groups)
## Severity rubric
## Body template
## Dedup rule (run before every `gh issue create`)
## `gh issue create` shape
## When in doubt: don't file
```

- [ ] **Step 3: Commit**

```bash
git add docs/05-qa/full-app-audit/bug-reporting.md
git commit -m "docs(audit): add bug-reporting contract (titles, labels, severity, dedup)"
```

---

## Task 4: Write ux-heuristics.md

**Files:**
- Create: `docs/05-qa/full-app-audit/ux-heuristics.md`

- [ ] **Step 1: Write ux-heuristics.md**

Write the following exact content to `docs/05-qa/full-app-audit/ux-heuristics.md`:

````markdown
# UX Heuristics — Global Checks

These checks apply to **every** page during an audit, on top of the page-specific UX checks in each `pages/<page>.md`. The agent runs this list on every route. A failure on any heuristic is a finding (usually `type:ux`, severity scaled by impact).

## The checklist

### Page load
- No JavaScript errors in the browser console.
- No failed network requests in the network tab (status < 400). 4xx/5xx on critical calls is `severity:high` or `critical`.
- First meaningful paint within a reasonable budget for the network conditions of the test environment (no hard threshold — flag if it feels unusually slow).

### Loading state
- Every async section shows a skeleton, spinner, or inline progress affordance while data is loading.
- No "blank flash" — content area should never be empty between navigation and data arrival.

### Empty state
- When a list or chart has zero records, the user sees a helpful placeholder ("No bugs yet — sync from Tuleap or create one"), not raw `0`, `null`, an empty table, or a broken chart.
- Empty states include a primary action where one exists (e.g. "Create your first bug").

### Error state
- Failed API calls surface a visible message (toast or inline banner). Silent failure is a finding.
- The error message is human-readable; never a raw stack trace, JSON dump, or "undefined".
- A retry / refresh affordance exists where it makes sense.

### Validation feedback
- Invalid form inputs show inline messages near the field. A disabled submit button without a reason is a finding.
- Validation triggers on blur or submit (not on every keystroke for fields that don't need it).

### Toast lifecycle
- Successful mutations show a success toast within ~1 second.
- Error toasts persist long enough to read (≥ 5 seconds) or are dismissible.
- Toasts don't stack on top of important controls.

### Keyboard navigation
- Every interactive control is reachable via Tab.
- Focus is visually distinct (not just removed `:focus` styles).
- Escape closes modals; Enter submits forms.

### Mobile / narrow viewport
At 375×812 viewport:
- No horizontal page scroll.
- No overlapping controls or cut-off labels.
- Primary actions remain visible / reachable.
- Tables either scroll horizontally on purpose or collapse to a card layout.

### Browser back / forward
- Navigating back from a detail page restores the list's scroll position and applied filters where the design says it should.
- Forward navigation re-applies state correctly (the History API is not abused into infinite reload loops).

### Reload persistence
- Filters and search terms persist across reload if the URL encodes them. If they don't and the design says they should, that's a finding.

### Stale data
- After creating, editing, or deleting a record, the list / dashboard reflects the change without a manual refresh.
- If a background sync (e.g. Tuleap) updates a record, the open page either reflects the update or shows a "data changed — reload" hint.

### Accessibility (light pass)
Not a full a11y audit, but flag the obvious:
- Color is not the only signal for state (e.g. red-only "failed" indicator → fail).
- Form fields have visible labels.
- Buttons have accessible names (not just an icon with no aria-label).

## Severity mapping for UX findings

| Heuristic violated | Default severity |
| --- | --- |
| JS error on load, failed core API call | `critical` or `high` |
| Empty state shows raw `null` / broken chart | `high` |
| Missing loading state, silent error | `medium` |
| Mobile overlap, toast lifecycle issues, focus styles | `medium` |
| Polish: copy nits, tooltips, minor misalignment | `low` |

Adjust up or down based on how often a real user would hit it; record the reasoning in the issue body.
````

- [ ] **Step 2: Verify expected sections exist**

Run:
```bash
grep -E "^### " docs/05-qa/full-app-audit/ux-heuristics.md | head -20
```
Expected: at least these checklist sections — `### Page load`, `### Loading state`, `### Empty state`, `### Error state`, `### Validation feedback`, `### Toast lifecycle`, `### Keyboard navigation`, `### Mobile / narrow viewport`, `### Browser back / forward`, `### Reload persistence`, `### Stale data`, `### Accessibility (light pass)`.

- [ ] **Step 3: Commit**

```bash
git add docs/05-qa/full-app-audit/ux-heuristics.md
git commit -m "docs(audit): add global UX heuristics checklist"
```

---

## Task 5: Write the per-page template

**Files:**
- Create: `docs/05-qa/full-app-audit/pages/_template.md`

- [ ] **Step 1: Write pages/_template.md**

Write the following exact content to `docs/05-qa/full-app-audit/pages/_template.md`:

````markdown
# Page: <Human Name>

> **Template usage:** copy this file to `pages/<slug>.md`, replace every `<...>` placeholder, and delete this blockquote. The `<slug>` must match the slug used in `inventory.md` (e.g. `bugs`, `work-bugs-detail`).

## Identity

- **Route:** `/<route>`
- **Source files:** `apps/web/app/<path>/page.tsx`, plus key components under `apps/web/src/components/...`
- **API endpoints used:** `GET /endpoint`, `POST /endpoint`, ...
- **Access:** roles permitted (link to `docs/05-qa/ui-role-scenarios/roles/<role>.md` for the RBAC contract)

## Purpose

<One or two sentences: what does a user come to this page to do?>

## Prerequisites

- Logged in as admin (see `../setup.md`).
- Baseline data: <e.g. "≥ 5 bugs across mixed status/severity exist">.
- How to reach the page: <nav path, e.g. "Sidebar → Work → Bugs", or deep link `/bugs`>.

## Control Inventory

Every interactive element on this page. Walk top-to-bottom, left-to-right as a user would scan it.

### <Control name, e.g. "New Bug button">

- **Locator hint:** `role=button name="New Bug"` (or "top-right header, blue button labelled 'New Bug'")
- **Expected on action:** <UI change / navigation / toast / API call>
- **Must NOT happen:** <the failure mode that would be a bug — e.g. "Form submits without validation; toast says success but no row appears in the list">
- **Data check (optional):** `GET /bugs?limit=1&sort=-created_at` → newest item is the one just created

### <Next control>

…

## Happy Path Scenarios

Numbered end-to-end flows. Each scenario lists the action, the expected UI, and the expected data state.

### 1. <Scenario name, e.g. "Create a bug">

1. Click "New Bug".
2. Fill in: title `[AUDIT-YYYY-MM-DD] Test bug`, severity `Medium`, status `New`.
3. Click "Save".
4. **Expected UI:** modal closes, success toast appears, list refreshes with the new row at the top.
5. **Expected data:** `GET /bugs?title=[AUDIT-YYYY-MM-DD]` returns 1 row with the canonical labels (`status="New"`, `severity="Medium"`).

### 2. <Next scenario>

…

## Negative / Edge Cases

- **Empty state.** What does the page show when there are zero records? Expected vs actual.
- **Loading state.** What displays between navigation and data arrival? Expected vs actual.
- **Error state.** When the API returns 500: expected message and recovery affordance.
- **Permission edge.** Document any control that's admin-only. (RBAC enforcement lives in `ui-role-scenarios`; this is just an inventory.)
- **Known traps:**
  - <Pull from `CLAUDE.md` historical incidents. Example: "Bug summary cards used to show 0 because of label normalization (see 2026-05-24 entry in `CLAUDE.md`). Verify counts > 0 and that all four cards (Open, In Progress, Closed, Critical) populate.">

## UX Checks Specific To This Page

Anything beyond `../ux-heuristics.md`. Examples:

- "Trend chart must render even with a single data point (Recharts `AreaChart` requires `dot={{ r: 3 }}` for single-point lines — see 2026-04-07 entry in `CLAUDE.md`)."
- "Severity filter persists across page reload via URL search param."

## Linked Issues

Open audit-source issues against this page. The agent maintains this list — when a new issue is filed, append a row; when an issue closes, remove it.

| # | Title | Severity | Date filed |
| --- | --- | --- | --- |
| — | — | — | — |
````

- [ ] **Step 2: Verify the template has all required sections**

Run:
```bash
grep -E "^## " docs/05-qa/full-app-audit/pages/_template.md
```
Expected output (in this order):
```
## Identity
## Purpose
## Prerequisites
## Control Inventory
## Happy Path Scenarios
## Negative / Edge Cases
## UX Checks Specific To This Page
## Linked Issues
```

- [ ] **Step 3: Commit**

```bash
git add docs/05-qa/full-app-audit/pages/_template.md
git commit -m "docs(audit): add canonical per-page spec template"
```

---

## Task 6: Write inventory.md

**Files:**
- Create: `docs/05-qa/full-app-audit/inventory.md`

The inventory enumerates every `apps/web/app/**/page.tsx` (excluding nothing — even login/register pages get audited). Each gets a slug for `pages/<slug>.md` and a status. Status starts as `not drafted` for all rows; Phase 2 flips them to `drafted`, Phase 3 flips them to `audited`.

- [ ] **Step 1: Verify the route list is current**

Run:
```bash
find apps/web/app -name "page.tsx" -not -path "*/node_modules/*" | sort
```
Expected: a list matching the inventory below. If extra routes appear, add them to the table in Step 2 using the slug convention `path-segments-joined-by-dash` (replacing `[id]` with `detail`, `create`/`edit` kept as-is). If routes are missing, remove them.

- [ ] **Step 2: Write inventory.md**

Write the following exact content to `docs/05-qa/full-app-audit/inventory.md`:

````markdown
# Inventory — Full-App Audit

Master coverage checklist. Every route under `apps/web/app/` appears here exactly once with a slug pointing to `pages/<slug>.md`.

## Status legend

- `not drafted` — `pages/<slug>.md` does not yet exist (Phase 1 default)
- `drafted` — spec exists, awaiting human review
- `reviewed` — spec reviewed and approved; ready for audit runs
- `audited` — at least one audit run completed against this spec
- `blocked` — cannot be audited until something else is fixed (note the reason in the row)

## How slugs are derived

| Route | Slug |
| --- | --- |
| `/` | `home` |
| `/dashboard` | `dashboard` |
| `/work/bugs` | `work-bugs` |
| `/work/bugs/[id]` | `work-bugs-detail` |
| `/work/bugs/[id]/edit` | `work-bugs-edit` |
| `/work/bugs/create` | `work-bugs-create` |

Slashes become dashes, `[id]` becomes `detail`, `create`/`edit` stay literal.

## Routes

| # | Route | Source | Spec | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `/` | `apps/web/app/page.tsx` | `pages/home.md` | not drafted | |
| 2 | `/login` | `apps/web/app/login/page.tsx` | `pages/login.md` | not drafted | |
| 3 | `/register` | `apps/web/app/register/page.tsx` | `pages/register.md` | not drafted | |
| 4 | `/auth/confirmed` | `apps/web/app/auth/confirmed/page.tsx` | `pages/auth-confirmed.md` | not drafted | |
| 5 | `/auth/reset-password` | `apps/web/app/auth/reset-password/page.tsx` | `pages/auth-reset-password.md` | not drafted | |
| 6 | `/dashboard` | `apps/web/app/dashboard/page.tsx` | `pages/dashboard.md` | not drafted | |
| 7 | `/dashboards/member` | `apps/web/app/dashboards/member/page.tsx` | `pages/dashboards-member.md` | not drafted | |
| 8 | `/dashboards/pm` | `apps/web/app/dashboards/pm/page.tsx` | `pages/dashboards-pm.md` | not drafted | |
| 9 | `/dashboards/team-manager` | `apps/web/app/dashboards/team-manager/page.tsx` | `pages/dashboards-team-manager.md` | not drafted | |
| 10 | `/bugs` | `apps/web/app/bugs/page.tsx` | `pages/bugs.md` | not drafted | Legacy bugs page; cross-reference `/work/bugs` |
| 11 | `/governance` | `apps/web/app/governance/page.tsx` | `pages/governance.md` | not drafted | |
| 12 | `/reports` | `apps/web/app/reports/page.tsx` | `pages/reports.md` | not drafted | |
| 13 | `/resources` | `apps/web/app/resources/page.tsx` | `pages/resources.md` | not drafted | |
| 14 | `/me/dashboard` | `apps/web/app/me/dashboard/page.tsx` | `pages/me-dashboard.md` | not drafted | |
| 15 | `/me/preferences` | `apps/web/app/me/preferences/page.tsx` | `pages/me-preferences.md` | not drafted | |
| 16 | `/me/tasks` | `apps/web/app/me/tasks/page.tsx` | `pages/me-tasks.md` | not drafted | |
| 17 | `/me/idp` | `apps/web/app/me/idp/page.tsx` | `pages/me-idp.md` | not drafted | |
| 18 | `/me/idp/history` | `apps/web/app/me/idp/history/page.tsx` | `pages/me-idp-history.md` | not drafted | |
| 19 | `/me/idp/history/[planId]` | `apps/web/app/me/idp/history/[planId]/page.tsx` | `pages/me-idp-history-detail.md` | not drafted | |
| 20 | `/me/journeys` | `apps/web/app/me/journeys/page.tsx` | `pages/me-journeys.md` | not drafted | |
| 21 | `/me/journeys/[id]` | `apps/web/app/me/journeys/[id]/page.tsx` | `pages/me-journeys-detail.md` | not drafted | |
| 22 | `/team/history` | `apps/web/app/team/history/page.tsx` | `pages/team-history.md` | not drafted | |
| 23 | `/team/idp` | `apps/web/app/team/idp/page.tsx` | `pages/team-idp.md` | not drafted | |
| 24 | `/team/idp/[userId]` | `apps/web/app/team/idp/[userId]/page.tsx` | `pages/team-idp-detail.md` | not drafted | |
| 25 | `/team/journeys` | `apps/web/app/team/journeys/page.tsx` | `pages/team-journeys.md` | not drafted | |
| 26 | `/team/journeys/[userId]/[journeyId]` | `apps/web/app/team/journeys/[userId]/[journeyId]/page.tsx` | `pages/team-journeys-detail.md` | not drafted | |
| 27 | `/team/resources` | `apps/web/app/team/resources/page.tsx` | `pages/team-resources.md` | not drafted | |
| 28 | `/team/resources/[id]` | `apps/web/app/team/resources/[id]/page.tsx` | `pages/team-resources-detail.md` | not drafted | |
| 29 | `/team/resources/create` | `apps/web/app/team/resources/create/page.tsx` | `pages/team-resources-create.md` | not drafted | |
| 30 | `/admin` | `apps/web/app/admin/page.tsx` | `pages/admin.md` | not drafted | |
| 31 | `/admin/integrations/tuleap` | `apps/web/app/admin/integrations/tuleap/page.tsx` | `pages/admin-integrations-tuleap.md` | not drafted | |
| 32 | `/admin/journeys` | `apps/web/app/admin/journeys/page.tsx` | `pages/admin-journeys.md` | not drafted | |
| 33 | `/admin/journeys/[id]` | `apps/web/app/admin/journeys/[id]/page.tsx` | `pages/admin-journeys-detail.md` | not drafted | |
| 34 | `/admin/permissions/matrix` | `apps/web/app/admin/permissions/matrix/page.tsx` | `pages/admin-permissions-matrix.md` | not drafted | |
| 35 | `/admin/roles` | `apps/web/app/admin/roles/page.tsx` | `pages/admin-roles.md` | not drafted | |
| 36 | `/admin/teams` | `apps/web/app/admin/teams/page.tsx` | `pages/admin-teams.md` | not drafted | |
| 37 | `/admin/users` | `apps/web/app/admin/users/page.tsx` | `pages/admin-users.md` | not drafted | |
| 38 | `/qa/cases` | `apps/web/app/qa/cases/page.tsx` | `pages/qa-cases.md` | not drafted | |
| 39 | `/qa/suites` | `apps/web/app/qa/suites/page.tsx` | `pages/qa-suites.md` | not drafted | |
| 40 | `/quality/governance` | `apps/web/app/quality/governance/page.tsx` | `pages/quality-governance.md` | not drafted | |
| 41 | `/quality/projects` | `apps/web/app/quality/projects/page.tsx` | `pages/quality-projects.md` | not drafted | |
| 42 | `/quality/reports` | `apps/web/app/quality/reports/page.tsx` | `pages/quality-reports.md` | not drafted | |
| 43 | `/quality/results` | `apps/web/app/quality/results/page.tsx` | `pages/quality-results.md` | not drafted | |
| 44 | `/quality/runs` | `apps/web/app/quality/runs/page.tsx` | `pages/quality-runs.md` | not drafted | |
| 45 | `/quality/stories` | `apps/web/app/quality/stories/page.tsx` | `pages/quality-stories.md` | not drafted | |
| 46 | `/quality/tasks` | `apps/web/app/quality/tasks/page.tsx` | `pages/quality-tasks.md` | not drafted | |
| 47 | `/test/cases` | `apps/web/app/test/cases/page.tsx` | `pages/test-cases.md` | not drafted | |
| 48 | `/test/cases/[id]` | `apps/web/app/test/cases/[id]/page.tsx` | `pages/test-cases-detail.md` | not drafted | |
| 49 | `/test/cases/[id]/edit` | `apps/web/app/test/cases/[id]/edit/page.tsx` | `pages/test-cases-edit.md` | not drafted | |
| 50 | `/test/cases/bulk-upload` | `apps/web/app/test/cases/bulk-upload/page.tsx` | `pages/test-cases-bulk-upload.md` | not drafted | |
| 51 | `/test/cases/create` | `apps/web/app/test/cases/create/page.tsx` | `pages/test-cases-create.md` | not drafted | |
| 52 | `/test/results` | `apps/web/app/test/results/page.tsx` | `pages/test-results.md` | not drafted | |
| 53 | `/test/results/upload` | `apps/web/app/test/results/upload/page.tsx` | `pages/test-results-upload.md` | not drafted | Verify execution-date picker, single-point trend dot (see 2026-04-07 CLAUDE.md) |
| 54 | `/test/runs` | `apps/web/app/test/runs/page.tsx` | `pages/test-runs.md` | not drafted | |
| 55 | `/test/runs/[id]` | `apps/web/app/test/runs/[id]/page.tsx` | `pages/test-runs-detail.md` | not drafted | |
| 56 | `/test/runs/create` | `apps/web/app/test/runs/create/page.tsx` | `pages/test-runs-create.md` | not drafted | |
| 57 | `/test/suites` | `apps/web/app/test/suites/page.tsx` | `pages/test-suites.md` | not drafted | |
| 58 | `/test/suites/[id]` | `apps/web/app/test/suites/[id]/page.tsx` | `pages/test-suites-detail.md` | not drafted | |
| 59 | `/test/suites/[id]/edit` | `apps/web/app/test/suites/[id]/edit/page.tsx` | `pages/test-suites-edit.md` | not drafted | |
| 60 | `/test/suites/create` | `apps/web/app/test/suites/create/page.tsx` | `pages/test-suites-create.md` | not drafted | |
| 61 | `/work/bugs` | `apps/web/app/work/bugs/page.tsx` | `pages/work-bugs.md` | not drafted | Verify summary cards populate (see 2026-05-24 CLAUDE.md normalization fix) |
| 62 | `/work/bugs/[id]` | `apps/web/app/work/bugs/[id]/page.tsx` | `pages/work-bugs-detail.md` | not drafted | |
| 63 | `/work/bugs/[id]/edit` | `apps/web/app/work/bugs/[id]/edit/page.tsx` | `pages/work-bugs-edit.md` | not drafted | |
| 64 | `/work/bugs/create` | `apps/web/app/work/bugs/create/page.tsx` | `pages/work-bugs-create.md` | not drafted | |
| 65 | `/work/projects` | `apps/web/app/work/projects/page.tsx` | `pages/work-projects.md` | not drafted | |
| 66 | `/work/projects/[id]` | `apps/web/app/work/projects/[id]/page.tsx` | `pages/work-projects-detail.md` | not drafted | |
| 67 | `/work/projects/[id]/edit` | `apps/web/app/work/projects/[id]/edit/page.tsx` | `pages/work-projects-edit.md` | not drafted | |
| 68 | `/work/projects/[id]/quality` | `apps/web/app/work/projects/[id]/quality/page.tsx` | `pages/work-projects-quality.md` | not drafted | |
| 69 | `/work/projects/create` | `apps/web/app/work/projects/create/page.tsx` | `pages/work-projects-create.md` | not drafted | |
| 70 | `/work/stories` | `apps/web/app/work/stories/page.tsx` | `pages/work-stories.md` | not drafted | |
| 71 | `/work/stories/[id]` | `apps/web/app/work/stories/[id]/page.tsx` | `pages/work-stories-detail.md` | not drafted | |
| 72 | `/work/stories/[id]/edit` | `apps/web/app/work/stories/[id]/edit/page.tsx` | `pages/work-stories-edit.md` | not drafted | |
| 73 | `/work/stories/create` | `apps/web/app/work/stories/create/page.tsx` | `pages/work-stories-create.md` | not drafted | |
| 74 | `/work/tasks` | `apps/web/app/work/tasks/page.tsx` | `pages/work-tasks.md` | not drafted | |
| 75 | `/work/tasks/[id]` | `apps/web/app/work/tasks/[id]/page.tsx` | `pages/work-tasks-detail.md` | not drafted | |
| 76 | `/work/tasks/[id]/edit` | `apps/web/app/work/tasks/[id]/edit/page.tsx` | `pages/work-tasks-edit.md` | not drafted | |
| 77 | `/work/tasks/create` | `apps/web/app/work/tasks/create/page.tsx` | `pages/work-tasks-create.md` | not drafted | |

## Coverage summary

- Total routes: 77
- Drafted: 0
- Reviewed: 0
- Audited: 0
- Blocked: 0

(The audit agent updates these counters at end-of-run.)
````

- [ ] **Step 3: Verify the table row count matches actual route count**

Run:
```bash
ROUTES=$(find apps/web/app -name "page.tsx" -not -path "*/node_modules/*" | wc -l)
INVENTORY=$(grep -cE "^\| [0-9]+ \|" docs/05-qa/full-app-audit/inventory.md)
echo "filesystem routes: $ROUTES"
echo "inventory rows: $INVENTORY"
[ "$ROUTES" = "$INVENTORY" ] && echo "MATCH" || echo "MISMATCH — reconcile before commit"
```
Expected: `MATCH`. If `MISMATCH`, run `find apps/web/app -name "page.tsx" -not -path "*/node_modules/*" | sort` and diff against the inventory's Source column; add missing routes or remove extra ones.

- [ ] **Step 4: Commit**

```bash
git add docs/05-qa/full-app-audit/inventory.md
git commit -m "docs(audit): add route inventory (all $(find apps/web/app -name page.tsx | wc -l) routes)"
```

---

## Task 7: Write discovery-prompt.md (Phase 2 kickoff)

**Files:**
- Create: `docs/05-qa/full-app-audit/discovery-prompt.md`

- [ ] **Step 1: Write discovery-prompt.md**

Write the following exact content to `docs/05-qa/full-app-audit/discovery-prompt.md`:

````markdown
# Phase 2 Discovery Prompt

This is the canonical prompt the operator gives to an agent to **draft** per-page specs from the live app. Phase 2 runs once after Phase 1 (pack scaffolding) is complete; subsequent audit runs (Phase 3) reuse the reviewed specs.

The agent **drafts** specs by observing the live app. The operator **reviews** each draft and injects domain knowledge (especially the "Must NOT happen" lines and Known Traps from `CLAUDE.md`) before the spec is marked `reviewed` in `inventory.md`.

## When to run Phase 2

Run Phase 2 after every meaningful structural change to the app — new routes, removed pages, major restructure. For incremental changes (a new button on an existing page), just edit the affected `pages/<slug>.md` by hand.

## Prerequisites

- Phase 1 complete (this pack scaffolded).
- Admin user provisioned per `setup.md`.
- Target environment is **staging** (never run discovery against production — Phase 2 may create test data).
- GitHub labels exist (verify with `gh label list | grep audit`).

## The prompt

````
You are running Phase 2 of the QC-Manager full-app audit: drafting per-page specs from the live application.

Read first:
  - docs/05-qa/full-app-audit/README.md
  - docs/05-qa/full-app-audit/setup.md (log in as admin on staging)
  - docs/05-qa/full-app-audit/pages/_template.md (the spec format you will produce)
  - docs/05-qa/full-app-audit/ux-heuristics.md (so you know what UX dimensions to capture)
  - docs/05-qa/full-app-audit/inventory.md (the route list and slug mapping)
  - CLAUDE.md (root) — mine this for "Known traps" entries to seed each spec

For each route in inventory.md with status `not drafted`:

  1. Copy pages/_template.md to pages/<slug>.md.
  2. Navigate to the route via Playwright (playwright-cli skill).
  3. Populate the spec:
     - Identity — fill in route, source files (use `find apps/web/app/<path> -type f`), API endpoints (observe in network tab).
     - Purpose — one or two sentences in your own words from what you observe.
     - Prerequisites — note any data state needed for the page to render meaningfully.
     - Control Inventory — list EVERY interactive element (buttons, links, inputs, dropdowns, table sort headers, pagination, filters). For each: locator hint, expected behavior (from observation), Must NOT happen (your best guess — flag uncertainty with TODO so the human reviewer fixes it).
     - Happy Path Scenarios — 1 to 3 end-to-end flows you can describe from what the UI affords. Use `[AUDIT-YYYY-MM-DD]` prefix for any data you'd create.
     - Negative / Edge Cases — empty state, loading state, error state. Observe what the page does today; do not invent.
     - Known traps — search CLAUDE.md for the route or related entities; copy relevant entries verbatim with a date reference.
     - UX Checks Specific To This Page — anything you spot that's specific to this page (charts, sticky filters, etc.).
     - Linked Issues — leave empty.
  4. Update inventory.md: flip the status from `not drafted` to `drafted`, update the Coverage summary counter.
  5. Commit each spec individually:
       git add docs/05-qa/full-app-audit/pages/<slug>.md docs/05-qa/full-app-audit/inventory.md
       git commit -m "docs(audit): draft spec for <slug>"

When you encounter:
  - A page that won't load (auth wall, 5xx, broken route): set status to `blocked` in inventory.md with a Notes column explanation; do NOT draft a spec.
  - A control whose Must NOT happen you genuinely cannot guess: write `TODO(reviewer): define the failure mode` so the human reviewer fills it in.
  - A page whose behavior contradicts what's in CLAUDE.md: surface it in the per-run report under "Notes — needs human eyes" — this may be a real bug already.

DO NOT:
  - File GitHub issues during Phase 2. Phase 2 only drafts specs; finding real bugs is Phase 3.
  - Create production data. Only run against staging.
  - Mark any spec `reviewed` — only the human operator does that.

When done with all routes:
  - Write a Phase 2 summary at docs/05-qa/full-app-audit/runs/<date>-phase2-discovery.md listing:
      - Routes drafted
      - Routes blocked (with reasons)
      - TODOs left for the reviewer (count per spec)
      - Suspected bugs spotted during discovery (these become Phase 3 candidates)
````

## After Phase 2: human review

The operator reviews each `pages/<slug>.md`:

1. Verify the Control Inventory matches reality (the agent may have missed an icon-only button or a hover-revealed control).
2. Replace every `TODO(reviewer):` with the real Must NOT happen line.
3. Add Known Traps that the agent missed (cross-check against `CLAUDE.md`).
4. Flip status to `reviewed` in `inventory.md`.
5. Commit: `docs(audit): review spec for <slug>`.

Only `reviewed` specs are audited in Phase 3. `drafted` specs are skipped with a note in the run report.
````

- [ ] **Step 2: Verify**

Run:
```bash
grep -E "^## " docs/05-qa/full-app-audit/discovery-prompt.md
```
Expected output (in this order):
```
## When to run Phase 2
## Prerequisites
## The prompt
## After Phase 2: human review
```

- [ ] **Step 3: Commit**

```bash
git add docs/05-qa/full-app-audit/discovery-prompt.md
git commit -m "docs(audit): add Phase 2 discovery prompt"
```

---

## Task 8: Write runs/_template.md (per-run report template)

**Files:**
- Create: `docs/05-qa/full-app-audit/runs/_template.md`

- [ ] **Step 1: Write runs/_template.md**

Write the following exact content to `docs/05-qa/full-app-audit/runs/_template.md`:

````markdown
# Audit Run — <YYYY-MM-DD> (<env>)

> Copy this file to `runs/<YYYY-MM-DD>-<env>-run.md` at the start of an audit; fill in as you go.

## Environment

- URL: <https://staging.gebrils.cloud or https://gebrils.cloud>
- Test user: <admin email>
- Browser: <name + version>
- Started: <ISO timestamp>
- Finished: <ISO timestamp>
- Run mode: <Playwright | manual | hybrid>

## Coverage

One row per route from `inventory.md` that was attempted this run.

| Page | Spec file | Status | Findings |
| --- | --- | --- | --- |
| Dashboard | `pages/dashboard.md` | pass / findings / blocked / skipped | 0 |
| Bugs | `pages/bugs.md` | findings | 3 |
| ... | | | |

Status values:
- `pass` — every check in the spec passed
- `findings` — at least one finding filed (count in the Findings column)
- `blocked` — page could not be audited (e.g. 5xx all run); list reason in Notes
- `skipped` — spec status was not `reviewed`, so not audited this run

## Findings filed

One bullet per `gh issue create` performed this run.

- #<num> [audit][<type>][<page>] <title> — <severity>

## Findings re-confirmed (dedup hits)

One bullet per existing issue that was commented on this run instead of creating a new one.

- #<num> still reproducing — added comment with fresh evidence

## Skipped / blocked

- <Page>: <reason — e.g. "API returned 502 throughout the run; raised #1240 then skipped further checks">

## Cleanup gaps

Any data the agent created during the run that it could not delete at end-of-run.

- <e.g. "Bug '[AUDIT-2026-06-09] Test bug #3' — DELETE returned 403, needs manual cleanup">

## Notes — needs human eyes

Free-form observations the agent wants to surface that don't justify a filed issue:

- Suspected regressions, ambiguity in the spec, behaviors that seem wrong but aren't reproducible, areas where the spec contradicts what the live app does.

## Coverage delta vs previous run

- Routes added since last run: <list>
- Routes removed since last run: <list>
- Spec status changes: <e.g. "5 specs flipped from `drafted` to `reviewed` after operator review">
````

- [ ] **Step 2: Verify expected sections exist**

Run:
```bash
grep -E "^## " docs/05-qa/full-app-audit/runs/_template.md
```
Expected output (in this order):
```
## Environment
## Coverage
## Findings filed
## Findings re-confirmed (dedup hits)
## Skipped / blocked
## Cleanup gaps
## Notes — needs human eyes
## Coverage delta vs previous run
```

- [ ] **Step 3: Commit**

```bash
git add docs/05-qa/full-app-audit/runs/_template.md
git commit -m "docs(audit): add per-run audit report template"
```

---

## Task 9: Create GitHub labels

**Files:** none (GitHub side-effect only)

The audit agent will fail to attach labels that don't exist. Create the global ones now; page-scoped labels are created lazily by the agent.

- [ ] **Step 1: List existing labels to see what's already there**

```bash
gh label list --limit 200
```
Expected: a list of existing labels in the `Gebrilo/QC-Manager` repo. If `source:audit`, `type:bug`, `type:ux`, `type:enhancement`, `severity:*`, or `area:*` already exist, skip those `gh label create` lines in Step 2.

- [ ] **Step 2: Create the labels (skip any that already exist)**

```bash
gh label create "source:audit" --color 0E8A16 --description "Filed by the full-app audit agent" --force
gh label create "type:bug" --color D73A4A --description "Audit finding: functional bug" --force
gh label create "type:ux" --color 7057FF --description "Audit finding: UX issue" --force
gh label create "type:enhancement" --color A2EEEF --description "Audit finding: enhancement suggestion" --force
gh label create "severity:critical" --color B60205 --description "Blocks core workflow, data loss, security, or production-breaking" --force
gh label create "severity:high" --color D93F0B --description "Workflow degraded or wrong data shown" --force
gh label create "severity:medium" --color FBCA04 --description "UX issue or minor functional bug with workaround" --force
gh label create "severity:low" --color C5DEF5 --description "Polish, enhancement, cosmetic" --force
gh label create "area:web" --color 1D76DB --description "Root cause likely in apps/web" --force
gh label create "area:api" --color 0052CC --description "Root cause likely in apps/api" --force
gh label create "area:data" --color 5319E7 --description "Root cause likely in DB / schema / persisters" --force
```

`--force` here means "create or update if exists, don't fail" — safe because we're just ensuring presence.

- [ ] **Step 3: Verify all labels exist**

```bash
gh label list --limit 200 | grep -E "(source:audit|type:bug|type:ux|type:enhancement|severity:critical|severity:high|severity:medium|severity:low|area:web|area:api|area:data)" | wc -l
```
Expected: `11`

- [ ] **Step 4: No commit needed** (GitHub-side change only). Continue to next task.

---

## Task 10: Cross-link from ui-role-scenarios

**Files:**
- Modify: `docs/05-qa/ui-role-scenarios/README.md`

- [ ] **Step 1: Read the current README to find the right insertion point**

Run:
```bash
grep -n "^## " docs/05-qa/ui-role-scenarios/README.md
```
Expected: a list of section headers. We want to add a "Related packs" section at the end.

- [ ] **Step 2: Append a Related packs section**

Open `docs/05-qa/ui-role-scenarios/README.md` and append the following at the end of the file (after the last existing section):

```markdown
## Related packs

- [`../full-app-audit/`](../full-app-audit/README.md) — page-by-page functional + UX sweep run as admin. Complements this RBAC pack: this one answers "can this role only do what it should?"; the full-app-audit pack answers "does every page and button work correctly with good UX?"
```

- [ ] **Step 3: Verify the new section was added**

Run:
```bash
grep -A 2 "^## Related packs" docs/05-qa/ui-role-scenarios/README.md
```
Expected: the section header followed by the bullet pointing to `../full-app-audit/`.

- [ ] **Step 4: Commit**

```bash
git add docs/05-qa/ui-role-scenarios/README.md
git commit -m "docs(audit): cross-link role-scenarios README to full-app-audit pack"
```

---

## Task 11: Final smoke test

**Files:** none — verification only

- [ ] **Step 1: Verify the pack is structurally complete**

Run:
```bash
ls -la docs/05-qa/full-app-audit/
ls -la docs/05-qa/full-app-audit/pages/
ls -la docs/05-qa/full-app-audit/runs/
```
Expected:
- Top-level files: `README.md`, `setup.md`, `bug-reporting.md`, `ux-heuristics.md`, `inventory.md`, `discovery-prompt.md`
- `pages/`: `_template.md`, `.gitkeep`
- `runs/`: `_template.md`, `.gitkeep`

- [ ] **Step 2: Verify every top-level file has the expected top-level sections**

Run:
```bash
for f in README setup bug-reporting ux-heuristics inventory discovery-prompt; do
  echo "=== $f.md ==="
  grep -E "^## " "docs/05-qa/full-app-audit/$f.md"
done
```
Expected: every file produces a non-empty list of `## ` headers (no file accidentally empty).

- [ ] **Step 3: Verify the inventory row count is still consistent**

Run:
```bash
ROUTES=$(find apps/web/app -name "page.tsx" -not -path "*/node_modules/*" | wc -l)
INVENTORY=$(grep -cE "^\| [0-9]+ \|" docs/05-qa/full-app-audit/inventory.md)
[ "$ROUTES" = "$INVENTORY" ] && echo "MATCH ($ROUTES routes)" || echo "MISMATCH — $ROUTES on disk vs $INVENTORY in inventory"
```
Expected: `MATCH (N routes)`.

- [ ] **Step 4: Verify the cross-link from ui-role-scenarios resolves**

Run:
```bash
test -f docs/05-qa/full-app-audit/README.md && grep -q "full-app-audit" docs/05-qa/ui-role-scenarios/README.md && echo "OK"
```
Expected: `OK`.

- [ ] **Step 5: Verify all GitHub labels exist**

Run:
```bash
gh label list --limit 200 | grep -cE "(^source:audit|^type:bug|^type:ux|^type:enhancement|^severity:critical|^severity:high|^severity:medium|^severity:low|^area:web|^area:api|^area:data)"
```
Expected: `11`.

- [ ] **Step 6: Final git status check**

Run:
```bash
git status --short docs/05-qa/
git log --oneline -10
```
Expected: working tree clean for `docs/05-qa/` paths; the last several commits include the audit pack commits in order.

- [ ] **Step 7: Done**

The pack is ready for Phase 2 (discovery). To kick off Phase 2, follow `docs/05-qa/full-app-audit/discovery-prompt.md`.

---

## Out of scope for this plan

- **Phase 2 (drafting per-page specs from live app).** That is a separate audit-agent run. The prompt for it lives in `discovery-prompt.md`, written by Task 7.
- **Phase 3 (first real audit run).** Invoked after the human operator has reviewed Phase 2 drafts.
- **Phase 4 (ongoing).** Operational, no code/doc deliverables.
- **Filling in real admin credentials in `setup.md`.** Credentials never live in the repo; the operator pastes them into the agent's session config at run time. The setup file documents which mechanism is in use (magic-link vs token vs direct password).
