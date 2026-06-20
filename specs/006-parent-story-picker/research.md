# Phase 0 Research: Parent User Story Picker

All "NEEDS CLARIFICATION" in the spec were resolved by informed assumptions; this document records the technical decisions and the existing-code findings that ground the plan.

## Existing surfaces (no need to build)

- **Unified search** — `GET /search` (`apps/api/src/routes/search.js`) already supports `type=user_story`, `project_id` scoping, and per-type permission filtering (`user_story → page:projects`; admins bypass). Returns `{ id (uuid), display_id ('US-'||tuleap_artifact_id or uuid), title, project_id, project_name, status, priority, url }`. Free-text matches `title`, `description`, `tuleap_artifact_id`. Minimum query length is 2.
- **User-stories list** — `GET /user-stories` (`apps/api/src/routes/userStories.js`, `requirePermission('qc.projects.view')`) supports `project_id` filter and pagination; joins project name. Exposed in the web client as `userStoriesApi.list({ project_id, limit, search })`.
- **Single story** — `userStoriesApi.get(id)` → `GET /user-stories/:id` for resolving a saved value's readable label.
- **Picker pattern** — `apps/web/src/components/shared/RelationshipPicker.tsx`: debounce (300ms), click-outside close, `searchApi.search({ q, type, project_id })`, loading/no-results states. Reused as the mechanical reference.
- **Audit** — task create/update already call `auditLog('tasks', id, ACTION, after, before, actor)`, which diffs before/after. A parent change is therefore recorded with no extra work.

## Decision 1 — Initial "click opens a list" data source

**Decision**: Browse via `userStoriesApi.list({ project_id, limit })` on focus; switch to typed search as the user types.
**Why**: The `/search` endpoint returns empty for queries shorter than 2 characters, so it cannot back the "click → see available stories" requirement. The list endpoint is project-scoped, permission-gated, and already returns the fields needed for display.
**Rejected**: Modifying `/search` to allow empty-query browse — broader blast radius on a shared endpoint; the list endpoint already fits.

## Decision 2 — Multi-field search (title, ID, Tuleap ID, status, priority, keyword)

**Decision**: Two-tier. (a) Client-side filter the fetched project list across all displayed fields (title, display_id, tuleap id, status, priority, description) for instant, complete multi-field matching. (b) For projects whose story count exceeds the fetch cap, fall back to server `searchApi.search` (title/description/tuleap-id) for the typed query.
**Why**: The server `/search` free-text covers title/description/tuleap-id but treats status/priority as exact-match *filter params*, not free-text — so status/priority "search" is best done client-side on loaded rows. A single project's story count is typically modest, making client-side filtering both simple and complete.
**Rejected**: Extending `search.searchCols` to include status/priority text — status/priority are enums, full-text matching them server-side adds query complexity for little gain.
**Note**: Description-keyword search is best-effort per the spec; covered client-side where description is loaded and server-side via `/search`.

## Decision 3 — Removing the link (FR-010)

**Decision**: Frontend sends an explicit `parent_user_story_id: null` on edit when the field is empty; backend `updateTaskSchema` accepts `null` (`.nullable()`); the existing dynamic update loop writes the column to NULL.
**Why**: Today the form collapses empty → `undefined`, which `JSON.stringify` drops, so the key never reaches the server and the link can't be cleared. The update schema also rejects `null`. Both must change for removal to work. The dynamic update loop already sets any present key (including null) and audits it.
**Rejected**: A dedicated "unlink" endpoint — unnecessary; the existing PATCH handles it once null is allowed.

## Decision 4 — Setting the parent at creation (P1 / FR-007)

**Decision**: Add `parent_user_story_id` to the CREATE INSERT in `tasks.js`.
**Why**: The create route validates the field (it's in `baseTaskSchema`) but the INSERT column list omits it, so a parent chosen at creation is silently dropped today. Required for User Story 1 to work end-to-end.
**Rejected**: Asking the user to set the parent only after creating the task — contradicts the spec's create-flow acceptance scenarios.

## Decision 5 — Resolving the saved value on edit

**Decision**: On mount with a saved UUID, call `userStoriesApi.get(id)` to render the readable label; on 404/403 show an "unresolved" state that lets the user keep, change, or clear it, and do not emit a change unless the user acts.
**Why**: The task payload stores only the UUID; the readable label must be fetched. Inaccessible/deleted parents are an explicit edge case and must not crash or silently rewrite the stored link.

## Decision 6 — Accessibility

**Decision**: Add keyboard navigation (↑/↓/Enter/Esc) and ARIA combobox semantics (`role=combobox/listbox/option`, `aria-expanded`, `aria-activedescendant`) to the new picker.
**Why**: Constitution requires WCAG compliance; the reference `RelationshipPicker` uses plain buttons without combobox semantics, so this is net-new for the picker.

## Open questions

None blocking. Description-keyword search remains best-effort by spec assumption.
