# Tuleap ↔ QC Bidirectional Sync — Slice 1 (Outbound Write-Through)

> **For agentic workers:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read this whole file before starting Task 1 — design context lives in §Design Decisions.

---

## Goal

Make QC-side mutations (create / edit / delete) immediately reflect in **both** Tuleap and the local QC `bugs` / `tasks` / `test_case` / `user_story` tables, instead of waiting up to 15 minutes for the inbound poll. Also reduce the inbound poll interval from 15 min → 2 min.

This slice is **outbound-only**. Inbound delete-detection (Tuleap-deleted artifacts becoming ghost rows in QC) is explicitly deferred to Slice 2.

---

## Background — Why this exists

Today's broken behaviour:

| Scenario | What happens now | What should happen |
|---|---|---|
| User edits bug in QC UI | `PATCH /tuleap/artifacts/:id` → emitter pushes to Tuleap. **Local `bugs` row is NOT updated** until next 15-min poll. UI shows stale value. | Local row updates instantly, no waiting. |
| User edits bug in Tuleap directly | Up to 15 min before QC reflects. | Up to 2 min. |
| User deletes bug in QC UI | `DELETE /api/bugs/:id` → soft-deletes local row only. **Tuleap artifact stays alive.** Silent drift. | Tuleap delete + local soft-delete in one transaction. |
| Same for task / user_story / test_case | Same drift. | Same fix. |

**Root cause:** the emitter (QC → Tuleap write) and the persister (Tuleap → QC write) are two separate code paths. The emitter only writes to Tuleap. The local `bugs` table is only ever written by the inbound poll. So writes from QC's UI bypass the local DB until the poll catches up.

**Fix:** make the emitter the unified write seam. After a successful Tuleap write, the emitter calls the existing persister to update the local table. One code path, both writes.

---

## Design Decisions (from /grill-me session, 2026-05-09)

| # | Decision | Why |
|---|---|---|
| Q1 | **Tuleap-primary** — Tuleap is the system of record. QC is a projection. | Existing schema (`tuleap_artifact_id`, `raw_tuleap_payload`) implies it; poll architecture confirms it. |
| Q2 | **Emitter is the unified write path.** After a successful Tuleap write, the emitter calls the persister's `dispatchAction()`. | Single seam; impossible to write to one and forget the other; simplest change. |
| Q3 | **Outbound-only this slice.** Plus poll cadence change. No inbound delete detection. | Smallest verifiable slice. Inbound deletes have tricky edge cases (partial poll responses → false-positive deletes). |
| Q4 | **Soft-delete on QC-side delete.** Hard-delete forbidden. | Tuleap-primary — the Tuleap deletion is canonical. Local soft-delete preserves history. Recovery is `UPDATE bugs SET deleted_at=NULL`. |
| Q5 | **Synchronous, emit-then-persist, best-effort persist.** | If persist fails after a successful emit, the 2-min poll self-heals. No data loss; no queue infra needed. |
| Q6 | **Wire `DELETE /api/{bugs,tasks,test-cases}/:id` through emitter.** PATCH routes for those tables stay local-only this slice (UI uses unified path; QC-only fields like task estimates don't need emit). | Slice scope: deletes are the loudest gap. PATCH wiring in those routes touches QC-only logic (team scope, status transitions) and is deferred. |
| Q7 | **Poll cron `*/2 * * * *`** (every 2 min, was every 15). | After Q2 the poll is only the safety net for direct-in-Tuleap edits, but 2 min keeps Tuleap-direct editors happy. |
| Q8 | **All 4 artifact types in this PR**: bug, task, user_story, test_case. | Same mechanical change in 4 emitters. Staggering creates drift between files. |
| Q9 | **No backfill.** | Poll refreshes everything within 2 min of deploy. |
| Q10 | **Manual smoke test + structured logging.** No integration tests against live Tuleap. | Inbound persisters are well-trodden by the poll; the new wire is small. WARN-level "post-emit persist failed" log surfaces the only new failure mode. |

---

## Architecture — Before vs After

### Before
```
QC UI → PATCH /tuleap/artifacts/:id → emitter → Tuleap PUT ✓
                                                    ↓ (response discarded)
QC bugs table ←── poll (every 15min) ── GET /trackers/:id/artifacts ── Tuleap

QC UI → DELETE /api/bugs/:id → bugs.deleted_at = NOW() ✓
                                Tuleap artifact: untouched ✗
```

### After
```
QC UI → PATCH /tuleap/artifacts/:id → emitter → Tuleap PUT ✓
                                              → dispatchAction() → bugs row UPDATE ✓

QC UI → DELETE /api/bugs/:id → emitter (mode='delete') → Tuleap DELETE ✓
                                                       → dispatchAction() → bugs.deleted_at = NOW() ✓

Poll cadence: */15 → */2  (safety net for Tuleap-direct edits)
```

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/services/emitters/bug.js` | **Modify** | After successful Tuleap write, call `dispatchAction()`. Add structured logs. |
| `apps/api/src/services/emitters/task.js` | **Modify** | Same as above. |
| `apps/api/src/services/emitters/user_story.js` | **Modify** | Same as above. |
| `apps/api/src/services/emitters/test_case.js` | **Modify** | Same as above. |
| `apps/api/src/routes/bugs.js` | **Modify** | `DELETE /:id` calls emitter (mode='delete') when row has `tuleap_artifact_id`; falls back to local soft-delete otherwise. |
| `apps/api/src/routes/tasks.js` | **Modify** | Same DELETE pattern. |
| `apps/api/src/routes/testCases.js` | **Modify** | Same DELETE pattern. |
| `n8n-workflows/tuleap-unified-poll.json` | **Modify** | Cron `*/15 * * * *` → `*/2 * * * *`. Re-import to n8n. |

**Out of scope for this slice (DO NOT TOUCH):**
- `PATCH /api/{bugs,tasks,test-cases}/:id` route bodies — they handle QC-only fields (estimates, deadlines, resources, status transitions). UI uses the unified `/tuleap/artifacts/:id` path for Tuleap-mappable edits, so this is not an active drift source. Slice 2.
- Inbound poll diff logic for delete detection. Slice 2.
- Tuleap-side webhook delivery. Outside our control.
- New schema columns (`last_emit_status` etc.). Defer until logs show real drift.

---

## Task 1 — Wire emitters to call persisters (the core change)

**Files:** all 4 emitters in `apps/api/src/services/emitters/`.

The change is **uniform across all 4 files**. Same lines added, same shape. The persisters all expose `dispatchAction(unified, config, deps)` and route by `unified.action` (`'sync'` or `'delete'`).

### Pattern

After a successful Tuleap call (the existing `client.post`/`put`/`delete`), wire in a call to the persister so the local row is written/updated/soft-deleted in the same code path.

The unified payload passed to `dispatchAction` must have:
- `unified.tuleap.artifact_id` — the Tuleap artifact ID (already present for `update`/`delete`; needs to be **set after** `create` from the response)
- `unified.tuleap.url` — the Tuleap web URL (set after `create`)
- `unified.action` — `'sync'` (for create + update) or `'delete'` (for delete)

### Step 1.1 — Modify `apps/api/src/services/emitters/bug.js`

- [ ] **Add import** at the top:

```js
const { dispatchAction } = require('../persisters/bug');
```

- [ ] **At the end of the `mode === 'delete'` branch** (currently `await client.delete(...); return { deleted: true };`), persist the soft-delete locally before returning:

```js
if (mode === 'delete') {
  const artifactId = unified.tuleap?.artifact_id;
  if (!artifactId) throw new Error('tuleap.artifact_id required for delete');

  await client.delete(`/artifacts/${artifactId}`);
  console.log(`[emit:bug] tuleap_delete_ok artifact_id=${artifactId} project=${config.qc_project_id}`);

  try {
    await dispatchAction(
      { ...unified, action: 'delete', tuleap: { ...(unified.tuleap || {}), artifact_id: artifactId } },
      config,
      { query: deps.query }
    );
    console.log(`[emit:bug] persist_delete_ok artifact_id=${artifactId}`);
  } catch (persistErr) {
    console.warn(`[emit:bug] persist_delete_failed artifact_id=${artifactId} err="${persistErr.message}" — drift; poll will repair`);
  }

  return { deleted: true };
}
```

- [ ] **At the end of the `mode === 'update'` branch** (currently `await client.put(...); return { updated: true, tuleap_artifact_id: artifactId };`), persist the sync locally:

```js
if (mode === 'update') {
  const artifactId = unified.tuleap?.artifact_id;
  if (!artifactId) throw new Error('tuleap.artifact_id required for update');
  await client.put(`/artifacts/${artifactId}`, { values });
  console.log(`[emit:bug] tuleap_update_ok artifact_id=${artifactId} project=${config.qc_project_id}`);

  try {
    await dispatchAction(
      { ...unified, action: 'sync', tuleap: { ...(unified.tuleap || {}), artifact_id: artifactId } },
      config,
      { query: deps.query }
    );
    console.log(`[emit:bug] persist_update_ok artifact_id=${artifactId}`);
  } catch (persistErr) {
    console.warn(`[emit:bug] persist_update_failed artifact_id=${artifactId} err="${persistErr.message}" — drift; poll will repair`);
  }

  return { updated: true, tuleap_artifact_id: artifactId };
}
```

- [ ] **At the end of the create branch** (after `const artifact = response.data;`), persist the new row locally:

```js
const payload = { tracker: { id: trackerId }, values };
const response = await client.post('/artifacts', payload);
const artifact = response.data;
const newTuleapUrl = `${baseUrl}/plugins/tracker/?aid=${artifact.id}`;
console.log(`[emit:bug] tuleap_create_ok artifact_id=${artifact.id} project=${config.qc_project_id}`);

try {
  await dispatchAction(
    {
      ...unified,
      action: 'sync',
      tuleap: { ...(unified.tuleap || {}), artifact_id: artifact.id, url: newTuleapUrl },
    },
    config,
    { query: deps.query }
  );
  console.log(`[emit:bug] persist_create_ok artifact_id=${artifact.id}`);
} catch (persistErr) {
  console.warn(`[emit:bug] persist_create_failed artifact_id=${artifact.id} err="${persistErr.message}" — drift; poll will repair`);
}

return {
  tuleap_artifact_id: artifact.id,
  tuleap_url: newTuleapUrl,
  artifact_type: 'bug',
  xref: artifact.xref || null,
};
```

- [ ] **Wrap Tuleap-call failures with an ERROR log** before re-throwing. The whole `emitToTuleap` body wrapped in try/catch:

```js
async function emitToTuleap(unified, config, mode, deps = {}) {
  try {
    // ... existing body, with the persist hooks above ...
  } catch (err) {
    console.error(`[emit:bug] tuleap_${mode}_failed project=${config.qc_project_id} err="${err.message}" status=${err.status || 'unknown'}`);
    throw err;
  }
}
```

### Step 1.2 — Modify `apps/api/src/services/emitters/task.js`

- [ ] Import `dispatchAction`:

```js
const { dispatchAction } = require('../persisters/task');
```

- [ ] Apply the **same three persist hooks** (delete / update / create) and the **same outer try/catch** as in `bug.js`. Logger prefix: `[emit:task]`.

### Step 1.3 — Modify `apps/api/src/services/emitters/user_story.js`

- [ ] Same as 1.2 with `require('../persisters/user_story')` and prefix `[emit:user_story]`.

### Step 1.4 — Modify `apps/api/src/services/emitters/test_case.js`

- [ ] Same as 1.2 with `require('../persisters/test_case')` and prefix `[emit:test_case]`.

### Step 1.5 — Verify deps plumbing

The persister `dispatchAction` requires `deps.query` (a Postgres query function). The route handlers in `apps/api/src/routes/tuleapArtifacts.js` already pass `query: db.pool.query.bind(db.pool)` as part of `deps`. **No route changes needed for the unified PATCH/POST path.**

- [ ] Grep for `emit(Bug|Task|UserStory|TestCase)` callers to confirm `query` is in `deps`:

```bash
grep -rn "emit\(Bug\|Task\|UserStory\|TestCase\)\|emitToTuleap" apps/api/src/routes/ | grep -v node_modules
```

Expect every call to pass `query: db.pool.query.bind(db.pool)`. If any caller omits it, fix the caller — never let the emitter swallow a missing `query`.

---

## Task 2 — Wire DELETE routes through emitter (Q6, narrowed scope)

**Files:** `apps/api/src/routes/bugs.js`, `tasks.js`, `testCases.js`.

For each, the existing `DELETE /:id` route currently soft-deletes the local row directly. We change it: if the row has a `tuleap_artifact_id`, call the emitter (which now also persists). If not, fall back to the existing local-only path.

### Step 2.1 — Modify `apps/api/src/routes/bugs.js` DELETE handler

The current handler (line ~398) reads:

```js
router.delete('/:id', requireAuth, requirePermission('action:bugs:delete'), async (req, res) => {
  // ... look up bug ...
  // ... UPDATE bugs SET deleted_at = NOW() WHERE id = $1 ...
});
```

- [ ] **Add imports** at the top of `bugs.js`:

```js
const { emitToTuleap: emitBug } = require('../services/emitters/bug');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
```

- [ ] **Replace the DELETE handler body** with the emit-aware version:

```js
router.delete('/:id', requireAuth, requirePermission('action:bugs:delete'), async (req, res) => {
  try {
    const { id } = req.params;

    const originalRes = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
    if (originalRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bug not found' });
    }
    const original = originalRes.rows[0];
    if (original.deleted_at) {
      return res.status(400).json({ success: false, error: 'Bug already deleted' });
    }

    if (original.tuleap_artifact_id) {
      // Tuleap-linked: route through emitter so Tuleap delete + local soft-delete happen together
      const configResult = await pool.query(
        `SELECT * FROM tuleap_sync_config
         WHERE qc_project_id = $1 AND tracker_type = 'bug' AND is_active = true`,
        [original.project_id]
      );
      const config = configResult.rows[0];
      if (!config) {
        return res.status(400).json({
          success: false,
          error: `No active bug sync config for project ${original.project_id}`,
        });
      }

      try {
        await emitBug(
          {
            artifact_type: 'bug',
            project_id: original.project_id,
            tuleap: { artifact_id: original.tuleap_artifact_id },
          },
          config,
          'delete',
          { client: defaultClient, registry: defaultRegistry, query: pool.query.bind(pool) }
        );
      } catch (emitErr) {
        console.error(`[route:bugs:delete] emit_failed bug_id=${id} err="${emitErr.message}"`);
        return res.status(emitErr.status || 502).json({
          success: false,
          error: 'Failed to delete in Tuleap',
          message: emitErr.message,
        });
      }

      // Emitter has already soft-deleted via dispatchAction. Re-read for response.
      const refreshed = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
      const deleted = refreshed.rows[0];
      await auditLog('bugs', id, 'DELETE', deleted, original);
      return res.json({
        success: true,
        message: `Bug '${deleted.title}' has been deleted`,
        data: deleted,
      });
    }

    // Not Tuleap-linked: local-only soft-delete (legacy behavior preserved)
    const result = await pool.query(
      'UPDATE bugs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    const deleted = result.rows[0];
    await auditLog('bugs', id, 'DELETE', deleted, original);

    res.json({
      success: true,
      message: `Bug '${deleted.title}' has been deleted`,
      data: deleted,
    });
  } catch (error) {
    console.error('Error deleting bug:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bug',
      message: error.message,
    });
  }
});
```

### Step 2.2 — Modify `apps/api/src/routes/tasks.js` DELETE handler

- [ ] Apply the **same pattern** as 2.1 (read row → if `tuleap_artifact_id`, call emitter; else local-only). Use:
  - `require('../services/emitters/task')` for `emitTask`
  - `tracker_type = 'task'` in the sync_config lookup
  - Logger prefix `[route:tasks:delete]`

Preserve the existing **manager team-scope check** that's currently in the DELETE handler — do not remove it. Run the team-scope check **before** branching to emitter vs local.

### Step 2.3 — Modify `apps/api/src/routes/testCases.js` DELETE handler

- [ ] Apply the **same pattern**. Use:
  - `require('../services/emitters/test_case')` for `emitTestCase`
  - `tracker_type = 'test_case'` in the sync_config lookup
  - Logger prefix `[route:test_cases:delete]`
  - Note: the test_case persister deletes from a table called `test_case` (singular) — verify by reading `apps/api/src/services/persisters/test_case.js` before writing the route changes.

### Step 2.4 — Skipped: user_story DELETE route

`apps/api/src/routes/user_story.js` does not exist. User story deletes go through `DELETE /tuleap/artifacts/:id` (which now persists locally via Task 1). No route work needed.

---

## Task 3 — Reduce poll interval

**File:** `n8n-workflows/tuleap-unified-poll.json`.

- [ ] Open the JSON. Find the `Every 15 minutes` schedule trigger node and change:
  - `name`: `"Every 15 minutes"` → `"Every 2 minutes"`
  - `parameters.rule.interval[0].expression`: `"*/15 * * * *"` → `"*/2 * * * *"`

- [ ] Update the Connections key to match the new node name (since n8n keys connections by node name):

```json
"connections": {
  "Every 2 minutes": {           // ← was "Every 15 minutes"
    "main": [[{ "node": "Fetch Active Trackers", "type": "main", "index": 0 }]]
  },
  ...rest unchanged
}
```

- [ ] Re-import the workflow to n8n on the VPS:

```bash
ssh into VPS, then:
docker exec -i n8n-n8n-1 n8n import:workflow --input=/path/to/tuleap-unified-poll.json
```

The workflow `id` is pinned to `PIPprgnA945Lvdog`, so the import updates the existing workflow rather than creating a duplicate. Re-activate it from the n8n UI if it deactivates on import.

- [ ] Verify in n8n UI that the schedule shows `*/2 * * * *` and the workflow is active.

---

## Task 4 — Verification (smoke test, manual)

After deploy, validate the new write-through path end-to-end. Run all 8 checks below. Pick a project that has all 4 trackers configured (e.g. CST after you finish adding User Story id=6 and Test Case id=9 mappings).

### 4.1 — Bug edit smoke

- [ ] Open QC UI → Bugs → pick any bug → edit title or status → save.
- [ ] **Expect:** UI refreshes, new value visible immediately (no 2-min wait).
- [ ] **Verify Tuleap:** open the artifact in Tuleap web UI — same value present.
- [ ] **Verify QC DB:**
  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT id, title, status, last_sync_at, updated_at FROM bugs WHERE tuleap_artifact_id = <id> LIMIT 1;"
  ```
  `updated_at` and `last_sync_at` should be within the last few seconds.
- [ ] **Verify logs:**
  ```bash
  docker logs qc-api --since 1m | grep -E "emit:bug.*(tuleap_update_ok|persist_update_ok)"
  ```
  Expect both lines.

### 4.2 — Bug delete smoke

- [ ] In QC UI, delete any test bug.
- [ ] **Expect:** UI confirms, bug disappears from list.
- [ ] **Verify Tuleap:** the artifact is gone (404 on direct URL).
- [ ] **Verify QC DB:**
  ```sql
  SELECT id, deleted_at FROM bugs WHERE id = '<bug-id>';
  ```
  `deleted_at` should be set.
- [ ] **Verify logs:**
  ```bash
  docker logs qc-api --since 1m | grep -E "(route:bugs:delete|emit:bug.*tuleap_delete|persist_delete)"
  ```

### 4.3 — Task edit + delete smoke

- [ ] Repeat 4.1 and 4.2 for a task. Logs prefix: `[emit:task]`.

### 4.4 — User story edit smoke

- [ ] Repeat 4.1 for a user story. (No QC-side delete UI for user stories; skip the delete check.)

### 4.5 — Test case edit + delete smoke

- [ ] Repeat 4.1 and 4.2 for a test case. Logs prefix: `[emit:test_case]`.

### 4.6 — Poll cadence verification

- [ ] In n8n UI, open the **Tuleap Unified Poll** workflow → click **Executions** tab.
- [ ] Wait 5 min, refresh. Should see ≥ 2 executions in that window.
- [ ] Edit an artifact directly in Tuleap web UI (not QC). Wait up to 2 min.
- [ ] Refresh QC list → new value visible.

### 4.7 — Drift-window log absence

- [ ] After all smoke tests, run:
  ```bash
  docker logs qc-api --since 30m | grep "persist_.*_failed"
  ```
  Expect **zero** matches in the happy path. If any appear, file a bug — drift happened.

---

## Task 5 — Deployment

This project deploys via GitHub Actions (`.github/workflows/deploy.yml`) on push to `main`.

- [ ] Verify all changes compile / lint:
  ```bash
  cd /root/QC-Manager
  npm run -w apps/api lint   # or whatever the project's lint command is
  ```
- [ ] Commit on a feature branch:
  ```
  git checkout -b feat/tuleap-bidirectional-sync-slice1
  git add -A
  git commit -m "feat(tuleap): emitter-driven write-through for bidirectional sync (slice 1)"
  ```
- [ ] Open PR. Self-review the diff against this plan's File Structure table.
- [ ] Merge to `main`. CI deploys to prod.
- [ ] On the VPS, re-import the n8n workflow (Task 3 last step).
- [ ] Run Task 4 smoke tests.

---

## Rollback plan

Slice 1's change set is contained: 4 emitter files, 3 route files, 1 n8n workflow file.

If post-deploy smoke tests fail or a `persist_*_failed` flood appears in logs:

- [ ] Revert the merge commit on `main` (`git revert <merge-sha>` → push). CI redeploys.
- [ ] In n8n UI, change the cron back to `*/15 * * * *` (or re-import the previous workflow JSON from git history).

The change has no schema migration, so revert is purely code.

---

## Out of scope — Slice 2 (next session, do NOT do here)

- **Inbound delete detection.** Poll diffs Tuleap response against QC table; soft-deletes orphans. Edge cases: partial poll responses, network failures mid-fetch.
- **Wire `PATCH /api/{bugs,tasks,test-cases}/:id` through emitter.** Routes have QC-only field handling (estimates, deadlines, status transitions) that needs careful refactor. Today the UI uses `/tuleap/artifacts/:id` for Tuleap-mappable edits, so no active drift.
- **Tuleap-side webhook delivery fix.** Requires SSH access to the Tuleap VM. Outside scope from this end.
- **`last_emit_status` column** on bugs/tasks/etc. Only add if Slice 1 logs show real drift.
- **Async/queued outbound.** Only add if synchronous path causes UX problems.

---

## Open questions for the implementing agent

If anything below is unclear when you reach it, ask the user before guessing:

1. **Does `apps/api/src/routes/testCases.js` import `pool` directly or via a `db` module?** Match the existing import style in that file when adding the emitter pieces.
2. **Manager team-scope check in `tasks.js` DELETE** — verify it stays *above* the Tuleap branching so unauthorised deletes never reach Tuleap.
3. **`auditLog` placement** — current handlers call it after the local UPDATE. After the change, call it after the emitter returns successfully (the persister has already done the UPDATE).
