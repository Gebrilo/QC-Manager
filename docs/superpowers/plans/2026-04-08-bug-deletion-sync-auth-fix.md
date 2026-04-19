# Bug Deletion Sync — Auth Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 403 Forbidden error in the "Tuleap Bug Deletion Sync (Polling)" n8n workflow so it can authenticate to the Tuleap REST API and poll for artifact deletions.

**Architecture:** The workflow polls Tuleap's `/api/trackers/{id}/artifacts` endpoint every 15 minutes. The current `X-Auth-Token` header uses `$credentials.tuleapApiToken` — an invalid expression in this context that evaluates to empty, sending the request unauthenticated. The fix uses n8n's `$env` variable support (already enabled via `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`) to inject the token from the container environment. A secondary URL expression bug (`={{ val1 }}/literal/{{ val2 }}` mixed syntax) is fixed in the same pass.

**Tech Stack:** n8n 2.6.3 (self-hosted), JSON workflow file, Docker Compose at `/docker/n8n/docker-compose.yml`

---

## Root Cause

In `n8n-workflows/tuleap-bug-deletion-sync.json`, node `Fetch Tuleap Artifacts` has two bugs:

**Bug 1 — Invalid credential expression (causes 403):**
```json
"value": "={{$credentials.tuleapApiToken}}"
```
`$credentials` is not available in HTTP Request node header expressions. This evaluates to empty string → request reaches Tuleap with no `X-Auth-Token` header → 403 Forbidden.

**Bug 2 — Malformed URL expression (tracker ID not interpolated):**
```json
"url": "={{ $json.tuleap_base_url }}/api/trackers/{{ $json.tuleap_tracker_id }}/artifacts?values=all&limit=500&offset=0"
```
In n8n, once `={{ }}` is open, the entire value must be a single JS expression. The second `{{ }}` block outside the first expression is treated as a literal string. The URL likely resolves to something like `https://tuleap.windinfosys.com/api/trackers/{{ $json.tuleap_tracker_id }}/artifacts?...` — if it even reaches Tuleap, the path is wrong.

---

## Files Modified

| File | Change |
|------|--------|
| `n8n-workflows/tuleap-bug-deletion-sync.json` | Fix URL expression + replace credential reference with `$env.TULEAP_API_TOKEN` |
| `/docker/n8n/docker-compose.yml` | Add `TULEAP_API_TOKEN` environment variable |

---

## Pre-requisite: Obtain Your Tuleap API Token

Before starting:
1. Log in to `https://tuleap.windinfosys.com`
2. Go to **User Preferences → Keys & Tokens → REST API Access Keys**
3. Generate or copy your existing API token
4. Keep it ready for Task 2

---

## Task 1: Fix the Workflow JSON

**Files:**
- Modify: `n8n-workflows/tuleap-bug-deletion-sync.json` (node id `d1000000-0005-4005-8005-000000000005`, `Fetch Tuleap Artifacts`)

- [ ] **Step 1: Open the workflow file and locate the node to fix**

Read `n8n-workflows/tuleap-bug-deletion-sync.json`. The `Fetch Tuleap Artifacts` node (id `d1000000-0005-4005-8005-000000000005`) has two fields to fix:
- `parameters.url` — the tracker URL
- `headerParameters.parameters[0].value` — the auth token

- [ ] **Step 2: Fix the URL expression**

Replace:
```json
"url": "={{ $json.tuleap_base_url }}/api/trackers/{{ $json.tuleap_tracker_id }}/artifacts?values=all&limit=500&offset=0"
```
With:
```json
"url": "={{ $json.tuleap_base_url + '/api/trackers/' + $json.tuleap_tracker_id + '/artifacts?values=all&limit=500&offset=0' }}"
```

- [ ] **Step 3: Fix the credential expression**

Replace:
```json
"value": "={{$credentials.tuleapApiToken}}"
```
With:
```json
"value": "={{ $env.TULEAP_API_TOKEN }}"
```

- [ ] **Step 4: Verify the full node JSON looks correct**

After both edits, the `Fetch Tuleap Artifacts` node parameters should look like:
```json
{
  "url": "={{ $json.tuleap_base_url + '/api/trackers/' + $json.tuleap_tracker_id + '/artifacts?values=all&limit=500&offset=0' }}",
  "options": {
    "timeout": 30000
  },
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "X-Auth-Token",
        "value": "={{ $env.TULEAP_API_TOKEN }}"
      }
    ]
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add n8n-workflows/tuleap-bug-deletion-sync.json
git commit -m "fix: repair auth and URL expression in bug deletion sync workflow"
```

---

## Task 2: Add TULEAP_API_TOKEN to n8n Environment

**Files:**
- Modify: `/docker/n8n/docker-compose.yml` (environment section, after line 56)

- [ ] **Step 1: Add the token to the n8n docker-compose environment block**

In `/docker/n8n/docker-compose.yml`, add to the `environment:` section (after the existing `DISCORD_BOT_TOKEN` line):
```yaml
      - TULEAP_API_TOKEN=<your-tuleap-api-token>
```
Replace `<your-tuleap-api-token>` with the actual token obtained in the pre-requisite step.

- [ ] **Step 2: Restart the n8n container to pick up the new env var**

```bash
cd /docker/n8n && docker compose up -d
```

Expected: container restarts, `docker ps` shows `n8n-n8n-1` still Up.

- [ ] **Step 3: Verify the env var is available inside n8n**

```bash
docker exec n8n-n8n-1 printenv TULEAP_API_TOKEN
```

Expected: prints the token value (not empty).

---

## Task 3: Re-import and Activate the Workflow in n8n

n8n's running workflow is not automatically updated when the JSON file changes — it must be re-imported via the UI.

- [ ] **Step 1: Open n8n UI**

Navigate to `https://n8n.gebrils.cloud` and log in.

- [ ] **Step 2: Delete or deactivate the old workflow**

Find the "Tuleap Bug Deletion Sync (Polling)" workflow. Either:
- Open it → Settings → **Delete**, or
- Deactivate it (toggle off) if you want to keep history

- [ ] **Step 3: Import the fixed workflow via n8n API (primary method)**

The JSON file is on the VPS, so use the REST API to import it. Get your n8n API key from **n8n UI → Settings → API → Create an API Key**, then run:

```bash
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: <your-n8n-api-key>" \
  -d @/root/QC-Manager/n8n-workflows/tuleap-bug-deletion-sync.json
```

Expected: HTTP 200 with a JSON response containing the new workflow id.

> **Alternative — UI import:** In the n8n web UI go to **Workflows → Add Workflow → Import from File** and upload the JSON from your local machine (download it from the VPS first if needed).

- [ ] **Step 4: Activate the workflow**

Toggle the workflow to **Active** in the n8n UI (or via API):
```bash
curl -X PATCH http://localhost:5678/api/v1/workflows/<workflow-id> \
  -H "Content-Type: application/json" \
  -H "X-N8N-API-KEY: <your-n8n-api-key>" \
  -d '{"active": true}'
```

---

## Task 4: Verify End-to-End

- [ ] **Step 1: Trigger a manual execution**

The workflow uses a Schedule Trigger, so "Test Workflow" in the editor executes the full workflow bypassing the timer — click **Test Workflow** in the n8n editor (the workflow must be saved first; it does NOT need to be Active to run a test).

Alternatively, via API:
```bash
curl -X POST http://localhost:5678/api/v1/workflows/<workflow-id>/run \
  -H "X-N8N-API-KEY: <your-n8n-api-key>"
```

- [ ] **Step 2: Confirm "Fetch Tuleap Artifacts" succeeds**

Expected outcome:
- Node turns green (no red error indicator)
- Output shows an array of artifact objects from Tuleap
- `total_fetched` in "Extract Active IDs" output is > 0

- [ ] **Step 3: Confirm no bugs are incorrectly soft-deleted**

After the run, query the database to check for unexpected soft-deletions:
```sql
SELECT bug_id, tuleap_artifact_id, deleted_at
FROM bug
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC
LIMIT 10;
```
Run against `supabase-db`:
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
  SELECT bug_id, tuleap_artifact_id, deleted_at
  FROM bug
  WHERE deleted_at IS NOT NULL
  ORDER BY deleted_at DESC
  LIMIT 10;
"
```

Expected: only bugs that actually no longer exist in Tuleap are marked deleted.

- [ ] **Step 4: Wait for the next scheduled run (or re-trigger manually)**

Confirm the 15-minute cron fires without errors in n8n's execution history.
