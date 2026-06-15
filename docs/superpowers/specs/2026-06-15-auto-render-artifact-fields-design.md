# Auto-render all artifact fields on detail pages

**Date:** 2026-06-15
**Status:** Approved (design)

## Problem

Each artifact detail page renders a **hardcoded subset** of fields. Any column that
isn't in the page's curated `metaFields` / `DetailRow` list is invisible — even though
the API already returns it. The gap is worst on the user-story page (which shows only
Description + Acceptance Criteria and has no Details card at all), but every page is
affected.

The API confirms the data is already on the client:

| Artifact | GET handler select |
|---|---|
| Bug | `SELECT b.*` |
| Task | `SELECT * FROM v_tasks_with_metrics` |
| Story | `SELECT us.*, p.project_name` |
| Test case | `SELECT * FROM v_test_case_summary` |
| Test suite | `SELECT ...` (full row) |
| Test run | `/test-executions/test-runs/:id` (full row) |

So this is purely a **display** problem — no API changes required.

## Goal

Every detail page surfaces **all populated fields** of its artifact automatically, so
new DB columns appear without per-page edits, while internal plumbing stays hidden and
long-form text keeps its readable layout.

## Decisions (locked with the user)

1. **Approach: generic auto-render.** A single auto-generated Details list per page
   instead of hand-maintained field lists.
2. **Field filtering: hide internal plumbing.** Auto-render every business field but
   skip a denylist of non-human fields.
3. **Long text: body cards.** Description / acceptance criteria / steps / notes render
   as full-width body cards (as today), not inside the label/value list.
4. **Scope: all six artifact pages** — bug, story, task, test case, test suite, test run.
5. **Empty fields are hidden.** Only populated fields render (no wall of "—" rows). The
   complaint is populated fields not showing; this keeps the card clean.
6. **Bespoke visual widgets are preserved.** Task (progress bar, resource avatars,
   quick actions) and Test Run (stat tiles, pass/completion bars, executions table)
   keep those widgets; the auto-list covers every *other* field. Everywhere else it is
   a single auto-generated Details list.

## Architecture

### Shared helper module — `apps/web/src/lib/detailFields.tsx`

Pure, unit-testable functions plus a thin component.

- **`humanizeLabel(key: string): string`**
  `snake_case` → `Title Case`, with acronym fixups: `id`→`ID`, `url`→`URL`,
  `cc`→`CC`, `qc`→`QC`, `tuleap`→`Tuleap`, `api`→`API`, `ui`→`UI`.
  Example: `submitted_by_resource_name` → `Submitted By Resource Name`;
  `tuleap_artifact_id` → `Tuleap Artifact ID`.

- **`formatFieldValue(value: unknown): React.ReactNode | null`**
  Type-aware formatting; returns `null` when the value should not render.
  - `null` / `undefined` / `''` → `null` (skip)
  - empty array → `null` (skip)
  - array of primitives → `join(', ')`
  - boolean → `'Yes'` / `'No'`
  - ISO date string (strict regex, e.g. `^\d{4}-\d{2}-\d{2}`) → `toLocaleDateString()`
  - number → `String(value)`
  - plain object / array-of-objects → `null` (skip; relational data shown elsewhere)
  - string → HTML stripped via existing `stripHtml`

- **`isUuid(value): boolean`** — strict UUID regex used to hide raw FK/id values.

- **`buildAutoDetailFields(record, opts): { key, label, value }[]`**
  Iterates **every** key of `record` and emits rows, skipping a field when any holds:
  - key in **global denylist**: `_can`, `deleted_at`, `embedding`, search-vector
    columns (`tsv`/`search_vector`), and sync internals already in the Sync panel
    (`sync_status`, `last_sync_attempted_at`, `last_sync_error`, `last_sync_at`)
  - the **value is a UUID** (hides `id`, `project_id`, `suite_id`,
    `parent_user_story_id`, `owner_resource_id`, …; keeps numeric Tuleap IDs and human
    display IDs like `BUG-123`)
  - `formatFieldValue` returns `null` (empty / object / array-of-objects)
  - key in the per-call **`exclude`** list (header dups, body-card fields, fields shown
    in a bespoke widget)

  `opts`: `{ exclude?: string[]; labels?: Record<string,string>; formatters?: Record<string, (v) => React.ReactNode> }`.

- **`<AutoDetailsCard record exclude labels formatters title="Details" />`**
  Renders a `QCCard` with a `SectionLabel` and one `DetailRow` per row from
  `buildAutoDetailFields`. Uses the existing shared primitives from
  `components/shared/DetailCard`. Renders nothing if there are zero rows.

### Per-page integration

Each page imports `<AutoDetailsCard>` and passes a small `exclude` list of fields it
already shows in the header / body cards / bespoke widgets.

| Page | File | Change | Preserved |
|---|---|---|---|
| Story | `app/work/stories/[id]/page.tsx` | **Add** AutoDetailsCard to right column (none today) | Sync panel, linked artifacts, body cards |
| Bug | `app/work/bugs/[id]/page.tsx` | Replace `metaFields` list with AutoDetailsCard; `formatters` for `initial_effort`/`remaining_effort` → `Nh` | Body cards, sync, links, attachments |
| Test case | `app/test/cases/[id]/page.tsx` | Replace hardcoded Details list with AutoDetailsCard; `exclude` `tags` | Tags badge block, execution history, activity, links |
| Test suite | `app/test/suites/[id]/page.tsx` | Replace "Overview" list with AutoDetailsCard | Cases table, Quick Actions, add-cases UI |
| Task | `app/work/tasks/[id]/page.tsx` | **Add** AutoDetailsCard for remaining cols | Work & Time (progress bar), Resources avatars, Dates, Quick Actions, comments, body cards |
| Test run | `app/test/runs/[id]/page.tsx` | **Add** an AutoDetailsCard rendered from the raw response object | Stat tiles, pass/completion bars, executions table |

Per-page `exclude` baselines (header + body + widget fields), e.g.:
- **Bug:** `title, status, bug_id, project_name, description, dev_fix_description, qc_verification_notes`
- **Story:** `title, status, description, acceptance_criteria`
- **Test case:** `title, status, test_case_id, project_name, description, preconditions, test_steps, expected_result, tags`
- **Test suite:** `name, status, suite_id, project_name, description, test_cases`
- **Task:** `task_name, status, task_id, project_name, description, notes, total_est_hrs, total_actual_hrs, overall_completion_pct, resource1_name, resource2_name, expected_start_date, actual_start_date, deadline, completed_date`
- **Test run:** `run_id, name, status, description, metrics, executions`

(These are starting lists; finalize against each page during implementation.)

## Testing

- **Unit tests** (`apps/web` Jest) for the pure helpers:
  - `humanizeLabel` — snake_case, acronyms, edge cases
  - `formatFieldValue` — dates, booleans, arrays, numbers, null/empty, objects, HTML strip
  - `buildAutoDetailFields` — denylist, UUID hiding, empty hiding, `exclude`, label/value overrides
- **Type check:** `cd apps/web && npx tsc --noEmit` before merge/deploy (project rule:
  type errors only surface in the deploy build).
- **Manual:** load one of each artifact's detail page and confirm previously-hidden
  populated fields now appear and no raw UUIDs / internal fields leak.

## Out of scope

- API changes (data already returned).
- Editing fields from the detail view (read-only display only).
- Reordering/grouping fields beyond DB/object key order.
