---
description: "Task list for Searchable Parent User Story Picker for Tasks"
---

# Tasks: Searchable Parent User Story Picker for Tasks

**Input**: Design documents from `/specs/006-parent-story-picker/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/endpoints.md

**Tests**: Included — justified by the spec's acceptance scenarios and the constitution's Testing Standards. Test infra reality in this repo: web **Vitest** runs in a **node** environment with `include: ['src/**/*.test.ts']` (no jsdom/testing-library), so pure logic is unit-tested as `*.test.ts`; **UI behavior is covered by Playwright e2e** under `apps/web/e2e/`; backend is tested under `apps/api/__tests__/`.

**Organization**: Grouped by user story (US1/US2/US3) for independent implementation and testing. Each story is a vertical slice that is independently demoable.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / FOUND (foundational) / SETUP / POLISH

## Path Conventions
Web app monorepo: frontend `apps/web/src/`, e2e `apps/web/e2e/`, backend `apps/api/src/`, backend tests `apps/api/__tests__/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the integration points the feature builds on (no installs needed — dependencies already present).

- [ ] T001 [SETUP] Confirm reuse points exist and shapes match the contracts: `searchApi.search` and `userStoriesApi.list/get` in `apps/web/src/lib/api/index.ts`, the `UserStory` type in `apps/web/src/types/index.ts`, and the `user_story` branch of `apps/api/src/routes/search.js`. No code change expected; note any drift from `contracts/endpoints.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `UserStoryPicker` engine that every story needs. No story work can begin until this is done.

**⚠️ CRITICAL**: Blocks US1, US2, US3.

- [ ] T002 [FOUND] Create the client-side multi-field match helper in `apps/web/src/lib/userStoryMatch.ts`: given a query string and a `UserStory`, match across title, display id (`US-####`/tuleap artifact id), status, priority, and description. Pure function (no React) so it is unit-testable in the node Vitest env.
- [ ] T003 [P] [FOUND] Unit-test the match helper in `apps/web/src/lib/userStoryMatch.test.ts`: matches by title, US-id, status, priority, description keyword; case-insensitive; non-matches excluded.
- [ ] T004 [FOUND] Create `apps/web/src/components/shared/UserStoryPicker.tsx` (single-select engine, modeled on `RelationshipPicker`): props `projectId`, `value`, `onChange(id|null)`, `initialValueId`, `label`, `disabled`. Behaviors: browse-on-focus via `userStoriesApi.list({ project_id })`; debounced (~300ms) typed search using the T002 helper over the loaded list, with `searchApi.search({ q, type:'user_story', project_id })` fallback for large projects; select → `onChange(uuid)` and render a readable chip (`display_id` + title, status/priority secondary) — never the raw UUID; click-outside close. Depends on T002.
- [ ] T005 [FOUND] Add states to `UserStoryPicker.tsx`: loading spinner, empty-project ("no user stories to link"), no-results ("no results"), and no-project disabled hint ("select a project first"). Depends on T004 (same file).
- [ ] T006 [FOUND] Add accessibility to `UserStoryPicker.tsx` (constitution WCAG): keyboard nav ↑/↓/Enter/Esc, `role=combobox/listbox/option`, `aria-expanded`, `aria-activedescendant`, focus management. Depends on T004 (same file).

**Checkpoint**: A reusable, accessible, project-scoped picker exists and is unit-tested at the logic level. Story phases can begin.

---

## Phase 3: User Story 1 - Find and link a parent while creating a task (Priority: P1) 🎯 MVP

**Goal**: A user selects a parent user story from the searchable dropdown during task creation, and it persists.

**Independent Test**: Create a task in a project with user stories, search & select a parent, save, confirm the link persisted and the field showed a readable value (not a UUID).

### Tests for User Story 1

- [ ] T007 [P] [US1] Backend route test in `apps/api/__tests__/tasks.routes.test.js` (create file if absent): `POST /tasks` with `parent_user_story_id` persists it on the created row (this FAILS before T009).
- [ ] T008 [P] [US1] Playwright e2e in `apps/web/e2e/task-parent-story-create.spec.ts`: open Create Task, choose project, open Parent User Story → list appears, type to filter, select → readable chip shown, save → parent persisted; and a second run saving with no parent succeeds without error.

### Implementation for User Story 1

- [ ] T009 [US1] Add `parent_user_story_id` to the CREATE INSERT in `apps/api/src/routes/tasks.js` (column list + `data.parent_user_story_id || null` in values), fixing the silent drop on create.
- [ ] T010 [US1] Integrate the picker into `apps/web/src/components/tasks/TaskForm.tsx` Links `FormSection`: add `setValue` to the `useForm` destructure, replace the `<Input {...register('parent_user_story_id')} />` with `<UserStoryPicker projectId={projectIdValue} value={watch('parent_user_story_id')} onChange={(id) => setValue('parent_user_story_id', id ?? '', { shouldValidate: true })} />`; keep the create payload `parent_user_story_id: data.parent_user_story_id || undefined`.

**Checkpoint**: US1 is fully functional — parent selectable and persisted on create. MVP deployable.

---

## Phase 4: User Story 2 - Change the parent while editing a task (Priority: P2)

**Goal**: On edit, the current parent shows readably and the user can switch it to another same-project story; the change persists and is audited.

**Independent Test**: Open a task with a parent → current shown readably → search & select a different story → save → new parent persisted; audit/history reflects it.

### Tests for User Story 2

- [ ] T011 [P] [US2] Playwright e2e in `apps/web/e2e/task-parent-story-change.spec.ts`: open a task with a parent → current parent rendered readably on load → change to a different story → save → new parent persisted.
- [ ] T012 [P] [US2] Playwright e2e (same file) edge case: when the linked parent is inaccessible/deleted, the field shows an "unresolved — pick or clear" state, the rest of the form still saves, and saving without touching it does not change the stored link.

### Implementation for User Story 2

- [ ] T013 [US2] Add `initialValueId` resolution to `apps/web/src/components/shared/UserStoryPicker.tsx`: on mount, fetch `userStoriesApi.get(initialValueId)` to render the readable label; on 404/403 show the unresolved state and do NOT emit `onChange` unless the user acts. Depends on T004.
- [ ] T014 [US2] Pass `initialValueId={initialData?.parent_user_story_id}` from `apps/web/src/components/tasks/TaskForm.tsx` to the picker. Depends on T010.
- [ ] T015 [US2] Verify (no code change expected) that `PATCH /tasks/:id` set/change already persists `parent_user_story_id` (keyMap) and that `auditLog` records the before/after; note findings in the PR. Confirms FR-009/FR-015 for change.

**Checkpoint**: US1 + US2 both work independently — parent can be set on create and changed on edit, with audit.

---

## Phase 5: User Story 3 - Remove the parent link (Priority: P3)

**Goal**: On edit, the user clears the parent and saving removes the relationship.

**Independent Test**: Open a task with a parent → clear → save → task has no parent; audit/history records the removal.

### Tests for User Story 3

- [ ] T016 [P] [US3] Backend route test in `apps/api/__tests__/tasks.routes.test.js`: `PATCH /tasks/:id` with `parent_user_story_id: null` sets the column to NULL and the audit records the removal (FAILS before T018).
- [ ] T017 [P] [US3] Playwright e2e in `apps/web/e2e/task-parent-story-remove.spec.ts`: open a task with a parent → click the chip's clear (×) → save → task shows no parent.

### Implementation for User Story 3

- [ ] T018 [US3] Make the update schema accept null: `updateTaskSchema.parent_user_story_id: z.string().uuid().nullable().optional()` in `apps/api/src/schemas/task.js`.
- [ ] T019 [US3] Add the clear (×) control to the selected chip in `apps/web/src/components/shared/UserStoryPicker.tsx` → emits `onChange(null)` and resets the display. Depends on T004.
- [ ] T020 [US3] In `apps/web/src/components/tasks/TaskForm.tsx` `onSubmit`, on edit send `parent_user_story_id: data.parent_user_story_id ? data.parent_user_story_id : null` so an empty value explicitly clears the link (keep create as `|| undefined`). Depends on T010.

**Checkpoint**: All three stories independently functional — set / change / remove.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] [POLISH] Run `cd apps/web && npx tsc --noEmit` and fix any type errors (project rule: type errors only surface in the deploy build).
- [ ] T022 [POLISH] Execute `specs/006-parent-story-picker/quickstart.md` end-to-end against a real project; confirm all acceptance scenarios and edge cases.
- [ ] T023 [P] [POLISH] Regression: confirm Tuleap inbound persister (`apps/api/src/services/persisters/task.js` null-CASE) does not overwrite a user-cleared parent, and that notification/artifact-linking modules consume the relationship unchanged.
- [ ] T024 [P] [POLISH] UX parity check: picker styling, dark mode, and spacing match `RelationshipPicker`/the form design system.
- [ ] T025 [POLISH] Keep the knowledge graph current after code changes: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` (per repo CLAUDE.md).

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup. **Blocks all stories.** T002 → {T003, T004}; T004 → {T005, T006}.
- **US1 (P3)** → after Foundational. T009 ⟂ T010 (different files, but both needed for the slice); tests T007/T008 written first and fail until T009/T010.
- **US2 (P4)** → after Foundational; T014 depends on T010 (US1 integration). Otherwise independent of US1 behavior.
- **US3 (P5)** → after Foundational; T020 depends on T010. Otherwise independent.
- **Polish (P6)** → after the stories you intend to ship.

### Story independence
- US1, US2, US3 are independently testable vertical slices. US2/US3 reuse the US1 `TaskForm` integration point (T010) only because the form is a single shared file — their *behaviors* are independent and separately demoable.

### Parallel opportunities
- T003 ∥ (start of) T004 after T002 lands its export.
- Within a story, the test tasks marked [P] run in parallel (different files): T007 ∥ T008; T011 ∥ T012; T016 ∥ T017.
- Backend tasks (T009 in tasks.js, T018 in schemas/task.js) are in different files and can proceed independently once their phase is reached.
- Polish T021/T023/T024 are [P].

---

## Implementation Strategy

### MVP first (US1)
1. Setup (T001) → Foundational (T002–T006) → US1 (T007–T010).
2. **STOP and validate** US1 independently (create → select → persist). Deploy/demo.

### Incremental delivery
- Add US2 (change on edit) → validate → demo.
- Add US3 (remove) → validate → demo.
- Each story adds value without breaking the previous.

### Notes
- Same-file tasks are sequential (UserStoryPicker.tsx: T004→T005→T006→T013→T019; TaskForm.tsx: T010→T014→T020).
- Backend: no schema migration; `tasks.parent_user_story_id` already exists. Only an INSERT column (T009) and a `.nullable()` (T018).
- Audit, Tuleap sync, notifications, and artifact-linking need no contract changes — verified in T015/T023.
- Run `apps/web/npx tsc --noEmit` before merge/deploy.
