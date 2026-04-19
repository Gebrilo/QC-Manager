# Bug Source Classification — Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every layer of the Bug Source Classification feature (DB → API → n8n → Frontend) is correctly wired in production after the 2026-04-01 deploy and hotfixes.

**Architecture:** The feature adds a `source TEXT` column to the `bugs` table (`TEST_CASE` | `EXPLORATORY`), propagates it through two DB views (`v_bug_summary`, `v_bug_summary_global`), exposes `by_source` in the `/api/bugs/summary` endpoint, and renders it as a pie chart (`BugsBySourceChart`) on the Quality and Governance pages. The n8n Transform Bug Data node classifies source at ingest time.

**Tech Stack:** PostgreSQL (Supabase self-hosted), Node/Express API (`qc-api` container), Next.js frontend (`qc-web`), n8n (`BugSync001TuleapQC` workflow), SQLite (n8n state)

---

## Files of Interest

| File | Role |
|------|------|
| `apps/api/src/config/db.js` lines ~351–367 | `source` column migration + views |
| `apps/api/src/config/db.js` lines ~488–544 | `v_bug_summary` + `v_bug_summary_global` view definitions |
| `apps/api/src/routes/bugs.js` lines ~11–75 | `/summary` endpoint — `by_source` response |
| `apps/api/src/routes/bugs.js` line ~325 | PATCH `allowedFields` — `source` must be present |
| `apps/api/src/routes/tuleapWebhook.js` lines ~238–370 | INSERT/UPDATE bug — `source` at positions $11/$12 |
| `apps/web/src/components/BugsBySourceChart.tsx` | Pie chart component |
| `apps/web/app/projects/[id]/quality/page.tsx` lines ~148–170 | Quality page renders cards + chart |
| `apps/web/app/governance/page.tsx` | Governance page — confirm bug summary section exists |
| `apps/web/src/lib/api.ts` lines ~320, 341–343 | `Bug.source` type + `by_source` in summary type |
| `n8n-workflows/tuleap-bug-sync.json` | Source of truth workflow file |
| `scripts/backfill-bug-source.sql` | One-time backfill for existing bugs |

---

## Known Issues Going In

1. **Migration timing (2026-04-01)** — `source` `IF NOT EXISTS` migration reported success but didn't apply; fixed manually. Verify column is confirmed present.
2. **Duplicate view (fixed commit 50b0f97)** — second `CREATE OR REPLACE VIEW v_bug_summary_global` was overwriting source columns. Verify single correct view is live.
3. **Backfill not confirmed** — all 4 current bugs show `EXPLORATORY`. Verify if backfill SQL was run or if that's accurate data.
4. **n8n active workflow** — `BugSync001TuleapQC` (id `BugSync001TuleapQC`) is the live workflow; `Tuleap Bug Sync` (id `UtENMnhiLp1C7icya6VC2`) is inactive/stale. Confirm active one has the source Transform logic.

---

## Task 1: Verify DB Schema

**Files:** None modified — read-only DB checks.

- [ ] **Step 1: Confirm `source` column exists with constraint and indexes**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d bugs" | grep -E "source|idx_bug"
```

Expected output:
```
 source                   | text                     |           |          | 'EXPLORATORY'::text
    "idx_bug_source" btree (source)
    "idx_bug_project_source" btree (project_id, source) WHERE deleted_at IS NULL
    "source_check" CHECK (source = ANY (ARRAY['TEST_CASE'::text, 'EXPLORATORY'::text]))
```

If missing: run DDL manually —
```bash
docker exec supabase-db psql -U postgres -d postgres -c "
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'EXPLORATORY';
ALTER TABLE bugs ADD CONSTRAINT IF NOT EXISTS source_check CHECK (source IN ('TEST_CASE', 'EXPLORATORY'));
CREATE INDEX IF NOT EXISTS idx_bug_source ON bugs(source);
CREATE INDEX IF NOT EXISTS idx_bug_project_source ON bugs(project_id, source) WHERE deleted_at IS NULL;
"
```

- [ ] **Step 2: Confirm `v_bug_summary` has source columns**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d v_bug_summary" | grep -E "bugs_from"
```

Expected output:
```
 bugs_from_test_cases  | bigint
 bugs_from_exploratory | bigint
```

If missing: the API container needs restarting to re-run migrations —
```bash
docker compose -f /opt/qc-manager/docker-compose.prod.yml restart api
# wait 10 seconds, then re-check
```

- [ ] **Step 3: Confirm `v_bug_summary_global` has source columns AND no duplicate bug**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d v_bug_summary_global" | grep -E "bugs_from|standalone"
```

Expected output (all four columns — both source and legacy):
```
 bugs_from_test_cases  | bigint
 bugs_from_exploratory | bigint
 bugs_from_testing     | bigint
 standalone_bugs       | bigint
```

If missing only source columns: the duplicate-view bug (commit 50b0f97) has regressed — redeploy API and restart:
```bash
docker compose -f /opt/qc-manager/docker-compose.prod.yml restart api
```

- [ ] **Step 4: Query the views to confirm they return numeric values (not null)**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT bugs_from_test_cases, bugs_from_exploratory FROM v_bug_summary_global;"
```

Expected: Two integer columns, no NULLs (may be 0 if backfill not yet run).

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT project_id, bugs_from_test_cases, bugs_from_exploratory FROM v_bug_summary LIMIT 5;"
```

Expected: Rows with numeric values in both source columns.

- [ ] **Step 5: Check current source distribution**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT source, COUNT(*) FROM bugs WHERE deleted_at IS NULL GROUP BY source ORDER BY count DESC;"
```

Record the output. If all bugs are `EXPLORATORY` and some have `linked_test_case_ids` or `linked_test_execution_ids` set, the backfill has NOT been run → proceed to Task 2. If the distribution looks reasonable, backfill was already applied.

---

## Task 2: Run Backfill (if needed)

**Files:**
- Run: `scripts/backfill-bug-source.sql`

Only proceed if Task 1 Step 5 shows bugs with non-empty `linked_test_case_ids` that are classified `EXPLORATORY`.

- [ ] **Step 1: Check if any bugs have linked arrays that contradict their current source**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT COUNT(*) AS should_be_test_case
FROM bugs
WHERE deleted_at IS NULL
  AND source = 'EXPLORATORY'
  AND (
    (linked_test_case_ids IS NOT NULL AND linked_test_case_ids != '{}')
    OR (linked_test_execution_ids IS NOT NULL AND linked_test_execution_ids != '{}')
  );
"
```

If count > 0: run the backfill. If count = 0: skip to Task 3.

- [ ] **Step 2: Copy backfill SQL into container and run**

```bash
docker cp /root/QC-Manager/scripts/backfill-bug-source.sql supabase-db:/tmp/backfill-bug-source.sql
docker exec supabase-db psql -U postgres -d postgres -f /tmp/backfill-bug-source.sql
```

Expected output ends with:
```
 source      | count
-------------+-------
 EXPLORATORY | N
 TEST_CASE   | M
(2 rows)
```

- [ ] **Step 3: Verify no null source values remain**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM bugs WHERE deleted_at IS NULL AND source IS NULL;"
```

Expected: `0`

---

## Task 3: Verify API Summary Endpoint

**Files:**
- `apps/api/src/routes/bugs.js` lines 11–75

- [ ] **Step 1: Get a valid auth token from the running API**

```bash
# Use a known user — replace EMAIL and PASSWORD with valid credentials from env
TOKEN=$(curl -s -X POST https://api.gebrils.cloud/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','NO_TOKEN'))")
echo "Token: ${TOKEN:0:40}..."
```

- [ ] **Step 2: Call the summary endpoint and inspect `by_source`**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.gebrils.cloud/api/bugs/summary" \
  | python3 -m json.tool | grep -A4 "by_source"
```

Expected:
```json
"by_source": {
    "test_case": <number>,
    "exploratory": <number>
}
```

Failure patterns:
- `"by_source": {}` or missing → view columns not reaching the API; restart API container
- `"by_source": {"test_case": null, ...}` → `parseInt(null)` returns NaN, then `|| 0` should catch it — but if you see null, check the view query in `db.js`
- `"error": "..."` → API error; check `docker logs qc-api`

- [ ] **Step 3: Call summary with a project_id and confirm per-project data**

```bash
# Get a project ID first
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.gebrils.cloud/api/projects" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); [print(r['id'],r.get('project_name','')) for r in rows[:3]]"

# Then call summary filtered by project
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.gebrils.cloud/api/bugs/summary?project_id=<PROJECT_ID>" \
  | python3 -m json.tool | grep -A4 "by_source"
```

Expected: same structure, numbers scoped to the project.

- [ ] **Step 4: Verify PATCH accepts `source` field**

```bash
# Get a bug ID
BUG_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.gebrils.cloud/api/bugs?limit=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])")

# PATCH source to TEST_CASE
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"TEST_CASE"}' \
  "https://api.gebrils.cloud/api/bugs/$BUG_ID" \
  | python3 -m json.tool | grep "source"
```

Expected: response contains `"source": "TEST_CASE"`.

Then restore:
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"EXPLORATORY"}' \
  "https://api.gebrils.cloud/api/bugs/$BUG_ID" \
  | python3 -m json.tool | grep "source"
```

---

## Task 4: Verify n8n Workflow

**Files:**
- `n8n-workflows/tuleap-bug-sync.json`

- [ ] **Step 1: Confirm `BugSync001TuleapQC` is active**

```bash
python3 -c "
import sqlite3
db = sqlite3.connect('/var/lib/docker/volumes/n8n_data/_data/database.sqlite')
cur = db.cursor()
cur.execute(\"SELECT id, name, active, activeVersionId FROM workflow_entity WHERE name LIKE '%Bug%Sync%'\")
for r in cur.fetchall():
    print(f'  id={r[0]}, name={r[1]}, active={r[2]}, activeVersionId={r[3]}')
db.close()
"
```

Expected:
```
  id=BugSync001TuleapQC, name=Tuleap Bug → QC-Manager Sync, active=1, activeVersionId=<uuid>
```

If `active=0`: go to n8n UI at `https://n8n.gebrils.cloud` and activate it manually.

- [ ] **Step 2: Confirm active workflow history has `source` in Transform node**

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('/var/lib/docker/volumes/n8n_data/_data/database.sqlite')
cur = db.cursor()
cur.execute(\"SELECT we.activeVersionId FROM workflow_entity we WHERE we.id='BugSync001TuleapQC'\")
vid = cur.fetchone()[0]
cur.execute('SELECT nodes FROM workflow_history WHERE versionId=?', (vid,))
row = cur.fetchone()
if row:
    nodes = json.loads(row[0])
    for n in nodes:
        code = n.get('parameters',{}).get('jsCode','')
        if 'source' in code and n.get('name'):
            print(f'OK: source field found in node: {n[\"name\"]}')
else:
    print('ERROR: no history row for activeVersionId', vid)
db.close()
"
```

Expected: `OK: source field found in node: Transform Bug Data`

If missing: the workflow in n8n is stale. Re-import from git:
```bash
cp /root/QC-Manager/n8n-workflows/tuleap-bug-sync.json /local-files/tuleap-bug-sync.json
docker exec n8n-n8n-1 n8n import:workflow --input=/files/tuleap-bug-sync.json
# Then go to n8n UI and RE-ACTIVATE the workflow (import deactivates it)
```

- [ ] **Step 3: Check recent n8n execution logs for source field**

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('/var/lib/docker/volumes/n8n_data/_data/database.sqlite')
cur = db.cursor()
cur.execute(\"\"\"
  SELECT startedAt, status, data
  FROM execution_entity
  WHERE workflowId = 'BugSync001TuleapQC'
  ORDER BY startedAt DESC
  LIMIT 3
\"\"\")
for r in cur.fetchall():
    data = json.loads(r[2]) if r[2] else {}
    print(f'  {r[0]} status={r[1]}')
db.close()
"
```

Expected: recent executions with `status=success`. If `status=error`, check the execution data for the error message.

---

## Task 5: Verify Frontend

**Files:**
- `apps/web/app/projects/[id]/quality/page.tsx`
- `apps/web/app/governance/page.tsx`
- `apps/web/src/components/BugsBySourceChart.tsx`

- [ ] **Step 1: Open Quality page in browser and check Bug Summary section**

Navigate to: `https://gebrils.cloud/projects/<ANY_PROJECT_ID>/quality`

Check for:
- Two source cards: "Bugs from Test Cases" and "Exploratory Bugs" with numeric values
- Pie chart (BugsBySourceChart) rendered below the cards
- No JavaScript console errors related to `by_source` being undefined

If the section is missing or shows an error: check browser devtools → Network tab → `/api/bugs/summary?project_id=...` response for `by_source`.

- [ ] **Step 2: Open Governance page and check Bug Summary section**

Navigate to: `https://gebrils.cloud/governance`

Check for:
- Bug Summary section visible with source breakdown data
- BugsBySourceChart rendered

Note: From code review (`grep -n "BugsBySource" governance/page.tsx` returned nothing), the Governance page may NOT have the chart yet — confirm this. If absent and expected, file a follow-up task. If absent and intentional, skip.

- [ ] **Step 3: Check that 0-bug state renders gracefully**

If all projects currently have 0 bugs via a test project with no bugs:
- `BugsBySourceChart` should render "No bug data available" message (not crash)
- Source cards should show `0` (not `undefined` or `NaN`)

---

## Task 6: End-to-End Test (Simulated Webhook)

**Files:**
- `apps/api/src/routes/tuleapWebhook.js`

This confirms new incoming bugs from Tuleap get the correct `source` value.

- [ ] **Step 1: Find the webhook secret and endpoint**

```bash
docker exec qc-api env | grep -i webhook
# OR check the tuleapWebhook.js for how auth works
grep -n "secret\|hmac\|token\|webhook" /root/QC-Manager/apps/api/src/routes/tuleapWebhook.js | head -10
```

- [ ] **Step 2: Send a test payload with linked test cases (should → TEST_CASE)**

```bash
# Payload with linked_artifacts of type 'testcase'
curl -s -X POST https://api.gebrils.cloud/api/webhooks/tuleap \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "artifact:created",
    "payload": {
      "id": 99991,
      "tracker": { "id": 1 },
      "current": {
        "id": 99991,
        "values": [
          { "label": "Bug Title", "value": "Test Source Classification" },
          { "label": "Status", "values": [{ "label": "New" }] },
          { "label": "Severity", "values": [{ "label": "Minor" }] }
        ]
      },
      "linked_artifacts": [{ "type": "testcase", "id": 5001 }],
      "user": { "display_name": "Test User" }
    }
  }' | python3 -m json.tool
```

Then verify in DB:
```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT bug_id, source FROM bugs WHERE tuleap_artifact_id = 99991;"
```

Expected: `TLP-99991 | TEST_CASE`

- [ ] **Step 3: Send a test payload WITHOUT linked test cases (should → EXPLORATORY)**

```bash
curl -s -X POST https://api.gebrils.cloud/api/webhooks/tuleap \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "artifact:created",
    "payload": {
      "id": 99992,
      "tracker": { "id": 1 },
      "current": {
        "id": 99992,
        "values": [
          { "label": "Bug Title", "value": "Test Exploratory Source" },
          { "label": "Status", "values": [{ "label": "New" }] },
          { "label": "Severity", "values": [{ "label": "Minor" }] }
        ]
      },
      "user": { "display_name": "Test User" }
    }
  }' | python3 -m json.tool
```

Then verify:
```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT bug_id, source FROM bugs WHERE tuleap_artifact_id = 99992;"
```

Expected: `TLP-99992 | EXPLORATORY`

- [ ] **Step 4: Clean up test bugs**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "UPDATE bugs SET deleted_at = NOW() WHERE tuleap_artifact_id IN (99991, 99992);"
```

---

## Summary Checklist

After completing all tasks, confirm:

- [ ] `source` column exists in `bugs` table with correct constraint and indexes
- [ ] `v_bug_summary` and `v_bug_summary_global` both include `bugs_from_test_cases` + `bugs_from_exploratory`
- [ ] `v_bug_summary_global` includes `bugs_from_testing` and `standalone_bugs` (legacy columns still present)
- [ ] Backfill either confirmed applied or applied now
- [ ] `/api/bugs/summary` returns `by_source: { test_case: N, exploratory: N }` with real numbers
- [ ] PATCH `/api/bugs/:id` accepts `source` field
- [ ] n8n `BugSync001TuleapQC` is active and its Transform Bug Data node includes `source`
- [ ] Quality page renders source cards + pie chart without errors
- [ ] Governance page bug summary section confirmed present (or absent-and-expected)
- [ ] Simulated webhook with linked test cases creates a `TEST_CASE` bug
- [ ] Simulated webhook without links creates an `EXPLORATORY` bug
