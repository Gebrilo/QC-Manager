# Full-App Audit Pack — Design

**Date:** 2026-06-09
**Status:** Approved, ready for implementation planning
**Owner:** Abdelrahman Mogebril

## Goal

Give an automated agent (or a human tester) a single, complete contract that lets it sweep every page and every interactive control in QC-Manager, evaluate UX, and file findings as GitHub issues — so the system can be driven toward bug-free with a good UX through repeatable audit runs.

## Non-goals

- Replacing the existing `docs/05-qa/ui-role-scenarios/` pack. That pack stays focused on RBAC per role.
- Building a CI-blocking test suite. This is exploratory + UX audit, run on demand.
- Writing per-page specs by hand up front — see the phased kickoff below.

## Why this is separate from `ui-role-scenarios`

The role-scenarios pack answers *"can this role do only what RBAC says?"* The full-app audit answers *"does every page and button work correctly with good UX?"* Mixing those two lenses in one folder muddles structure; keeping them parallel keeps each contract crisp. Both packs share the same `setup.md`-style baseline (admin login, baseline data) but have different per-file shapes.

## Scope decisions (confirmed during brainstorming)

| Decision | Value |
|---|---|
| Test user / role | Admin (full coverage in one pass) |
| Execution model | Multi-modal — Playwright (primary) + API checks for data integrity + manual walkthrough by a human. Same specs serve all three. |
| Primary organizing unit | One MD per page/route |
| Reporting | Auto-create one GitHub issue per finding, with structured labels and dedup against existing open issues |

## Pack location and top-level structure

```
docs/05-qa/full-app-audit/
├── README.md                 # what this pack is, how to invoke an agent
├── setup.md                  # admin login, baseline data, env vars, URLs
├── bug-reporting.md          # GitHub issue conventions: title format, labels, severity rubric, body template
├── ux-heuristics.md          # shared UX checklist applied to every page
├── inventory.md              # master route list → spec file mapping (coverage checklist)
├── pages/
│   ├── dashboard.md
│   ├── bugs.md
│   ├── bugs-detail.md
│   ├── test-executions.md
│   ├── resources.md
│   ├── resources-detail.md
│   ├── governance.md
│   ├── reports.md
│   ├── work.md
│   ├── team.md
│   ├── admin-users.md
│   ├── admin-roles.md
│   └── ... (one file per route under apps/web/app/)
└── runs/
    └── YYYY-MM-DD-<env>-run.md   # per-run audit report (produced by the agent)
```

### What each top-level file owns

- **README.md** — purpose of the pack, how an operator invokes an agent against it, list of source-of-truth files in the codebase (so spec drift is visible).
- **setup.md** — admin user creds (or how to provision one), URLs for production vs staging, baseline data prerequisites, Playwright/browser config notes.
- **bug-reporting.md** — the full contract for filing issues. See *GitHub issue conventions* below.
- **ux-heuristics.md** — global UX checks the agent runs on every page (see below). Keeps each per-page spec focused on what's specific to that page.
- **inventory.md** — master route list. Every route under `apps/web/app/` must appear here with a link to its `pages/<page>.md`. This is the coverage checklist: "everything that exists is documented."
- **pages/** — one MD per route, following the per-page template.
- **runs/** — per-run audit reports (produced output, not input).

## Per-page MD template

The contract every `pages/<page>.md` follows. Same shape across all routes so the agent can parse them uniformly.

```markdown
# Page: <Human Name>

## Identity
- **Route:** `/<route>`
- **Source files:** `apps/web/app/<path>/page.tsx`, related components
- **API endpoints used:** `GET /endpoint`, ...
- **Access:** roles permitted (link to ui-role-scenarios for full RBAC)

## Purpose
One or two sentences: what does a user come to this page to do?

## Prerequisites
- Logged in as admin (see setup.md)
- Baseline data: e.g. "at least 5 bugs across mixed status/severity exist"
- How to reach the page (nav path, deep link)

## Control Inventory

Every interactive element on the page. For each:

### <Control name>
- **Locator hint:** e.g. `role=button name="New Bug"` or "Top-right header button"
- **Expected on action:** what should happen (UI change, navigation, toast, API call)
- **Must NOT happen:** the failure mode that would be a bug
- **Data check (optional):** API endpoint + expected response shape to confirm the action landed

(Repeat for every button, link, dropdown, filter, input, table column header, pagination control, sort handle, etc.)

## Happy Path Scenarios
Numbered end-to-end flows on this page. Each scenario lists:
1. Action
2. Expected UI result
3. Expected data state (verifiable via API)

## Negative / Edge Cases
- Empty state (no data) — what should the user see?
- Loading state — skeleton vs spinner vs blank
- Error state — API 500, network failure, validation failure
- Permission edge — admin-only controls; document expected visibility
- Known traps (drawn from CLAUDE.md / past incidents) — e.g. "Bug summary cards previously showed 0 because of label normalization (see 2026-05-24 entry). Verify counts > 0."

## UX Checks Specific To This Page
Anything beyond ux-heuristics.md, e.g. "Chart must render even with single data point (Recharts AreaChart requires dot={{ r: 3 }})", "Severity filter must persist across page reload".

## Linked Issues
Open audit-source GitHub issues against this page, so the agent doesn't refile dupes.
```

### Why "Must NOT happen" matters

This is the line that *teaches* the agent what counts as a bug. Without it, an agent will only flag obvious crashes; with it, it can flag silent data loss, stale state, missing toasts, wrong filter behavior — things that look fine but violate the contract.

### Why "Known traps" matters

The CLAUDE.md and recent commits contain hard-won lessons (bug status/severity normalization, single-point Recharts dots, n8n payload variants, `started_at` defaults). The per-page Known Traps section pulls those into the spec so the agent explicitly verifies the historically-broken paths.

## Agent execution loop

```
1. READ pack contract
   - README.md
   - setup.md          → log in as admin, confirm baseline data
   - bug-reporting.md  → memorize labels, severity rubric, title format
   - ux-heuristics.md  → memorize global checks
   - inventory.md      → ordered list of pages to audit

2. FOR EACH page in inventory.md:
   a. Open pages/<page>.md
   b. Navigate to the route (Playwright or manual)
   c. Verify page loads — no console errors, no 4xx/5xx in network tab
   d. Walk Control Inventory top-to-bottom:
      - For each control: locate, act, observe expected vs "Must NOT happen"
      - If a control behaves unexpectedly → record finding
   e. Run Happy Path Scenarios end-to-end; verify data via API check
   f. Run Negative / Edge Cases
   g. Apply ux-heuristics.md global checks
   h. Apply page-specific UX checks
   i. Check Known Traps explicitly

3. FOR EACH finding:
   - Classify: bug | ux | enhancement
   - Severity: critical | high | medium | low (rubric in bug-reporting.md)
   - Search existing open issues for dupes (see Dedup rule)
   - If new: capture screenshot + reproduction steps + console/network excerpt
   - Run `gh issue create` with the standard title + labels + body
   - Append to runs/YYYY-MM-DD-<env>-run.md

4. END-OF-RUN report
   - Pages covered, pages skipped (with reason)
   - Findings filed (with links)
   - Suggested follow-ups
```

### Guardrails

- **Idempotency.** Before filing, the agent searches existing open issues. On re-runs, a still-reproducing finding gets a `gh issue comment` ("still reproducing on YYYY-MM-DD") instead of a duplicate issue.
- **Test data isolation.** Any data the agent creates uses a recognisable prefix — e.g. `[AUDIT-2026-06-09] Test bug` — so cleanup is trivial and audit noise is easy to distinguish from real records. The agent is encouraged to clean up its own created data at end-of-run; if cleanup fails, list the leftover records in the run report.
- **Read before write.** API checks may only call read endpoints unless a scenario explicitly requires a write. Mutating endpoints (POST/PATCH/DELETE) only fire when the corresponding UI flow explicitly does so.

## GitHub issue conventions

Lives in `bug-reporting.md`.

### Title format

```
[audit][<type>][<page>] <one-line summary>
```

- `<type>`: `bug` | `ux` | `enh`
- `<page>`: short slug matching the spec file (`bugs`, `dashboard`, `resources-detail`)

Examples:
- `[audit][bug][bugs] Status filter resets to "All" on page reload`
- `[audit][ux][dashboard] Empty state shows raw "null" instead of placeholder`
- `[audit][enh][resources] Task summary card lacks "view all" link`

### Labels

| Label group | Values |
|---|---|
| `source` | `audit` (always — lets us filter the whole sweep) |
| `type` | `bug` / `ux` / `enhancement` |
| `severity` | `critical` / `high` / `medium` / `low` |
| `page` | `page:bugs`, `page:dashboard`, ... one per spec file |
| `area` | `area:web` / `area:api` / `area:data` — where the root cause likely lives |

If any label doesn't yet exist in the GitHub repo, the implementation plan must include creating it (`gh label create`).

### Severity rubric

| Level | Definition | Examples |
|---|---|---|
| **critical** | Blocks core workflow, data loss, security, or production-breaking | Login broken; save action silently drops data; API 500 on main page |
| **high** | Workflow degraded; user can finish but with friction or wrong data shown | Filter doesn't apply; summary card shows wrong count; action requires page refresh to take effect |
| **medium** | UX issue or minor functional bug with workaround | Empty state ugly; button label confusing; toast disappears too fast |
| **low** | Polish, enhancement, cosmetic | Misalignment; copy nit; missing tooltip |

### Body template

```markdown
## Summary
<one paragraph: what's wrong>

## Steps to reproduce
1. Logged in as admin
2. Navigate to <route>
3. <action>
4. <observation>

## Expected
<from the spec file>

## Actual
<what happened, including any console errors / network failures>

## Spec reference
- Pack: `docs/05-qa/full-app-audit/pages/<page>.md`
- Control / scenario: `<exact heading>`

## Evidence
- Screenshot: <path or attachment>
- Console excerpt (if any):
  ```
  <copy/paste>
  ```
- Network excerpt (if any): `<method> <url>` → `<status>` + response snippet

## Environment
- URL: https://gebrils.cloud (or staging)
- Browser: <name + version>
- Audit run: <link to runs/YYYY-MM-DD-run.md>
```

### Dedup rule

Before `gh issue create`:

```bash
gh issue list --state open --search "[audit][<type>][<page>] <keyword>" --json number,title
```

If a similar title exists → `gh issue comment` with a "still reproducing on YYYY-MM-DD" note plus fresh evidence. No new issue.

## Per-run audit report

Every sweep produces one report at `docs/05-qa/full-app-audit/runs/YYYY-MM-DD-<env>-run.md`:

```markdown
# Audit Run — 2026-06-09 (production)

## Environment
- URL: https://gebrils.cloud
- Test user: <admin email>
- Browser: Chromium <version>
- Started / Finished: <timestamp>

## Coverage
| Page | Spec file | Status | Findings |
|---|---|---|---|
| Dashboard | pages/dashboard.md | pass | 0 |
| Bugs | pages/bugs.md | findings | 3 |
| Test Executions | pages/test-executions.md | blocked | 1 |
| ... | | | |

## Findings filed
- #1234 [audit][bug][bugs] Status filter resets on reload — high
- #1235 [audit][ux][bugs] Severity dropdown overflows on mobile — medium
- ...

## Skipped / blocked
- Reports page: server returned 502 throughout the run; raised #1240 then skipped further checks on this route.

## Notes
- Free-form observations the agent wants to surface (suspected regressions, areas needing human eyes).
```

## Global UX heuristics (lives in `ux-heuristics.md`)

The checklist the agent applies on every page, on top of the page-specific UX checks:

- **Page load** — no console errors, no failed network requests, page renders within a reasonable budget.
- **Loading state** — every async section shows a skeleton/spinner; never a blank flash.
- **Empty state** — when no data, a helpful placeholder appears (not raw "0", "null", or an empty table).
- **Error state** — failed API calls surface a visible error message (toast or inline), not silent failure.
- **Validation feedback** — invalid inputs show inline messages, not just a disabled submit button.
- **Toast lifecycle** — success/error toasts appear after mutations and auto-dismiss in a reasonable window.
- **Keyboard navigation** — interactive controls are reachable via Tab; focus is visible.
- **Mobile / narrow viewport** — at 375px width, no horizontal scroll, no overlapping controls, no off-screen primary actions.
- **Browser back/forward** — navigating back from a sub-page restores list scroll / filter state where the user would expect it.
- **Reload persistence** — applied filters / search terms persist across reload where the design says they should.
- **Stale data** — after creating/editing/deleting, the list view reflects the change without manual reload.

## Phased kickoff (handed off to writing-plans for sequencing)

Per-page MDs are not pre-written by hand — too brittle, too slow. The implementation runs in four phases:

1. **Phase 1 — Scaffold the pack.** Write `README.md`, `setup.md`, `bug-reporting.md`, `ux-heuristics.md`, an empty `inventory.md`, and a per-page template file (`pages/_template.md`). Create the GitHub labels listed above. No per-page specs yet.
2. **Phase 2 — Discovery pass.** Agent does one shallow Playwright walk of every route under `apps/web/app/`, populates `inventory.md`, and produces a draft `pages/<page>.md` for each route from what it observes live (controls, happy path, prerequisites). User reviews each draft and injects domain knowledge (especially the "Must NOT happen" lines and Known Traps from CLAUDE.md). This is the human-review gate before any audit fires.
3. **Phase 3 — First real audit.** With reviewed specs, the agent does a deep sweep against staging first, then production. Files findings, writes the first run report.
4. **Phase 4 — Ongoing.** Subsequent runs reuse the specs cheaply. Dedup keeps the issue tracker tidy. The pack is updated only when the app changes (new routes, deprecated controls).

The big payoff of this phasing: **the user never writes per-page MDs from scratch.** The agent drafts from the live app; the human reviews and corrects.

## Open questions for the implementation plan

- **Test user provisioning.** Document the admin user in `setup.md`. If the user isn't yet usable for automated runs (e.g. SSO/magic-link only), the plan must include either a dedicated audit user with email/password, or scripted token issuance.
- **Where Playwright runs.** Local dev machine? VPS? CI? The implementation plan picks one for Phase 2/3 and documents how to swap.
- **Screenshot storage.** Inline GitHub attachment vs an `evidence/` folder in the repo. Recommend inline GitHub attachment for issues so they survive without bloating the repo.
- **Cleanup of audit-created data.** Decide whether the agent best-effort deletes its own records at end-of-run, or leaves cleanup to a periodic prune.

## Source-of-truth files referenced by this pack

(Listed here so the implementation plan can wire them into `README.md`.)

- `apps/web/app/` — every route directory under here is a candidate page for `inventory.md`.
- `apps/shared/rbac/catalog.ts` — role definitions (for the access section of each page spec).
- `apps/web/src/config/routes.ts`, `apps/web/src/components/providers/RouteGuard.tsx` — UI route guards.
- `apps/api/src/middleware/authMiddleware.js` — API permission middleware.
- `CLAUDE.md` (root + `/root/QC-Manager/CLAUDE.md`) — historical incidents; mine these for Known Traps.
- `docs/05-qa/ui-role-scenarios/` — sibling pack to cross-link for RBAC context.

## Next step

After user review of this spec, hand off to the `superpowers:writing-plans` skill to produce the phased implementation plan.
