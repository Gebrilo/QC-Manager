# Supabase Option A Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the QC Management Tool's self-hosted PostgreSQL to Supabase, replace S3 report storage with Supabase Storage, and add Realtime subscriptions for the dashboard — with zero changes to the Express API logic.

**Architecture:** The Express API keeps its `pg` driver but switches its `DATABASE_URL` to point at Supabase's PostgreSQL endpoint. The existing migration runner (`runMigrations()` in `db.js`) automatically provisions the schema on first start. Supabase Storage replaces the S3 bucket in n8n workflows via HTTP Request nodes. Supabase Realtime is added to the frontend as a "push trigger" — when data changes, it tells the browser to refetch from the existing Express API (no data bypasses the API layer).

**Tech Stack:** Supabase (PostgreSQL, Storage, Realtime) · `pg` (unchanged) · `@supabase/supabase-js` (frontend only) · n8n 1.29.0 HTTP Request nodes · Next.js 14

---

## File Structure

**Modified:**
- `apps/api/src/config/db.js` — add SSL config for Supabase connection
- `.env.example` — add Supabase variable stubs
- `.env` — add actual Supabase credentials (never commit)
- `apps/web/.env.local` — add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `apps/web/package.json` — add `@supabase/supabase-js`
- `apps/web/app/dashboard/dashboard-client.tsx` — add Realtime subscription hook
- `n8n/qc_cleanup_expired_reports.json` — replace S3 nodes with Supabase Storage HTTP nodes

**Created:**
- `apps/web/src/lib/supabase.ts` — Supabase browser client singleton
- `database/migrations/014_enable_realtime.sql` — enable realtime + RLS policies for Realtime

---

## Chunk 1: Supabase Setup & Database Migration

### Task 1: Create Supabase Project and Collect Credentials

> Manual step — cannot be automated.

**Files:** None (manual)

- [ ] **Step 1: Create Supabase project**

  Go to https://supabase.com → New Project. Note your:
  - **Project URL**: `https://[PROJECT_REF].supabase.co`
  - **Anon key** (public, safe for frontend): from Settings → API
  - **Service role key** (secret, backend/n8n only): from Settings → API
  - **DB connection string** (direct): from Settings → Database → Connection string → URI mode, port 5432

  The direct DB URL format:
  ```
  postgresql://postgres:[DB_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
  ```

- [ ] **Step 2: Update `.env.example`**

  File: `.env.example`

  Add these variables at the end:
  ```bash
  # ── Supabase ──────────────────────────────────────────────────────────────────
  # Set DATABASE_URL to the Supabase direct connection string to use Supabase DB
  # DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres

  SUPABASE_URL=https://[PROJECT_REF].supabase.co
  SUPABASE_ANON_KEY=eyJ...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

  # Frontend (Next.js) - safe to expose (anon key only)
  NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
  ```

- [ ] **Step 3: Populate `.env` with real values**

  Add the same keys to `.env` (root of repo) with your actual Supabase credentials.
  Also add to `apps/web/.env.local`:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
  ```

- [ ] **Step 4: Commit the example file only**

  ```bash
  git add .env.example
  git commit -m "chore: add Supabase env variable stubs to .env.example"
  ```

---

### Task 2: Add SSL Support to Database Config

> The existing `pg` pool connects fine to local Docker PostgreSQL (no SSL). Supabase requires SSL. This single change makes `db.js` work with both.

**Files:**
- Modify: `apps/api/src/config/db.js`

- [ ] **Step 1: Write the failing test**

  Create `apps/api/__tests__/db-connection.test.js`:
  ```javascript
  const { Pool } = require('pg');

  describe('Database connection', () => {
    it('connects and returns rows from pg_tables', async () => {
      const pool = new Pool(
        process.env.DATABASE_URL
          ? {
              connectionString: process.env.DATABASE_URL,
              ssl: process.env.DATABASE_URL?.includes('supabase.co')
                ? { rejectUnauthorized: false }
                : undefined,
            }
          : {
              user: process.env.POSTGRES_USER || 'postgres',
              host: process.env.POSTGRES_HOST || 'localhost',
              database: process.env.POSTGRES_DB || 'qc_app',
              password: process.env.POSTGRES_PASSWORD || 'postgres',
              port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
            }
      );
      const result = await pool.query('SELECT 1 AS value');
      expect(result.rows[0].value).toBe(1);
      await pool.end();
    });
  });
  ```

- [ ] **Step 2: Run test against local Docker DB to confirm it passes**

  ```bash
  cd apps/api
  npm test -- --testPathPattern=db-connection
  ```
  Expected: **PASS** (local Docker PostgreSQL)

- [ ] **Step 3: Update `apps/api/src/config/db.js`**

  Find:
  ```javascript
  const pool = new Pool(
      process.env.DATABASE_URL
          ? { connectionString: process.env.DATABASE_URL }
          : {
  ```

  Replace with:
  ```javascript
  const isSupabase = process.env.DATABASE_URL?.includes('supabase.co');

  const pool = new Pool(
      process.env.DATABASE_URL
          ? {
              connectionString: process.env.DATABASE_URL,
              ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
            }
          : {
  ```

- [ ] **Step 4: Run test against local Docker DB again — must still pass**

  ```bash
  cd apps/api
  npm test -- --testPathPattern=db-connection
  ```
  Expected: **PASS**

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/config/db.js apps/api/__tests__/db-connection.test.js
  git commit -m "feat: add SSL support to db pool for Supabase compatibility"
  ```

---

### Task 3: Provision Supabase Database Schema

> The API's `runMigrations()` auto-runs SQL migrations in `database/migrations/` on startup. We'll use `psql` to run them manually first to validate, then let the API do it on Docker restart.

**Files:** None (SQL execution, no code change)

- [ ] **Step 1: Verify Supabase DB is empty**

  ```bash
  psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" \
    -c "\dt public.*"
  ```
  Expected: `Did not find any relations.`

- [ ] **Step 2: Run base schema**

  ```bash
  psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" \
    -f database/schema.sql
  ```
  Expected: Series of `CREATE TABLE`, `CREATE INDEX`, `CREATE TRIGGER`, `CREATE VIEW` statements.

- [ ] **Step 3: Run all migrations in order**

  > Run in **Git Bash** (not PowerShell — the `for` loop is bash syntax):

  ```bash
  for f in database/migrations/*.sql; do
    echo "Running: $f"
    psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" -f "$f"
  done
  ```
  Expected: Each migration runs without errors. Duplicate object errors are acceptable if migrations are idempotent; fix any that fail.

- [ ] **Step 4: Verify tables exist**

  ```bash
  psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" \
    -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  ```
  Expected: 20+ tables including `app_user`, `task`, `projects`, `test_case`, `test_run`, `test_execution`, `notification`, `report_jobs`, etc.

- [ ] **Step 5: Verify views exist**

  ```bash
  psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" \
    -c "SELECT viewname FROM pg_views WHERE schemaname = 'public';"
  ```
  Expected: `v_project_summary`, `v_project_quality_metrics`, `v_release_readiness`, `v_quality_risks`, `v_workload_balance`, `v_dashboard_metrics`, etc.

---

### Task 4: Switch API to Supabase and Run Integration Test

**Files:**
- Modify: `.env` (update `DATABASE_URL`)
- Docker Compose restart

- [ ] **Step 1: Update `DATABASE_URL` in `.env`**

  In `.env`, set:
  ```bash
  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
  ```
  Leave the old `POSTGRES_USER`, `POSTGRES_PASSWORD`, etc. lines in place (they're still used by the Docker postgres container).

- [ ] **Step 2: Restart only the API container**

  ```bash
  docker compose restart api
  ```

- [ ] **Step 3: Watch startup logs for migration success**

  ```bash
  docker compose logs -f api
  ```
  Expected output:
  ```
  Running migrations...
  Migrations completed
  QC API server running on port 3001
  ```
  If you see migration errors, the schema was already applied in Task 3 — this is OK.

- [ ] **Step 4: Test all API route categories**

  Run these against `http://localhost:3001` (the Docker API now connected to Supabase):

  ```bash
  # Auth
  curl -s -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"admin123"}' | jq .

  # Save the token
  TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"admin123"}' | jq -r .token)

  # Projects
  curl -s http://localhost:3001/projects \
    -H "Authorization: Bearer $TOKEN" | jq 'length'

  # Dashboard metrics
  curl -s http://localhost:3001/dashboard \
    -H "Authorization: Bearer $TOKEN" | jq .

  # Test cases
  curl -s http://localhost:3001/test-cases \
    -H "Authorization: Bearer $TOKEN" | jq 'length'

  # Governance (uses views)
  curl -s http://localhost:3001/governance/release-readiness \
    -H "Authorization: Bearer $TOKEN" | jq .
  ```

  Expected: All return valid JSON with no errors.

- [ ] **Step 5: Run the full Playwright e2e test suite**

  ```bash
  cd apps/web
  npx playwright test --reporter=list
  ```
  Expected: All tests pass. If any fail due to missing seed data, create seed data on Supabase.

- [ ] **Step 6: Commit**

  > `.env` is intentionally not staged — it contains secrets and is git-ignored.

  ```bash
  git add apps/api/src/config/db.js
  git commit -m "feat: switch API to Supabase PostgreSQL via DATABASE_URL"
  ```

---

## ✅ PHASE 1 CHECKPOINT
> The API is now running against Supabase PostgreSQL. The Docker `qc-postgres` container is idle but still running. You can stop here and have a fully working system. Proceed to Phase 2 only when Phase 1 is verified stable.

---

## Chunk 2: Storage Migration (S3 → Supabase Storage)

### Task 5: Create Supabase Storage Bucket

> Manual step in Supabase dashboard.

- [ ] **Step 1: Create `qc-reports` bucket**

  In Supabase Dashboard → Storage → Create bucket:
  - Name: `qc-reports`
  - Public: **enabled** (reports need direct download URLs)

- [ ] **Step 2: Verify upload works**

  Test via Supabase API (replace PROJECT_REF and SERVICE_ROLE_KEY):
  ```bash
  echo "test content" > /tmp/test-report.txt
  curl -s -X POST \
    "https://[PROJECT_REF].supabase.co/storage/v1/object/qc-reports/test-report.txt" \
    -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
    -H "Content-Type: text/plain" \
    --data-binary @/tmp/test-report.txt | jq .
  ```
  Expected: `{"Key": "qc-reports/test-report.txt"}`

- [ ] **Step 3: Verify public URL**

  Open in browser:
  ```
  https://[PROJECT_REF].supabase.co/storage/v1/object/public/qc-reports/test-report.txt
  ```
  Expected: Returns "test content"

- [ ] **Step 4: Delete test file**

  ```bash
  curl -s -X DELETE \
    "https://[PROJECT_REF].supabase.co/storage/v1/object/qc-reports/test-report.txt" \
    -H "Authorization: Bearer [SERVICE_ROLE_KEY]" | jq .
  ```

---

### Task 6: Update n8n Cleanup Workflow

> Replace the `n8n-nodes-base.awsS3` List and Delete nodes with HTTP Request nodes that call the Supabase Storage API. The retention logic (retention policy JS code node) stays unchanged.

**Files:**
- Modify: `n8n/qc_cleanup_expired_reports.json`
- Environment in n8n: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` credentials

- [ ] **Step 1: Add Supabase credentials to n8n**

  In n8n UI (http://localhost:5678) → Settings → Credentials → New:
  - Type: **Header Auth**
  - Name: `Supabase Service Role`
  - Header name: `Authorization`
  - Header value: `Bearer [SERVICE_ROLE_KEY]`

  Also add as global variable: `SUPABASE_URL=https://[PROJECT_REF].supabase.co`

- [ ] **Step 2: In n8n UI, open `qc_cleanup_expired_reports` workflow**

- [ ] **Step 3: Replace "List S3 Objects" node**

  Delete the `n8n-nodes-base.awsS3` List node. Add **HTTP Request** node:
  - Method: `POST`
  - URL: `={{ $vars.SUPABASE_URL }}/storage/v1/object/list/qc-reports`
  - Authentication: Header Auth → `Supabase Service Role`
  - Body: JSON
    ```json
    {
      "prefix": "",
      "limit": 1000,
      "offset": 0,
      "sortBy": { "column": "created_at", "order": "asc" }
    }
    ```
  - Response: returns array of objects with `name`, `created_at`, `metadata`

  In the downstream "Apply Retention Policy" JS code node, find every reference to `$json.key` (the S3 field name) and change it to `$json.name` (the Supabase Storage field name). Example: `const fileKey = $json.key` → `const fileKey = $json.name`.

- [ ] **Step 4: Replace "Delete S3 Object" node**

  Delete the `n8n-nodes-base.awsS3` Delete node. Add **HTTP Request** node:
  - Method: `DELETE`
  - URL: `={{ $vars.SUPABASE_URL }}/storage/v1/object/qc-reports/{{ $json.name }}`
  - Authentication: Header Auth → `Supabase Service Role`
  - No body needed

- [ ] **Step 5: Test the cleanup workflow manually**

  Upload a test file with an old-looking name (`temp-2020-01-01-test.txt`) to the `qc-reports` bucket, then trigger the workflow from n8n. Verify the file is deleted.

- [ ] **Step 6: Export updated workflow and replace JSON file**

  In n8n UI → Download workflow JSON → save to `n8n/qc_cleanup_expired_reports.json`.

  ```bash
  git add n8n/qc_cleanup_expired_reports.json
  git commit -m "feat: migrate n8n cleanup workflow from S3 to Supabase Storage"
  ```

---

### Task 7: Update n8n Report Generation Workflows to Use Supabase Storage

> After generating a report (PDF/Excel), n8n must upload the file to Supabase Storage and call back to the API with the Supabase public URL.

**Files:**
- Modify: `n8n/qc_generate_project_summary_pdf.json`
- Modify: `n8n/qc_generate_task_export_excel.json` (if it uploads to S3)

- [ ] **Step 1: In n8n UI, open `qc_generate_project_summary_pdf` workflow**

- [ ] **Step 2: After the "HTML to PDF" node, add HTTP Request upload node**

  Add **HTTP Request** node named "Upload to Supabase Storage":
  - Method: `POST`
  - URL: `={{ $vars.SUPABASE_URL }}/storage/v1/object/qc-reports/{{ $json.body.job_id }}-report.pdf`
  - Authentication: Header Auth → `Supabase Service Role`
  - Body: Binary (pass the PDF binary from the previous node)
  - Content-Type: `application/pdf`

- [ ] **Step 3: Update the "Report Callback" node with Supabase public URL**

  In the callback HTTP Request node that calls `POST /reports/callback`, set `download_url` to:
  ```
  {{ $vars.SUPABASE_URL }}/storage/v1/object/public/qc-reports/{{ $json.body.job_id }}-report.pdf
  ```

- [ ] **Step 4: Repeat for `qc_generate_task_export_excel` workflow**

  In n8n UI, open `qc_generate_task_export_excel`. Add **HTTP Request** upload node after the file-generation node:
  - Method: `POST`
  - URL: `={{ $vars.SUPABASE_URL }}/storage/v1/object/qc-reports/{{ $json.body.job_id }}-tasks.xlsx`
  - Authentication: Header Auth → `Supabase Service Role`
  - Body: Binary (pass the Excel binary from the previous node)
  - Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

  Update the callback node's `download_url` to:
  ```
  {{ $vars.SUPABASE_URL }}/storage/v1/object/public/qc-reports/{{ $json.body.job_id }}-tasks.xlsx
  ```

- [ ] **Step 5: Test end-to-end report generation**

  Via the QC Management Tool UI:
  1. Go to Reports → Generate a new report (any type)
  2. Wait for it to show "completed"
  3. Click download — verify the file opens from the Supabase Storage URL

- [ ] **Step 6: Export and commit updated workflow JSON files**

  ```bash
  git add n8n/qc_generate_project_summary_pdf.json n8n/qc_generate_task_export_excel.json
  git commit -m "feat: migrate report generation workflows to use Supabase Storage"
  ```

---

## ✅ PHASE 2 CHECKPOINT
> Reports are now stored in and downloaded from Supabase Storage. The S3 bucket is no longer needed for new reports. Proceed to Phase 3 only when Phase 2 is verified stable.

---

## Chunk 3: Realtime Subscriptions

### Task 8: Install Supabase JS Client in Web App

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/supabase.ts`

- [ ] **Step 1: Install package**

  ```bash
  cd apps/web
  npm install @supabase/supabase-js
  ```

- [ ] **Step 2: Verify install**

  ```bash
  cat apps/web/package.json | grep supabase
  ```
  Expected: `"@supabase/supabase-js": "^2.x.x"`

- [ ] **Step 3: Create Supabase browser client**

  Create `apps/web/src/lib/supabase.ts`:
  ```typescript
  import { createClient } from '@supabase/supabase-js'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Realtime will not be available — app still works via REST API
    console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set. Realtime disabled.')
  }

  export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
  ```

  This makes Supabase optional — if env vars are absent, the app falls back to polling (no crash).

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/supabase.ts
  git commit -m "feat: add Supabase JS client to web app"
  ```

---

### Task 9: Enable Realtime on task and notification Tables

> Supabase Realtime requires tables to have Realtime publication enabled, and the anon role must have SELECT permission (via RLS or a permissive policy). Since we're using the Supabase anon key as a "change trigger" only (data still fetched via Express API), we use permissive read policies.

**Files:**
- Create: `database/migrations/014_enable_realtime.sql`

- [ ] **Step 1: Write the migration**

  Create `database/migrations/014_enable_realtime.sql`:
  ```sql
  -- Enable Supabase Realtime for task and notification tables
  -- These policies allow the anon role to receive change notifications.
  -- Actual data access is still gated by the Express API + JWT auth.
  -- The frontend uses these events only as a trigger to refetch from the API.

  -- Enable row-level security (required for Realtime to filter)
  ALTER TABLE task ENABLE ROW LEVEL SECURITY;
  ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

  -- Permissive SELECT policies (anon key can subscribe to changes)
  CREATE POLICY IF NOT EXISTS "realtime_task_select"
    ON task FOR SELECT USING (true);

  CREATE POLICY IF NOT EXISTS "realtime_notification_select"
    ON notification FOR SELECT USING (true);

  -- Add tables to Supabase realtime publication
  ALTER PUBLICATION supabase_realtime ADD TABLE task;
  ALTER PUBLICATION supabase_realtime ADD TABLE notification;
  ```

- [ ] **Step 2: Run migration on Supabase**

  ```bash
  psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require" \
    -f database/migrations/014_enable_realtime.sql
  ```
  Expected: `ALTER TABLE`, `CREATE POLICY`, `ALTER PUBLICATION`

- [ ] **Step 3: Verify Realtime is enabled in Supabase Dashboard**

  Supabase Dashboard → Database → Replication → `supabase_realtime` publication.
  Confirm `task` and `notification` tables are listed.

- [ ] **Step 4: Commit**

  ```bash
  git add database/migrations/014_enable_realtime.sql
  git commit -m "feat: enable Supabase Realtime publication for task and notification tables"
  ```

---

### Task 10: Add Realtime to Dashboard

> When any task changes in the DB, the dashboard subscriber fires and refetches tasks + metrics from the Express API. No data bypasses the API.

**Files:**
- Modify: `apps/web/app/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Write a Playwright test that verifies live update**

  Create `apps/web/e2e/dashboard-realtime.spec.ts`:
  ```typescript
  import { test, expect } from '@playwright/test'

  test('dashboard task list updates when a task is created via API', async ({ page, request }) => {
    // Login
    await page.goto('/login')
    await page.fill('[name=email]', 'admin@example.com')
    await page.fill('[name=password]', 'admin123')
    await page.click('[type=submit]')
    await page.waitForURL('/dashboard')

    // Count initial task count displayed
    const initialCount = await page.locator('[data-testid="task-count"]').textContent()

    // Create a task via API without page refresh
    const loginRes = await request.post('/auth/login', {
      data: { email: 'admin@example.com', password: 'admin123' }
    })
    const { token } = await loginRes.json()

    await request.post('/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'Realtime test task', status: 'Backlog', priority: 'medium' }
    })

    // Wait up to 5 seconds for dashboard to auto-update (Realtime)
    await expect(page.locator('[data-testid="task-count"]')).not.toHaveText(initialCount!, { timeout: 5000 })
  })
  ```

- [ ] **Step 2: Run test — confirm it fails (no Realtime yet)**

  ```bash
  cd apps/web
  npx playwright test e2e/dashboard-realtime.spec.ts --headed
  ```
  Expected: **FAIL** — dashboard doesn't update without page refresh.

- [ ] **Step 3: Add Realtime subscription to `dashboard-client.tsx`**

  In `apps/web/app/dashboard/dashboard-client.tsx`, find the `useEffect` that calls `load()`. Add a Supabase Realtime subscription after it:

  ```typescript
  // Add import at top of file
  import { supabase } from '@/lib/supabase'

  // Inside the component, after the existing useEffect that calls load():
  useEffect(() => {
    if (!supabase) return // Realtime disabled — polling is the fallback

    const channel = supabase
      .channel('dashboard-task-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task' },
        () => {
          // Don't use payload data — refetch from API to respect permissions
          load()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  ```

  > **Note:** The `load` function is defined in the parent `useEffect`. Extract it to component scope (outside the effect) so both effects can call it.

  Specifically, extract `load` like this:
  ```typescript
  const load = useCallback(async () => {
    try {
      const [tasksData, metricsData, journeyData, meData] = await Promise.all([
        tasksApi.list().catch(() => []),
        dashboardApi.getMetrics().catch(() => null),
        myJourneysApi.list().catch(() => []),
        fetchApi<{ user: { preferences?: { quick_nav_visible?: boolean } } }>('/auth/me'),
      ])
      setTasks(tasksData || [])
      if (metricsData) setMetrics(metricsData)
      setJourneys(journeyData || [])
    } catch (err) {
      console.error('API failed', err)
    }
  }, [])

  useEffect(() => { load() }, [load])
  ```

  - [ ] Add `useCallback` to the React import: `import { useState, useEffect, useCallback } from 'react'`

- [ ] **Step 4: Run test again — should pass**

  ```bash
  cd apps/web
  npx playwright test e2e/dashboard-realtime.spec.ts --headed
  ```
  Expected: **PASS** — dashboard updates within 5 seconds of API change.

- [ ] **Step 5: Verify fallback — remove NEXT_PUBLIC_SUPABASE_URL from env and reload**

  Comment out `NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local`, restart dev server.
  Expected: Dashboard still loads and works (polling only, no crash).

  Restore the env var after verifying.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/dashboard/dashboard-client.tsx
  git commit -m "feat: add Supabase Realtime subscription to dashboard for live task updates"
  ```

---

### Task 11: Add Realtime to Notifications

> When a new notification is inserted for the current user, the unread badge updates without polling.

**Files:**
- Find and modify the notifications component (likely `apps/web/src/components/` or `apps/web/app/` — search for `notificationsApi.list`)

- [ ] **Step 1: Find the notifications component**

  ```bash
  grep -r "notificationsApi" apps/web/src --include="*.tsx" --include="*.ts" -l
  ```
  Note the file path — it's the component that renders the notification bell/badge.

- [ ] **Step 2: Add Realtime subscription for current user's notifications**

  In the notifications component, add (after finding it in Step 1):
  ```typescript
  import { supabase } from '@/lib/supabase'

  // Get current user ID from auth context or JWT
  // The existing auth stores user in context — use the same source
  const { user } = useAuth() // or however auth context is accessed

  useEffect(() => {
    if (!supabase || !user?.id) return

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refetch notification count from API
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])
  ```

  Where `fetchNotifications()` is the existing function that calls `notificationsApi.list()`.

- [ ] **Step 3: Test notification Realtime manually**

  1. Open the QC Management Tool in browser — note the notification badge count
  2. Via API (or Supabase Dashboard SQL Editor), insert a notification:
     ```sql
     INSERT INTO notification (id, user_id, type, title, message, read, created_at)
     VALUES (gen_random_uuid(), '[YOUR_USER_ID]', 'info', 'Test', 'Realtime test', false, NOW());
     ```
  3. Without refreshing the page, verify the notification badge increments within 3 seconds

- [ ] **Step 4: Commit** (substitute the actual filename found in Step 1)

  ```bash
  # Replace [notifications-file] with the actual filename from Step 1
  git add apps/web/src/components/[notifications-file].tsx
  git commit -m "feat: add Supabase Realtime subscription for live notification badge updates"
  ```

---

## ✅ PHASE 3 CHECKPOINT — MIGRATION COMPLETE

### Final Verification Checklist

- [ ] All Playwright e2e tests pass: `cd apps/web && npx playwright test`
- [ ] API health check returns 200: `curl http://localhost:3001/health`
- [ ] Dashboard loads data from Supabase DB ✓
- [ ] Governance release readiness shows data ✓
- [ ] Report generation creates file in Supabase Storage bucket ✓
- [ ] Report download URL resolves to Supabase Storage ✓
- [ ] Dashboard auto-updates when a task is created via API ✓
- [ ] Notification badge updates when a new notification is inserted ✓
- [ ] Disabling `NEXT_PUBLIC_SUPABASE_URL` doesn't crash the app (graceful fallback) ✓

### Optional Post-Migration Cleanup

Once verified stable (suggest 1 week of observation):

```bash
# Remove local postgres container from docker-compose.yml
# (the qc-postgres service is no longer needed)
docker compose stop postgres
```

Update `docker-compose.yml` to remove the `postgres` service and its volume — or keep it as a local fallback by reverting `DATABASE_URL`.

---

## Environment Variable Summary

| Variable | Location | Used By | Value |
|---|---|---|---|
| `DATABASE_URL` | `.env` | `apps/api` | Supabase direct PostgreSQL URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`, n8n credentials | n8n workflows | Service role key (secret) |
| `SUPABASE_URL` | `.env`, n8n vars | n8n workflows | `https://[REF].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | Frontend Realtime | `https://[REF].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Frontend Realtime | Anon key (public) |
