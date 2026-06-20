# Quickstart: Validating the Parent User Story Picker

Manual walkthrough that maps to the spec's acceptance scenarios. Assumes a project with at least two user stories you can access.

## Prerequisites
- Logged in with access to a project (`page:projects` / `qc.projects.view`).
- The project has ≥2 user stories; at least one has a Tuleap artifact id (shows as `US-####`).

## US1 — Set parent on create (P1)
1. Go to **Create Task**, choose the project, fill required fields.
2. In **Links**, click **Parent User Story** → a dropdown opens listing the project's user stories (no typing needed).
3. Type part of a title, the `US-####` id, a status (e.g. "In Progress"), or a priority → list narrows.
4. Select a story → the field shows `US-#### · Title` (readable), not a UUID.
5. Save → reopen/edit the task and confirm the parent is set. ✅ (Regression check: before the backend fix, this would NOT persist.)
6. Repeat without selecting a parent → task saves with no link, no error.

## US2 — Change parent on edit (P2)
1. Open a task that already has a parent → the field shows the current parent readably on load.
2. Open the dropdown, search, select a different story in the same project, save.
3. Confirm the parent now points to the new story. Check the task audit/history shows the change.
4. Edge: temporarily make the linked story inaccessible/deleted → the field shows an "unresolved — pick or clear" state, the rest of the form still works, and saving without touching it does not break the stored link.

## US3 — Remove parent on edit (P3)
1. Open a task with a parent, click the clear (×) on the chip.
2. Save → confirm the task no longer has a parent (and audit/history records the removal). ✅ (Regression check: before the null-clear fix, the link could not be cleared.)

## Cross-cutting checks
- **Project scoping**: stories from other projects never appear.
- **Permissions**: a story you can't access never appears; resolving an inaccessible saved value shows the unresolved state, not an error page.
- **No project chosen**: the field is disabled with a "select a project first" hint.
- **Empty/no-results**: empty project shows an empty-state; a no-match search shows "no results".
- **Tuleap**: setting/changing/clearing parent does not disrupt sync or artifact mappings.
- **Accessibility**: open with keyboard, navigate options with ↑/↓, select with Enter, close with Esc.

## Automated coverage to run
- `cd apps/web && npx vitest run` — UserStoryPicker component tests.
- `cd apps/web && npx tsc --noEmit` — type check (per project rule: type errors only surface in the deploy build).
- `apps/api` route tests — create-persists-parent and update-clears-via-null.
- Playwright e2e — create/edit/change/remove flows.
