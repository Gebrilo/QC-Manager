# Development Plan Enhancement (Editing + Multi-Plan + Attachments) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing IDP (Individual Development Plan) system with three capabilities: (1) manager editing of plans/objectives/tasks with restrictions on completed tasks, (2) multiple active plans per resource navigable via tabs, and (3) per-task links + dual-ownership file attachments stored in Supabase Storage.

**Architecture:** Extend the existing `journeys`/`journey_chapters`/`journey_tasks`/`journey_task_attachments` tables. Add a new `idp_task_links` table for learning resources. Extend `journey_task_attachments` with an `uploaded_by_role` column for ownership distinction. File storage moves from local disk to Supabase Storage buckets. The existing `developmentPlans.js` route file grows new endpoints for editing, multi-plan management, links, and attachments.

**Tech Stack:** Node.js/Express (API), Supabase Storage (file uploads), PostgreSQL via `db.query()`, Jest + supertest (tests), Next.js 14 / React 18 / TypeScript (frontend), Tailwind CSS.

**Design Decisions:**
- **Editing:** Direct editing with `updated_at` tracking. Completed tasks are locked (must reopen before editing). Audit via existing `audit_log` table.
- **Multi-plan:** Multiple active plans per resource, navigated via tabs. No "primary" concept — all plans are equal.
- **Attachments:** Dual ownership (manager uploads materials, resource uploads submissions). Stored in Supabase Storage. Both roles see all files but labeled differently. Manager can delete any file; resource can only delete own.
- **Links:** Manager-added learning resource URLs, visible inline in task cards.
- **Mandatory attachments:** Per-task toggle (`requires_attachment` boolean). Resource must upload before marking DONE.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `database/migrations/024_idp_enhancements.sql` | Schema: links table, attachment ownership, requires_attachment flag |
| Modify | `apps/api/src/config/db.js` | Run migration 024 on startup |
| Modify | `apps/api/src/routes/developmentPlans.js` | Editing, multi-plan, links, attachment endpoints |
| Create | `apps/api/src/config/storage.js` | Supabase Storage client utility |
| Create | `apps/api/__tests__/developmentPlans.editing.test.js` | Tests for editing endpoints |
| Create | `apps/api/__tests__/developmentPlans.links.test.js` | Tests for link CRUD |
| Create | `apps/api/__tests__/developmentPlans.attachments.test.js` | Tests for attachment upload/download/delete |
| Modify | `apps/web/src/lib/api.ts` | New types + API client functions |
| Create | `apps/web/src/components/idp/PlanTabs.tsx` | Tab navigation for multiple plans |
| Create | `apps/web/src/components/idp/TaskLinks.tsx` | Inline link display + add/delete for manager |
| Create | `apps/web/src/components/idp/TaskAttachments.tsx` | Attachment upload/download with ownership labels |
| Modify | `apps/web/app/development-plan/page.tsx` | Tabs for multi-plan, links & attachments in task cards |
| Modify | `apps/web/app/manage-development-plans/[userId]/page.tsx` | Editing UI, links/attachments management |
| Modify | `apps/web/app/manage-development-plans/page.tsx` | Multi-plan count indicator |
| Modify | `.github/workflows/deploy.yml` | New env vars for Supabase Storage |

---

## Task 1: Database Migration — Schema for Enhancements

**Files:**
- Create: `database/migrations/024_idp_enhancements.sql`
- Modify: `apps/api/src/config/db.js`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- database/migrations/024_idp_enhancements.sql
BEGIN;

-- 1. Links table: learning resources attached to IDP tasks by managers
CREATE TABLE IF NOT EXISTS idp_task_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label VARCHAR(500) NOT NULL,
    created_by UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idp_task_links_task ON idp_task_links(task_id);

-- 2. Attachment ownership: distinguish manager vs resource uploads
ALTER TABLE journey_task_attachments
    ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(20) NOT NULL DEFAULT 'resource'
        CHECK (uploaded_by_role IN ('manager', 'resource'));

-- 3. Attachment storage: Supabase Storage key for IDP files
ALTER TABLE journey_task_attachments
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS bucket_name VARCHAR(100);

-- 4. Per-task mandatory attachment toggle
ALTER TABLE journey_tasks
    ADD COLUMN IF NOT EXISTS requires_attachment BOOLEAN NOT NULL DEFAULT false;

-- 5. updated_at auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON journey_chapters;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON journey_chapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON journey_tasks;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON journey_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
```

- [ ] **Step 2: Add migration to db.js runMigrations()**

In `apps/api/src/config/db.js`, find the `runMigrations()` function and add migration 024 after the last migration (023). Follow the exact same pattern used for 022 and 023 — wrap in try/catch, log success.

- [ ] **Step 3: Verify migration runs**

Run: `cd apps/api && npm run dev`
Expected: Server starts without errors.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/024_idp_enhancements.sql apps/api/src/config/db.js
git commit -m "feat(idp): add schema for links, attachment ownership, requires_attachment"
```

---

## Task 2: API — Manager Editing Endpoints

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Create: `apps/api/__tests__/developmentPlans.editing.test.js`

Currently the API has PATCH endpoints for objectives and tasks, but they don't enforce the "completed tasks cannot be edited" rule, and there's no plan-level PATCH.

- [ ] **Step 1: Write failing tests for editing restrictions**

Create `apps/api/__tests__/developmentPlans.editing.test.js`. Tests:
1. PATCH task succeeds when TODO
2. PATCH task succeeds when IN_PROGRESS
3. PATCH task fails (409) when DONE
4. PATCH objective succeeds normally
5. PATCH plan title/description succeeds
6. DELETE task fails (409) when DONE

Follow the existing test fixture pattern from `developmentPlans.test.js` — reuse `global.__managerId`, `global.__userId`, `global.__managerToken`, `global.__userToken` and the `seedPlan()` helper.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npm test -- --testNamePattern="IDP Editing"`
Expected: Tests fail because (a) PATCH plan route doesn't exist, (b) completed-task guard doesn't exist.

- [ ] **Step 3: Add completed-task guard to existing PATCH/DELETE task endpoints**

In `developmentPlans.js`, find the `PATCH /:userId/tasks/:taskId` handler. Before the UPDATE query, add:

```js
const completion = await db.query(
    `SELECT progress_status FROM user_task_completions WHERE user_id = $1 AND task_id = $2`,
    [userId, taskId]
);
if (completion.rows.length > 0 && completion.rows[0].progress_status === 'DONE') {
    return res.status(409).json({ error: 'Cannot edit a completed task. Reopen it first.' });
}
```

Apply the same guard to `DELETE /:userId/tasks/:taskId`.

- [ ] **Step 4: Add PATCH plan endpoint**

Add route `PATCH /:userId/plan/:planId` that accepts `title` and `description`, validates at least one field is provided, updates `journeys` table, returns updated plan.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npm test -- --testNamePattern="IDP Editing"`
Expected: All 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.editing.test.js
git commit -m "feat(idp): add editing endpoints with completed-task guard"
```

---

## Task 3: API — Multi-Plan Support (Remove Single-Plan Constraint)

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`

Currently `POST /:userId` returns 409 if an active plan already exists. We need to allow multiple active plans.

- [ ] **Step 1: Remove the duplicate-plan check**

In `POST /:userId`, remove the block that queries for existing active plans and returns 409.

- [ ] **Step 2: Update GET /my to return ALL active plans (array)**

Change from returning a single plan object to returning an array. Extract the objective-fetching logic into a reusable `getObjectivesWithTasks(journeyId, userId)` helper and `calculateProgress(objectives)` helper at module level. Loop over all active plans.

- [ ] **Step 3: Add GET /my/plans — lightweight plan list**

Returns plan summaries with progress percentages (total_tasks, done_tasks, completion_pct). Used by the tab component.

- [ ] **Step 4: Add GET /my/plan/:planId — single plan detail**

Returns full plan with objectives, tasks, links, attachments, progress.

- [ ] **Step 5: Update manager GET /:userId**

Support both `?planId=xxx` (specific plan) and no query param (all active plans as array).

- [ ] **Step 6: Run all IDP tests**

Run: `cd apps/api && npm test -- --testNamePattern="development"`
Expected: All existing and new tests pass. (Note: existing tests that assert single-plan response shape may need updating to expect arrays.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js
git commit -m "feat(idp): support multiple active plans per resource"
```

---

## Task 4: API — Links CRUD Endpoints

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Create: `apps/api/__tests__/developmentPlans.links.test.js`

- [ ] **Step 1: Write failing tests for links**

Create `apps/api/__tests__/developmentPlans.links.test.js`. Tests:
1. Manager adds a link → 201
2. Resource views links on own task → 200 with array
3. Manager deletes a link → 200
4. Resource tries to add link → 403
5. Invalid URL/label → 400

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npm test -- --testNamePattern="IDP Task Links"`
Expected: All tests fail with 404.

- [ ] **Step 3: Add link endpoints**

Four routes:
- `POST /:userId/tasks/:taskId/links` — manager adds link (validates URL format, label required, max 500 chars)
- `GET /my/tasks/:taskId/links` — resource views links
- `GET /:userId/tasks/:taskId/links` — manager views links
- `DELETE /:userId/tasks/:taskId/links/:linkId` — manager deletes link
- `POST /my/tasks/:taskId/links` — returns 403 (resource cannot add)

- [ ] **Step 4: Include links in task responses**

In the task assembly logic, fetch links for all task IDs and attach them to each task object as `links: []`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npm test -- --testNamePattern="IDP Task Links"`
Expected: All 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.links.test.js
git commit -m "feat(idp): add learning links CRUD endpoints for tasks"
```

---

## Task 5: API — Supabase Storage Utility

**Files:**
- Create: `apps/api/src/config/storage.js`

- [ ] **Step 1: Create the storage utility**

Functions needed:
- `getStorageClient()` — lazy-initializes Supabase admin client
- `ensureBucketExists()` — creates `idp-attachments` bucket if missing
- `uploadFile(storagePath, buffer, mimeType)` — uploads to Supabase Storage
- `downloadFile(storagePath)` — downloads file buffer
- `deleteFile(storagePath)` — removes file from storage
- `createSignedUrl(storagePath, expiresIn)` — generates time-limited download URL

Uses `@supabase/supabase-js` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars. Bucket name: `idp-attachments`, public: false, 20MB limit.

- [ ] **Step 2: Verify the module loads**

Run: `cd apps/api && node -e "const s = require('./src/config/storage'); console.log(Object.keys(s))"`
Expected: Prints array of exported function names.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/storage.js
git commit -m "feat(idp): add Supabase Storage utility for file uploads"
```

---

## Task 6: API — Attachment Upload/Download/Delete Endpoints

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Create: `apps/api/__tests__/developmentPlans.attachments.test.js`

- [ ] **Step 1: Add multer config for IDP attachments**

At top of `developmentPlans.js`, add multer with `multer.memoryStorage()`, 20MB limit, MIME type whitelist (PDF, images, Office, text, CSV, ZIP).

- [ ] **Step 2: Add upload endpoints (both roles)**

- `POST /:userId/tasks/:taskId/attachments` — manager uploads (role='manager')
- `POST /my/tasks/:taskId/attachments` — resource uploads (role='resource')

Both: validate task exists in user's plan, generate storage path `idp/{userId}/{taskId}/{uploaderId}-{timestamp}-{filename}`, upload to Supabase, insert DB row.

- [ ] **Step 3: Add download endpoint**

- `GET /attachments/:attachmentId` — generates signed URL (5-min expiry). Access check: resource can only access own plan's files, manager can access team member's.

- [ ] **Step 4: Add delete endpoint**

- `DELETE /attachments/:attachmentId` — deletes from Supabase Storage + DB. Manager can delete any file; resource can only delete own uploads (`uploaded_by_role='resource'` AND `user_id=currentUser`).

- [ ] **Step 5: Include attachments in task responses**

Fetch attachments for all task IDs, group by task_id, attach to each task as `attachments: []`.

- [ ] **Step 6: Enforce requires_attachment on task completion**

In `PATCH /my/tasks/:taskId/status`, when status is DONE, check if task has `requires_attachment=true`. If yes, verify a resource-uploaded attachment exists. Return 400 if missing.

- [ ] **Step 7: Accept requires_attachment in task create/update**

In `POST /:userId/objectives/:chapterId/tasks` and `PATCH /:userId/tasks/:taskId`, accept and persist `requires_attachment` boolean.

- [ ] **Step 8: Write tests**

Create `apps/api/__tests__/developmentPlans.attachments.test.js`:
1. Manager uploads → 201
2. Resource uploads → 201
3. Download → signed URL
4. Resource deletes own → 200
5. Resource deletes manager's → 403
6. Manager deletes resource's → 200
7. DONE without attachment when requires_attachment=true → 400
8. DONE with attachment when requires_attachment=true → 200

- [ ] **Step 9: Run tests**

Run: `cd apps/api && npm test -- --testNamePattern="IDP.*attach"`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.attachments.test.js
git commit -m "feat(idp): attachment upload/download/delete with Supabase Storage and dual ownership"
```

---

## Task 7: Frontend — TypeScript Types & API Client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add new interfaces**

```ts
export interface IDPTaskLink {
    id: string;
    task_id: string;
    url: string;
    label: string;
    created_by: string;
    created_by_name?: string;
    created_at: string;
}

export interface IDPTaskAttachment {
    id: string;
    task_id: string;
    user_id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_by_role: 'manager' | 'resource';
    uploaded_at: string;
}
```

- [ ] **Step 2: Update IDPTask interface**

Add: `requires_attachment: boolean`, `links: IDPTaskLink[]`, `attachments: IDPTaskAttachment[]`

- [ ] **Step 3: Add API client functions**

Add to the development plans section of the API client:
- `addTaskLink(userId, taskId, url, label)`
- `deleteTaskLink(userId, taskId, linkId)`
- `uploadTaskAttachment(userId, taskId, file)` — FormData upload
- `uploadMyTaskAttachment(taskId, file)` — FormData upload for resource
- `getAttachmentUrl(attachmentId)` — returns signed URL
- `deleteAttachment(attachmentId)`
- `getMyPlans()` — lightweight plan list
- `getMyPlan(planId)` — single plan detail
- `updatePlan(userId, planId, data)` — PATCH plan
- `updateTask(userId, taskId, data)` — PATCH task (includes requires_attachment)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(idp): add types and API client for links, attachments, multi-plan"
```

---

## Task 8: Frontend — PlanTabs Component

**Files:**
- Create: `apps/web/src/components/idp/PlanTabs.tsx`

- [ ] **Step 1: Create PlanTabs component**

A horizontal tab bar showing plan titles with completion percentage badges. Only renders when there are 2+ plans. Clicking a tab calls `onPlanChange(planId)`. Active tab has blue bottom border. Uses Tailwind CSS following existing component patterns.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/idp/PlanTabs.tsx
git commit -m "feat(idp): add PlanTabs component for multi-plan navigation"
```

---

## Task 9: Frontend — TaskLinks Component

**Files:**
- Create: `apps/web/src/components/idp/TaskLinks.tsx`

- [ ] **Step 1: Create TaskLinks component**

Inline blue pill-style link badges. Manager sees "Add link" button that expands to URL + label inputs. Manager can delete links (X button on hover). Resource sees links as read-only clickable pills. Uses link icon SVG. Follows existing Tailwind patterns.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/idp/TaskLinks.tsx
git commit -m "feat(idp): add TaskLinks component for inline learning links"
```

---

## Task 10: Frontend — TaskAttachments Component

**Files:**
- Create: `apps/web/src/components/idp/TaskAttachments.tsx`

- [ ] **Step 1: Create TaskAttachments component**

Two sections: "Manager Materials" (purple bg) and "Submissions" (green bg). Each file row shows: file icon, clickable name (download), size, delete button (on hover, only if allowed). Upload button at bottom. Uses `formatFileSize()` helper. Enforces MIME type whitelist on file input.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/idp/TaskAttachments.tsx
git commit -m "feat(idp): add TaskAttachments component with ownership labels"
```

---

## Task 11: Frontend — Update Resource Development Plan Page

**Files:**
- Modify: `apps/web/app/development-plan/page.tsx`

- [ ] **Step 1: Add multi-plan support**

Fetch `GET /development-plans/my/plans` for plan list. Render `PlanTabs` at top. On tab change, fetch `GET /development-plans/my/plan/:planId`.

- [ ] **Step 2: Add links display to task cards**

Add `<TaskLinks links={task.links} isManager={false} />` inside each task card.

- [ ] **Step 3: Add attachments to task cards**

Add `<TaskAttachments attachments={task.attachments} isManager={false} currentUserId={userId} onUpload={...} onDelete={...} onDownload={...} />` inside each task card.

- [ ] **Step 4: Show requires_attachment badge**

For tasks with `requires_attachment=true`, show yellow "Attachment required" badge. If no resource attachment exists, show warning.

- [ ] **Step 5: Handle attachment-required error on DONE**

Catch 400 error when trying to mark DONE without attachment. Show toast/message: "This task requires an attachment before it can be marked as done."

- [ ] **Step 6: Test manually and commit**

```bash
git add apps/web/app/development-plan/page.tsx
git commit -m "feat(idp): resource plan page with multi-plan tabs, links, attachments"
```

---

## Task 12: Frontend — Update Manager IDP Builder Page

**Files:**
- Modify: `apps/web/app/manage-development-plans/[userId]/page.tsx`

- [ ] **Step 1: Add inline editing**

- Plan title: click → inline text input → PATCH
- Objective title: click → inline text input → PATCH
- Task title/description: click → inline text input → PATCH
- DONE tasks show lock icon, editing blocked with tooltip "Reopen task first"

- [ ] **Step 2: Add requires_attachment toggle**

Checkbox in add-task form and task edit UI. Shows "📎 Required" badge when checked.

- [ ] **Step 3: Integrate TaskLinks (manager mode)**

```tsx
<TaskLinks links={task.links} isManager={true} onAddLink={...} onDeleteLink={...} />
```

- [ ] **Step 4: Integrate TaskAttachments (manager mode)**

```tsx
<TaskAttachments attachments={task.attachments} isManager={true} ... />
```

- [ ] **Step 5: Add "+ New Plan" button**

Creates second plan via POST, then switches tab to it.

- [ ] **Step 6: Add multi-plan tabs**

Fetch `GET /:userId` (returns array), render `PlanTabs`.

- [ ] **Step 7: Test and commit**

```bash
git add apps/web/app/manage-development-plans/[userId]/page.tsx
git commit -m "feat(idp): manager builder with editing, multi-plan, links, attachments"
```

---

## Task 13: Frontend — Update Manager List Page

**Files:**
- Modify: `apps/web/app/manage-development-plans/page.tsx`

- [ ] **Step 1: Show plan count and progress**

- "2 Active Plans" / "1 Active Plan" / "No Plan"
- Small progress bar per plan

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/manage-development-plans/page.tsx
git commit -m "feat(idp): manager list shows multi-plan count and progress"
```

---

## Task 14: Environment & Deployment Setup

**Files:**
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Install Supabase JS client**

Run: `cd apps/api && npm install @supabase/supabase-js`

- [ ] **Step 2: Update .env.example**

Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 3: Update deploy.yml**

Add both vars to secrets list and env file writing section. Use `printf '%s\n'` to avoid shell interpolation.

- [ ] **Step 4: Create Supabase Storage bucket**

Create `idp-attachments` bucket via Supabase dashboard or rely on `ensureBucketExists()` in storage.js.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json .env.example .github/workflows/deploy.yml
git commit -m "feat(idp): add Supabase Storage dependency and env config"
```

---

## Edge Cases & Risks

| Risk | Mitigation |
|------|------------|
| **Supabase Storage unavailable** | API returns 503 on upload. Existing plans still load (attachments unavailable, not plan-breaking). |
| **Large files (20MB)** | Multer + Supabase bucket both enforce 20MB limit. |
| **Signed URL expiration** | 5-min expiry. Frontend re-fetches URL on each download click. |
| **Multiple uploads per task** | Allowed. No UNIQUE constraint on (task_id, user_id). Each upload is a separate row. |
| **Race condition on requires_attachment** | DB check in same handler as status update. Low risk. |
| **Orphaned files in Storage** | If DB DELETE succeeds but Storage DELETE fails, file becomes orphaned. Acceptable for now, add cleanup cron later. |
| **Manager deletes resource's proof** | Manager has full control. Resource re-uploads if accidental. Consider soft-delete later. |
| **Container rebuild** | Files in Supabase Storage (cloud), not local disk. Safe. |
| **Backward compatibility** | Onboarding journeys use local disk. Only IDP uses Supabase Storage. `uploaded_by_role` defaults to 'resource'. |
| **One-active-plan removal** | Frontend must handle plan arrays instead of single objects. History page unaffected. |

---

## Summary of Deliverables

| # | Feature | Key Changes |
|---|---------|-------------|
| 1 | Schema | `idp_task_links` table, `uploaded_by_role` + `storage_path` on attachments, `requires_attachment` on tasks |
| 2 | Manager Editing | PATCH plan/objective/task with completed-task guard (409) |
| 3 | Multi-Plan | Remove 1-active constraint, return plan arrays, tab navigation |
| 4 | Links | Full CRUD for manager, read-only for resource, inline pills |
| 5 | Storage Utility | Supabase Storage client with upload/download/delete/signedUrl |
| 6 | Attachments | Dual-ownership upload via Supabase Storage, signed URL download, role-based delete |
| 7 | Frontend Types | Updated IDPTask, new IDPTaskLink, IDPTaskAttachment interfaces |
| 8-10 | Frontend Components | PlanTabs, TaskLinks, TaskAttachments |
| 11-13 | Frontend Pages | Resource plan + Manager builder + Manager list updated |
| 14 | Deployment | Supabase JS dependency, env vars, deploy.yml |
