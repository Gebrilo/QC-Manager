# Tuleap CRUD Frontend Pages — Design Spec

**Date:** 2026-04-23
**Status:** Approved

## Goal

Add frontend UI pages so users can create, view, edit, and delete Tuleap artifacts (User Stories, Test Cases, Bugs) directly through QC-Manager. All CRUD operations go through the new `POST/PATCH/DELETE/GET /tuleap/artifacts/:type` API endpoints which proxy to Tuleap in real-time.

## Current State

### Backend (done)
- `POST/PATCH/DELETE/GET /tuleap/artifacts/:type` — full CRUD for user-story, test-case, task, bug
- `POST /tuleap-webhook/user-story` — sync endpoint for n8n
- All routes require `requireAuth`

### Frontend (gaps)
- **Tasks**: Fully built (list, create, edit, detail, delete, kanban)
- **Bugs**: List only (synced from Tuleap by n8n). No create, edit, or detail pages.
- **Test Cases**: List page exists but create/edit/detail pages are missing (links point to non-existent files).
- **User Stories**: Nothing exists — no route, page, or component.

## Architecture

### Data flow

```
QC-Manager UI
  → POST/PATCH/DELETE /tuleap/artifacts/:type
  → API proxies to Tuleap REST API
  → Returns result to UI
```

List pages for Bugs and Test Cases continue reading from the local DB (synced by n8n polling). Create/Edit/Delete go to Tuleap directly via the new artifact endpoints. This gives fast list views with real-time editing.

### API client additions

Add to `apps/web/src/lib/api.ts`:

```ts
export const tuleapApi = {
  list: (type: string, params?: Record<string, string>) =>
    fetchApi(`/tuleap/artifacts/${type}`, { params }),
  get: (type: string, id: string) =>
    fetchApi(`/tuleap/artifacts/${type}/${id}`),
  create: (type: string, data: Record<string, unknown>) =>
    fetchApi(`/tuleap/artifacts/${type}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, type: string, fields: Record<string, unknown>) =>
    fetchApi(`/tuleap/artifacts/${id}`, { method: 'PATCH', body: JSON.stringify({ type, fields }) }),
  remove: (id: string) =>
    fetchApi(`/tuleap/artifacts/${id}`, { method: 'DELETE' }),
};
```

## Section 1: User Stories

### 1.1 User Stories tab in Project Detail

**Route:** `/projects/[id]` — add a "User Stories" tab

The existing project detail page at `apps/web/app/projects/[id]/page.tsx` gets a tab bar. Tabs:
- **Overview** (current content)
- **User Stories** (new)

The User Stories tab calls `GET /tuleap/artifacts/user-story?limit=50&offset=0` and renders a table with columns: ID, Title, Status, Priority, Actions (View/Edit/Delete).

The tab shows a `+ Create User Story` button that links to `/user-stories/create?projectId={id}`.

### 1.2 User Story Create

**Route:** `/apps/web/app/user-stories/create/page.tsx`

Form fields (mapped to Tuleap tracker fields):
- Summary / Title (required)
- Overview / Description (textarea)
- Acceptance Criteria (textarea)
- Status (select: Draft, Changes, Review, Approved)
- Requirement Version (text)
- Priority (select)
- BA Author (text)

On submit: calls `tuleapApi.create('user-story', data)`. On success, redirects to the project detail user-stories tab.

### 1.3 User Story Detail

**Route:** `/apps/web/app/user-stories/[id]/page.tsx`

Calls `tuleapApi.get('user-story', id)`. Shows card layout with:
- Title, Status badge, Priority, Requirement Version
- Description (rendered markdown)
- Acceptance Criteria
- BA Author
- Tuleap link (opens artifact in Tuleap)
- Edit button → `/user-stories/[id]/edit`
- Delete button (confirm dialog, calls `tuleapApi.remove(id)`)

### 1.4 User Story Edit

**Route:** `/apps/web/app/user-stories/[id]/edit/page.tsx`

Same form as create, pre-populated. Calls `tuleapApi.get('user-story', id)` to load data, then `tuleapApi.update(id, 'user-story', fields)` on submit.

## Section 2: Test Cases

### 2.1 Test Case Create

**Route:** `/apps/web/app/test-cases/create/page.tsx`

Form fields:
- Title (required)
- Test Steps / Description (textarea)
- Expected Result (textarea)
- Status (select)
- Priority (select)
- Category (select)

On submit: calls `tuleapApi.create('test-case', data)`.

### 2.2 Test Case Detail

**Route:** `/apps/web/app/test-cases/[id]/page.tsx`

Calls `tuleapApi.get('test-case', id)`. Shows:
- Title, Status, Priority, Category
- Test Steps (rendered)
- Expected Result
- Tuleap link
- Edit/Delete actions

### 2.3 Test Case Edit

**Route:** `/apps/web/app/test-cases/[id]/edit/page.tsx`

Same form as create, pre-populated. On submit calls `tuleapApi.update(id, 'test-case', fields)`.

## Section 3: Bugs

### 3.1 Bug Create

**Route:** `/apps/web/app/bugs/create/page.tsx`

Form fields:
- Title (required)
- Steps to Reproduce / Description (textarea)
- Environment (text, required)
- Service Name (text, required)
- Severity (select)
- Status (select)

On submit: calls `tuleapApi.create('bug', data)`.

### 3.2 Bug Detail

**Route:** `/apps/web/app/bugs/[id]/page.tsx`

The existing bugs list shows bugs from local DB (synced by n8n). The detail page loads from Tuleap directly: `tuleapApi.get('bug', id)`. Shows:
- Title, Status badge, Severity badge
- Steps to Reproduce
- Environment, Service Name
- Assigned To
- Tuleap link
- Edit/Delete actions

### 3.3 Bug Edit

**Route:** `/apps/web/app/bugs/[id]/edit/page.tsx`

Same form as create, pre-populated. On submit calls `tuleapApi.update(id, 'bug', fields)`.

## Section 4: Shared Patterns

### Form component pattern

Each artifact type gets a form component in a new directory:
- `apps/web/src/components/user-stories/UserStoryForm.tsx`
- `apps/web/src/components/test-cases/TestCaseForm.tsx`
- `apps/web/src/components/bugs/BugForm.tsx`

Forms use `react-hook-form` + `zod` validation (matching `TaskForm.tsx` pattern). Shared UI components: `Input`, `Select`, `Button`, `Card`.

### Permission model

Follow existing pattern with `useAuth().hasPermission()`:
- Create: `action:tuleap:create`
- Edit: `action:tuleap:edit`
- Delete: `action:tuleap:delete`

### Delete confirmation

All delete actions show a confirmation dialog: "Delete this artifact from Tuleap? This cannot be undone." On confirm, calls `tuleapApi.remove(id)`.

### Error handling

- 400: Show validation error in form / toast
- 401: Redirect to login
- 404: Show "Artifact not found" message
- 502: Show "Tuleap unavailable — try again later" toast

## File Structure

```
apps/web/
  app/
    user-stories/
      create/page.tsx
      [id]/page.tsx
      [id]/edit/page.tsx
    test-cases/
      create/page.tsx          ← new (link already exists)
      [id]/page.tsx            ← new
      [id]/edit/page.tsx       ← new
    bugs/
      create/page.tsx          ← new
      [id]/page.tsx            ← new
      [id]/edit/page.tsx       ← new
    projects/
      [id]/page.tsx            ← modify: add User Stories tab
  src/
    components/
      user-stories/
        UserStoryForm.tsx
      test-cases/
        TestCaseForm.tsx
      bugs/
        BugForm.tsx
    lib/
      api.ts                   ← add tuleapApi object
```

## Routes config

Add to `apps/web/src/config/routes.ts`:
- No new sidebar entries needed
- User Stories accessed via project detail tab
- Test Cases and Bugs accessed via existing list page buttons
