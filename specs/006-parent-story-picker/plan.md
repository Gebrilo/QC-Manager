# Implementation Plan: Searchable Parent User Story Picker for Tasks

**Branch**: `006-parent-story-picker` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-parent-story-picker/spec.md`

## Summary

Replace the free-text **Parent User Story** UUID input in the Task create/edit **Links** section with a searchable, project-scoped, single-select picker that shows readable user-story details and supports set / change / clear. The candidate data, project scoping, and permission filtering already exist server-side (the unified `/search` endpoint and the `/user-stories` list endpoint). The work is mostly a focused frontend component plus two small backend corrections: the **create** path currently drops `parent_user_story_id` (it isn't in the INSERT), and **clearing** the link isn't possible because the update schema rejects `null` and the form collapses an empty value to `undefined`. Audit/history of the change is already captured by the existing `auditLog` before/after diff on task update.

## Technical Context

**Language/Version**: TypeScript 5.9 (web), Node.js / CommonJS (api)
**Primary Dependencies**: Next.js 14 (App Router), React 18, react-hook-form 7 + zod 4 (`@hookform/resolvers`), axios; Express + `pg` (api)
**Storage**: PostgreSQL (Supabase `supabase-db`); `tasks.parent_user_story_id uuid` already exists — **no schema/migration change**
**Testing**: Vitest (web unit/component), Playwright (e2e), Jest-style api route tests under `apps/api/__tests__`
**Target Platform**: Web (server-rendered + client components), responsive desktop/mobile
**Project Type**: Web application (monorepo: `apps/web` frontend, `apps/api` backend, `apps/shared`)
**Performance Goals**: Picker results feel instant; debounced search (~300ms) as in `RelationshipPicker`; project-scoped queries; no unbounded list rendering
**Constraints**: Reuse existing endpoints (`/search`, `/user-stories`); no new permission rules; must not break Tuleap sync or existing artifact linking; WCAG-accessible (keyboard + ARIA combobox)
**Scale/Scope**: Single user-story relationship per task; typical project has tens–low hundreds of user stories; one new component + two pages touched + two small api edits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Code Quality** — PASS. Reuses established patterns (`RelationshipPicker` mechanics, `FormSection`/`Input` primitives, `userStoriesApi`). No new abstractions beyond one component.
- **II. Testing Standards** — PASS (planned). Adds Vitest component tests, api route tests for create-persists/clear-via-null, and Playwright e2e for set/change/remove.
- **III. User Experience Consistency** — PASS. Matches existing picker styling, dark mode, and detail/form design system. Readable display replaces raw UUID.
- **IV. Performance** — PASS. Debounced, project-scoped, capped result sets.
- **Accessibility (WCAG)** — ATTENTION. Existing `RelationshipPicker` lacks full keyboard/ARIA combobox semantics; this feature MUST add keyboard navigation (arrow/enter/escape) and `role="combobox"/"listbox"/"option"` + `aria-expanded`/`aria-activedescendant`.
- **Security** — PASS. Candidate visibility enforced server-side (`/search` → `page:projects`; `/user-stories` → `qc.projects.view`). No client-side trust for access decisions.

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-parent-story-picker/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities & relationship touched
├── quickstart.md        # Phase 1 — manual validation walkthrough
├── contracts/
│   └── endpoints.md     # Phase 1 — endpoints used + the null-clear contract change
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 — created by /speckit.tasks (NOT here)
```

### Source Code (repository root)

```text
apps/web/
├── src/components/
│   ├── shared/
│   │   ├── UserStoryPicker.tsx          # NEW — single-select, browse+search, readable chip, clear
│   │   └── RelationshipPicker.tsx       # reference pattern (debounce, click-outside, search api)
│   └── tasks/
│       └── TaskForm.tsx                 # EDIT — swap Input → UserStoryPicker; resolve initial value; null-clear payload
├── src/lib/api/index.ts                 # reuse searchApi.search, userStoriesApi.list/get (no change expected)
└── src/types/index.ts                   # UserStory type (reuse)

apps/api/
├── src/routes/tasks.js                  # EDIT — add parent_user_story_id to CREATE INSERT
├── src/schemas/task.js                  # EDIT — updateTaskSchema.parent_user_story_id → .nullable()
└── __tests__/tasks.routes.test.js       # tests — create persists parent; update clears via null

Tests:
apps/web/  → Vitest component tests for UserStoryPicker; Playwright e2e for create/edit/change/remove
apps/api/  → route tests for create-persist and null-clear
```

**Structure Decision**: Web-application monorepo. Frontend change is one new shared component consumed by `TaskForm` (used by both the create and edit pages). Backend changes are two surgical edits to existing files. No new routes, no schema migration.

## Architecture & Approach

### Frontend — `UserStoryPicker` component

A single-select picker modeled on `RelationshipPicker` mechanics but purpose-built for one bound value:

- **Props**: `projectId?: string`, `value?: string` (the selected user-story UUID), `onChange(id: string | null)`, `initialValueId?: string` (saved value on edit), `label?`, `disabled?`.
- **Browse on focus**: when opened with an empty query, fetch the project's stories via `userStoriesApi.list({ project_id, limit })` and show them (satisfies "click opens a list"). The list endpoint is permission-gated server-side.
- **Search**: debounce input (~300ms). Search across **title, display ID (US-####/tuleap artifact id), status, priority, and description keyword**. Two-tier strategy (see research.md): client-side filter the fetched project list across all fields for instant multi-field matching; for projects whose story count exceeds the fetch cap, fall back to server `searchApi.search({ q, type: 'user_story', project_id })` (covers title/description/tuleap-id). Status/priority remain client-filterable on loaded rows.
- **Readable display**: selected value renders as a chip showing `display_id` + title (+ status/priority secondary), with a clear (×) button. Never shows the raw UUID.
- **Resolve saved value (edit)**: on mount with `initialValueId`, call `userStoriesApi.get(id)` to render the readable label. On 404/403 (deleted or inaccessible), render an "unresolved — pick a new one or clear" state without crashing and without silently breaking the stored link (don't emit `onChange` unless the user acts).
- **No project chosen**: disabled with a hint ("Select a project first"), since candidates are project-scoped.
- **Accessibility**: keyboard navigation (↑/↓/Enter/Esc), `role="combobox"`/`listbox`/`option`, `aria-expanded`, `aria-activedescendant`; close on outside click.

### Frontend — `TaskForm` integration

- Add `setValue` to the `useForm` destructure; keep the zod field `parent_user_story_id: z.string().uuid().optional().or(z.literal(''))`.
- Replace the `<Input {...register('parent_user_story_id')} />` in the **Links** `FormSection` with `<UserStoryPicker projectId={projectIdValue} value={watch('parent_user_story_id')} initialValueId={initialData?.parent_user_story_id} onChange={(id) => setValue('parent_user_story_id', id ?? '', { shouldValidate: true })} />`.
- **Submit payload**: keep create as `parent_user_story_id: data.parent_user_story_id || undefined`; for **edit**, send `parent_user_story_id: data.parent_user_story_id ? data.parent_user_story_id : null` so an empty value explicitly clears the link (FR-010).

### Backend — two surgical edits

1. **`tasks.js` CREATE** — add `parent_user_story_id` to the INSERT column list and `data.parent_user_story_id || null` to the values array (fixes silently-dropped parent on create → FR-007/P1).
2. **`schemas/task.js`** — `updateTaskSchema.parent_user_story_id: z.string().uuid().nullable().optional()` so a `null` reaches the dynamic update loop, which already writes the column to NULL and audits it (FR-010, FR-015).

No change needed for audit (existing `auditLog(updated, original)` diff), Tuleap sync (parent is a local FK, not part of the inbound mutation path beyond existing handling), or the search/list endpoints.

### Verification touchpoints (regression safety)

- Existing edit flow already persisted parent via PATCH keyMap — confirm unchanged.
- Tuleap inbound persister uses `parent_user_story_id = CASE WHEN $6 IS NOT NULL THEN $6 ELSE parent_user_story_id END` (won't clear on sync) — confirm our null-clear is user-initiated only and not overwritten unexpectedly.
- Notification/artifact-linking modules consume the relationship as today; no contract change.

## Phase Outputs

- **Phase 0** → [research.md](./research.md): browse-vs-search data source, multi-field search strategy, clear-via-null decision, initial-value resolution, accessibility approach.
- **Phase 1** → [data-model.md](./data-model.md), [contracts/endpoints.md](./contracts/endpoints.md), [quickstart.md](./quickstart.md).
- **Phase 2** → `tasks.md` via `/speckit.tasks` (not produced by this command).

## Complexity Tracking

No constitution violations; section intentionally empty.
