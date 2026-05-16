# Tuleap ↔ QC Bidirectional Sync — Slice 2 (Inbound Delete Detection)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read this whole file before starting Task 1 — design context lives in §Design Decisions.

**Goal:** Detect when an artifact has been deleted directly in Tuleap and soft-delete the corresponding QC row, instead of leaving a ghost row in `bugs` / `tasks` / `user_stories` / `test_case` until somebody manually fixes it.

**Architecture:** A new n8n workflow (`tuleap-unified-reconcile-deletes`, every 4 min) paginates each active tracker on Tuleap, builds a complete `present_artifact_ids[]` list, and POSTs it to a new `POST /tuleap-webhook/reconcile-deletes` endpoint on the QC API. The endpoint diffs the present list against QC's `tuleap_artifact_id` set for that (qc_project_id, tracker_type), tracks consecutive misses in a new `tuleap_missing_artifact` table, and only soft-deletes after **2 consecutive missing cycles** (≈ 8 min). A circuit breaker refuses to soft-delete anything if a single cycle reports more than `MAX_MISSING_PER_CYCLE` (default 50) suspected deletes — likely a Tuleap auth/network/pagination failure, not real deletes.

**Tech Stack:** Node.js / Express on the API side, n8n workflow JSON, Postgres (Supabase), existing `services/persisters/{bug,task,user_story,test_case}.js` for the actual soft-delete (each already has `action: 'delete'`).

---

## Background — Why this exists

Today, if somebody deletes an artifact directly in Tuleap (the web UI or via API), QC has no idea. The inbound poll fetches `/trackers/:id/artifacts?limit=100`, gets back the surviving artifacts, runs each through `dispatchAction({ action: 'sync', ... })`, and that's it. There is no diff — nothing inspects the local table for rows whose `tuleap_artifact_id` is no longer in the response.

Result: the deleted artifact stays in QC as a ghost row forever. Slice 1 (2026-05-09) closed the **outbound** drift but explicitly deferred this as Slice 2.

This slice closes that gap.

---

## Design Decisions (from /clear-context recap, 2026-05-09)

| # | Decision | Why |
|---|---|---|
| A | **Full-snapshot diff per cycle.** Paginate Tuleap to enumerate every artifact for a tracker, send the complete ID list to QC, QC computes the diff. | Stateless on n8n's side. Tuleap is the system of record (Slice 1 Q1) — its enumerated state is the truth. |
| B | **Pagination is mandatory.** The existing unified poll fetches `limit=100` only — that would silently report 400 artifacts as "missing" if a tracker has >100. The new reconcile workflow paginates exhaustively (offset+limit until empty/short page) before sending anything. | Without this, false-positive deletes are guaranteed on any non-trivial tracker. |
| C | **2-consecutive-cycle confirmation.** Don't soft-delete on first miss. Track in `tuleap_missing_artifact` (new table); only after `miss_count >= 2` do we delete. | Avoids false positives from transient Tuleap 5xx, partial pagination breakage, or auth blips. With 4-min cycles, eventual consistency for true deletes is ≤ 8 min. |
| D | **API does the diff, n8n is a thin orchestrator.** n8n sends `present_artifact_ids[]` (what it found); the API computes `qc_artifact_ids - present_artifact_ids`. | Database access stays in the API. Easier to test and debug on one side of the wire. |
| E | **Circuit breaker:** If `suspected_missing_count > MAX_MISSING_PER_CYCLE` (default 50) for a single config in a single cycle, **abort the cycle**, log WARN, increment NO miss counters. | A single misconfigured access key or pagination bug must not soft-delete hundreds of rows. Real-world delete cadence is 0–5 per cycle. |
| F | **Reuse existing persisters' delete branches.** The reconcile endpoint dispatches to `services/persisters/{bug,task,user_story,test_case}.js` `dispatchAction({ action: 'delete', tuleap: { artifact_id } })` — already wired by Slice 1. | One canonical soft-delete code path. |
| G | **New workflow, not a modification of `tuleap-unified-poll.json`.** Different cadence (4 min vs 2 min), different concerns, different error surface. | Hot-path sync stays fast; cold-path reconcile owns its own complexity. |
| H | **Per-(qc_project_id, tracker_type) scope** for the diff — never a global "all bugs across all projects" query. | Each tracker maps to one project; mixing projects in the diff would let a misconfigured tracker delete another project's rows. |
| I | **No PATCH-route work, no Tuleap webhook investigation.** Both deferred — see "Out of scope". | Slice scope discipline: this slice = inbound delete detection only. |

---

## Architecture — Before vs After

### Before
```
[Tuleap]  artifact_id=42 deleted by admin via web UI
   │
   └─ no event reaches QC
[QC bugs] row with tuleap_artifact_id=42 stays alive forever (ghost row)
```

### After
```
n8n  every 4 min  ─── for each active tuleap_sync_config ───┐
                                                            │
   paginate /trackers/:id/artifacts?offset=N&limit=100      │
   collect present_artifact_ids[]                           │
                                                            ▼
                  POST /tuleap-webhook/reconcile-deletes
                  body: { tuleap_tracker_id, qc_project_id,
                          tracker_type, present_artifact_ids,
                          page_count, truncated }
                                  │
                                  ▼
[QC API] compute suspected_missing = qc_ids \ present_ids
         circuit breaker: if |suspected_missing| > 50 → WARN, abort
         upsert tuleap_missing_artifact row per suspected_missing id
            (increment miss_count, set last_missed_at = NOW())
         clear/resolve rows for ids that ARE present
         for any tuleap_missing_artifact with miss_count >= 2:
             dispatchAction({ action:'delete', tuleap:{artifact_id:X} })
             (existing persister soft-deletes the QC row)
             mark row resolved_at = NOW()
```

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `database/migrations/027_tuleap_missing_artifact.sql` | **Create** | New `tuleap_missing_artifact` table for consecutive-miss tracking. |
| `apps/api/src/routes/tuleapWebhook.js` | **Modify** | Add `POST /tuleap-webhook/reconcile-deletes` endpoint with the diff/circuit-breaker logic. |
| `apps/api/src/services/tuleapReconcileDeletes.js` | **Create** | Pure function `reconcileDeletes({ presentIds, qcProjectId, trackerType, pool })` returns `{ suspected, confirmedDeletes, recovered, abortedReason }`. The route wires it in. Keeps logic testable. |
| `n8n-workflows/tuleap-unified-reconcile-deletes.json` | **Create** | New workflow: schedule `*/4 * * * *` → fetch configs → paginate per config → POST to reconcile-deletes. |
| `tests/api/tuleapReconcileDeletes.test.js` | **Create** | Unit tests for the pure function (happy path, 2-cycle confirmation, circuit breaker, recovery on re-appearance). |

**Out of scope for this slice (DO NOT TOUCH):**
- Pagination fix for `tuleap-unified-poll.json` — the existing 2-min sync poll keeps `limit=100`. Trackers with >100 artifacts will continue to miss tail-end edits in the sync poll. Track separately. **Mitigation in this slice:** the reconcile workflow paginates, so deletes are still detected for trackers >100 artifacts.
- `PATCH /api/{bugs,tasks,test-cases}/:id` wiring through emitter (deferred Slice 1 Q6 work). Would require splitting QC-only fields from Tuleap-mappable fields; not load-bearing today.
- Tuleap-side webhook delivery investigation — needs SSH/admin access to the Tuleap VM.
- Delete-undelete (revival) on the reconcile path. The existing persisters' sync branch already handles revival when an artifact reappears via the inbound sync poll; the reconcile path only needs to *clear the miss counter* (Task 2 step 2.4), not re-create rows.

---

## Task 1 — Migration: `tuleap_missing_artifact` table

**Files:**
- Create: `database/migrations/027_tuleap_missing_artifact.sql`

- [ ] **Step 1.1: Create the migration file**

```sql
-- 027_tuleap_missing_artifact.sql
-- Tracks artifacts that have gone missing from Tuleap responses, so we can
-- require N consecutive missing cycles before soft-deleting in QC.

CREATE TABLE IF NOT EXISTS tuleap_missing_artifact (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tuleap_artifact_id INTEGER NOT NULL,
    tracker_type VARCHAR(20) NOT NULL CHECK (tracker_type IN ('bug', 'task', 'user_story', 'test_case')),
    qc_project_id UUID NOT NULL REFERENCES projects(id),

    miss_count INTEGER NOT NULL DEFAULT 1,
    first_missed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_missed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Set when the artifact reappears (resolved without delete) OR after we soft-delete the QC row
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(20),  -- 'reappeared' | 'soft_deleted'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tuleap_artifact_id, tracker_type)
);

CREATE INDEX IF NOT EXISTS idx_tuleap_missing_unresolved
    ON tuleap_missing_artifact(qc_project_id, tracker_type)
    WHERE resolved_at IS NULL;

COMMENT ON TABLE tuleap_missing_artifact IS
    'Tracks artifacts missing from Tuleap responses across reconcile cycles. miss_count >= 2 triggers soft-delete in QC.';
```

- [ ] **Step 1.2: Apply the migration**

Run against the local Supabase Postgres:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < /root/QC-Manager/database/migrations/027_tuleap_missing_artifact.sql
```

Expected output: `CREATE TABLE`, `CREATE INDEX`, `COMMENT`. No errors.

- [ ] **Step 1.3: Verify the table exists**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d tuleap_missing_artifact"
```

Expected: column list including `tuleap_artifact_id`, `tracker_type`, `miss_count`, `resolved_at`, `resolution`, plus the unique constraint and the partial index.

- [ ] **Step 1.4: Commit**

```bash
git add database/migrations/027_tuleap_missing_artifact.sql
git commit -m "feat(tuleap): add tuleap_missing_artifact table for delete reconciliation"
```

---

## Task 2 — Pure reconcile function (TDD)

**Files:**
- Create: `apps/api/src/services/tuleapReconcileDeletes.js`
- Create: `tests/api/tuleapReconcileDeletes.test.js`

The whole diff-and-decide logic lives in this module. The route handler in Task 3 is a thin shell.

### Step 2.1 — Write the failing test for the happy path

- [ ] Create `tests/api/tuleapReconcileDeletes.test.js`:

```js
const { reconcileDeletes } = require('../../apps/api/src/services/tuleapReconcileDeletes');

function makePool(state) {
  // state = { qcArtifactIds: [42, 43, 44], missingRows: [{ tuleap_artifact_id, tracker_type, miss_count, ... }] }
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT tuleap_artifact_id FROM \w+ WHERE/i.test(sql)) {
        return { rows: state.qcArtifactIds.map(id => ({ tuleap_artifact_id: id })) };
      }
      if (/SELECT \* FROM tuleap_missing_artifact/i.test(sql)) {
        return { rows: state.missingRows.filter(r => r.tracker_type === params[0] && r.qc_project_id === params[1]) };
      }
      if (/INSERT INTO tuleap_missing_artifact/i.test(sql)) {
        return { rows: [{ tuleap_artifact_id: params[0], miss_count: 1 }] };
      }
      if (/UPDATE tuleap_missing_artifact/i.test(sql)) {
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('reconcileDeletes', () => {
  test('no diff → no action', async () => {
    const pool = makePool({ qcArtifactIds: [42, 43], missingRows: [] });
    const result = await reconcileDeletes({
      presentIds: [42, 43],
      qcProjectId: 'project-uuid-1',
      trackerType: 'bug',
      pool,
      dispatchByType: { bug: jest.fn() },
      maxMissingPerCycle: 50,
    });
    expect(result.suspected).toEqual([]);
    expect(result.confirmedDeletes).toEqual([]);
    expect(result.aborted).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run the test — it fails**

```bash
cd /root/QC-Manager && npx jest tests/api/tuleapReconcileDeletes.test.js
```

Expected: `Cannot find module '../../apps/api/src/services/tuleapReconcileDeletes'`.

### Step 2.3 — Implement the minimal function

- [ ] Create `apps/api/src/services/tuleapReconcileDeletes.js`:

```js
const TABLE_BY_TYPE = {
  bug: 'bugs',
  task: 'tasks',
  user_story: 'user_stories',
  test_case: 'test_case',
};

async function reconcileDeletes({
  presentIds,
  qcProjectId,
  trackerType,
  pool,
  dispatchByType,
  maxMissingPerCycle = 50,
  confirmThreshold = 2,
}) {
  if (!TABLE_BY_TYPE[trackerType]) {
    throw new Error(`Unknown tracker_type: ${trackerType}`);
  }
  const table = TABLE_BY_TYPE[trackerType];
  const presentSet = new Set(presentIds);

  const qcRowsRes = await pool.query(
    `SELECT tuleap_artifact_id FROM ${table}
     WHERE project_id = $1 AND tuleap_artifact_id IS NOT NULL AND deleted_at IS NULL`,
    [qcProjectId]
  );
  const qcIds = qcRowsRes.rows.map(r => r.tuleap_artifact_id);

  const suspected = qcIds.filter(id => !presentSet.has(id));
  const recoveredCandidates = qcIds.filter(id => presentSet.has(id));

  // Circuit breaker: too many at once = treat as Tuleap-side failure, not real deletes
  if (suspected.length > maxMissingPerCycle) {
    return {
      suspected,
      confirmedDeletes: [],
      recovered: [],
      aborted: true,
      abortedReason: `suspected_count=${suspected.length} exceeds maxMissingPerCycle=${maxMissingPerCycle}`,
    };
  }

  // Increment miss counter for suspected ids (upsert)
  for (const artifactId of suspected) {
    await pool.query(
      `INSERT INTO tuleap_missing_artifact (tuleap_artifact_id, tracker_type, qc_project_id, miss_count, first_missed_at, last_missed_at)
       VALUES ($1, $2, $3, 1, NOW(), NOW())
       ON CONFLICT (tuleap_artifact_id, tracker_type) DO UPDATE SET
         miss_count = tuleap_missing_artifact.miss_count + 1,
         last_missed_at = NOW(),
         resolved_at = NULL,
         resolution = NULL`,
      [artifactId, trackerType, qcProjectId]
    );
  }

  // Resolve any prior misses for ids that re-appeared
  const recovered = [];
  if (recoveredCandidates.length > 0) {
    const recRes = await pool.query(
      `UPDATE tuleap_missing_artifact
         SET resolved_at = NOW(), resolution = 'reappeared'
       WHERE tracker_type = $1
         AND qc_project_id = $2
         AND resolved_at IS NULL
         AND tuleap_artifact_id = ANY($3::int[])
       RETURNING tuleap_artifact_id`,
      [trackerType, qcProjectId, recoveredCandidates]
    );
    for (const row of recRes.rows) recovered.push(row.tuleap_artifact_id);
  }

  // Confirm deletes: any unresolved row with miss_count >= confirmThreshold
  const toDeleteRes = await pool.query(
    `SELECT tuleap_artifact_id FROM tuleap_missing_artifact
       WHERE tracker_type = $1 AND qc_project_id = $2 AND resolved_at IS NULL AND miss_count >= $3`,
    [trackerType, qcProjectId, confirmThreshold]
  );

  const confirmedDeletes = [];
  const dispatch = dispatchByType[trackerType];
  if (!dispatch) {
    throw new Error(`No dispatcher registered for tracker_type=${trackerType}`);
  }

  for (const row of toDeleteRes.rows) {
    const artifactId = row.tuleap_artifact_id;
    try {
      await dispatch(
        { action: 'delete', tuleap: { artifact_id: artifactId }, project_id: qcProjectId },
        { qc_project_id: qcProjectId, tracker_type: trackerType },
        { query: pool.query.bind(pool) }
      );
      await pool.query(
        `UPDATE tuleap_missing_artifact
           SET resolved_at = NOW(), resolution = 'soft_deleted'
         WHERE tuleap_artifact_id = $1 AND tracker_type = $2`,
        [artifactId, trackerType]
      );
      confirmedDeletes.push(artifactId);
    } catch (err) {
      // Leave the missing row unresolved — next cycle will retry
      console.warn(`[reconcile-deletes] dispatch_failed tracker_type=${trackerType} artifact_id=${artifactId} err="${err.message}"`);
    }
  }

  return {
    suspected,
    confirmedDeletes,
    recovered,
    aborted: false,
    abortedReason: null,
  };
}

module.exports = { reconcileDeletes, TABLE_BY_TYPE };
```

- [ ] **Step 2.4: Run the happy-path test — should pass**

```bash
cd /root/QC-Manager && npx jest tests/api/tuleapReconcileDeletes.test.js
```

Expected: 1 passed.

### Step 2.5 — Add the 2-cycle confirmation test

- [ ] Append to `tests/api/tuleapReconcileDeletes.test.js`:

```js
test('first miss does not delete, second miss does delete', async () => {
  // First call: artifact 99 is in QC, NOT in present list. Should upsert miss_count=1, not delete.
  const dispatch = jest.fn().mockResolvedValue({ action: 'deleted' });
  const stateA = { qcArtifactIds: [99], missingRows: [] };
  const poolA = makePool(stateA);
  // Override the SELECT-from-tuleap_missing_artifact-by-threshold to return [] on first call
  poolA.query = async (sql, params) => {
    if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) return { rows: [{ tuleap_artifact_id: 99 }] };
    if (/INSERT INTO tuleap_missing_artifact/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/UPDATE tuleap_missing_artifact[\s\S]*resolved_at = NOW\(\), resolution = 'reappeared'/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/SELECT tuleap_artifact_id FROM tuleap_missing_artifact[\s\S]*miss_count >= /i.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 0 };
  };
  const r1 = await reconcileDeletes({
    presentIds: [],
    qcProjectId: 'project-uuid-1',
    trackerType: 'bug',
    pool: poolA,
    dispatchByType: { bug: dispatch },
  });
  expect(r1.suspected).toEqual([99]);
  expect(r1.confirmedDeletes).toEqual([]);
  expect(dispatch).not.toHaveBeenCalled();

  // Second call: still missing. miss_count is now 2. Should delete.
  const poolB = makePool({ qcArtifactIds: [99], missingRows: [] });
  poolB.query = async (sql, params) => {
    if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) return { rows: [{ tuleap_artifact_id: 99 }] };
    if (/INSERT INTO tuleap_missing_artifact/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/SELECT tuleap_artifact_id FROM tuleap_missing_artifact[\s\S]*miss_count >= /i.test(sql)) {
      return { rows: [{ tuleap_artifact_id: 99 }] };
    }
    if (/UPDATE tuleap_missing_artifact[\s\S]*resolution = 'soft_deleted'/i.test(sql)) return { rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const r2 = await reconcileDeletes({
    presentIds: [],
    qcProjectId: 'project-uuid-1',
    trackerType: 'bug',
    pool: poolB,
    dispatchByType: { bug: dispatch },
  });
  expect(r2.suspected).toEqual([99]);
  expect(r2.confirmedDeletes).toEqual([99]);
  expect(dispatch).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2.6: Run — should pass**

```bash
cd /root/QC-Manager && npx jest tests/api/tuleapReconcileDeletes.test.js
```

Expected: 2 passed.

### Step 2.7 — Add the circuit-breaker test

- [ ] Append:

```js
test('circuit breaker aborts when suspected count exceeds threshold', async () => {
  const dispatch = jest.fn();
  const big = Array.from({ length: 60 }, (_, i) => 1000 + i);
  const pool = makePool({ qcArtifactIds: big, missingRows: [] });
  pool.query = async (sql, params) => {
    if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) {
      return { rows: big.map(id => ({ tuleap_artifact_id: id })) };
    }
    return { rows: [], rowCount: 0 };
  };
  const result = await reconcileDeletes({
    presentIds: [],          // everything looks missing — likely Tuleap auth fail
    qcProjectId: 'project-uuid-1',
    trackerType: 'bug',
    pool,
    dispatchByType: { bug: dispatch },
    maxMissingPerCycle: 50,
  });
  expect(result.aborted).toBe(true);
  expect(result.abortedReason).toMatch(/suspected_count=60/);
  expect(result.confirmedDeletes).toEqual([]);
  expect(dispatch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2.8: Run — should pass**

```bash
cd /root/QC-Manager && npx jest tests/api/tuleapReconcileDeletes.test.js
```

Expected: 3 passed.

### Step 2.9 — Add the recovery test

- [ ] Append:

```js
test('artifact reappears: clears the missing row, no delete', async () => {
  const dispatch = jest.fn();
  const pool = makePool({ qcArtifactIds: [50], missingRows: [] });
  let resolveCalled = false;
  pool.query = async (sql, params) => {
    if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) return { rows: [{ tuleap_artifact_id: 50 }] };
    if (/UPDATE tuleap_missing_artifact[\s\S]*resolution = 'reappeared'/i.test(sql)) {
      resolveCalled = true;
      return { rows: [{ tuleap_artifact_id: 50 }] };
    }
    if (/SELECT tuleap_artifact_id FROM tuleap_missing_artifact[\s\S]*miss_count >= /i.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 0 };
  };
  const result = await reconcileDeletes({
    presentIds: [50],   // 50 is back
    qcProjectId: 'project-uuid-1',
    trackerType: 'bug',
    pool,
    dispatchByType: { bug: dispatch },
  });
  expect(result.suspected).toEqual([]);
  expect(result.recovered).toEqual([50]);
  expect(resolveCalled).toBe(true);
  expect(dispatch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2.10: Run — should pass**

```bash
cd /root/QC-Manager && npx jest tests/api/tuleapReconcileDeletes.test.js
```

Expected: 4 passed.

- [ ] **Step 2.11: Commit**

```bash
git add apps/api/src/services/tuleapReconcileDeletes.js tests/api/tuleapReconcileDeletes.test.js
git commit -m "feat(tuleap): pure reconcile-deletes function with 2-cycle confirmation and circuit breaker"
```

---

## Task 3 — Wire the API endpoint

**Files:**
- Modify: `apps/api/src/routes/tuleapWebhook.js` (append a new route)

The endpoint receives `{ tuleap_tracker_id, qc_project_id, tracker_type, present_artifact_ids[], page_count, truncated }` from n8n, looks up the right dispatcher per tracker_type, calls `reconcileDeletes`, returns a structured result.

### Step 3.1 — Add the route

- [ ] At the top of `apps/api/src/routes/tuleapWebhook.js`, after the existing `dispatchTestCase` import (line 16), add:

```js
const { reconcileDeletes } = require('../services/tuleapReconcileDeletes');
```

- [ ] Add the route handler **immediately before** `module.exports = router;` at the bottom of the file:

```js
// =====================================================
// POST /tuleap-webhook/reconcile-deletes
// Receive a complete present-artifact-id list from n8n's reconcile workflow
// and soft-delete QC rows whose Tuleap counterpart has gone missing for >= 2 cycles.
// =====================================================
router.post('/reconcile-deletes', async (req, res) => {
    try {
        const { tuleap_tracker_id, qc_project_id, tracker_type, present_artifact_ids, page_count, truncated } = req.body;

        if (!tuleap_tracker_id || !qc_project_id || !tracker_type || !Array.isArray(present_artifact_ids)) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_tracker_id, qc_project_id, tracker_type, and present_artifact_ids[] are required',
            });
        }

        if (truncated) {
            console.warn(`[reconcile-deletes] paginate_truncated tracker_id=${tuleap_tracker_id} pages=${page_count} — refusing to diff (would false-positive)`);
            return res.status(202).json({
                success: true,
                aborted: true,
                abortedReason: 'pagination_truncated',
                tuleap_tracker_id,
            });
        }

        const dispatchByType = {
            bug: require('../services/persisters/bug').dispatchAction,
            task: require('../services/persisters/task').dispatchAction,
            user_story: require('../services/persisters/user_story').dispatchAction,
            test_case: require('../services/persisters/test_case').dispatchAction,
        };

        if (!dispatchByType[tracker_type]) {
            return res.status(400).json({ success: false, error: `Unsupported tracker_type: ${tracker_type}` });
        }

        const result = await reconcileDeletes({
            presentIds: present_artifact_ids,
            qcProjectId: qc_project_id,
            trackerType: tracker_type,
            pool,
            dispatchByType,
            maxMissingPerCycle: parseInt(process.env.TULEAP_RECONCILE_MAX_MISSING || '50', 10),
            confirmThreshold: parseInt(process.env.TULEAP_RECONCILE_CONFIRM_THRESHOLD || '2', 10),
        });

        if (result.aborted) {
            console.warn(`[reconcile-deletes] aborted tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} reason="${result.abortedReason}"`);
        }
        if (result.suspected.length > 0) {
            console.log(`[reconcile-deletes] suspected_missing tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} count=${result.suspected.length} ids=${JSON.stringify(result.suspected)}`);
        }
        if (result.confirmedDeletes.length > 0) {
            console.log(`[reconcile-deletes] confirmed_deletes tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} count=${result.confirmedDeletes.length} ids=${JSON.stringify(result.confirmedDeletes)}`);
        }
        if (result.recovered.length > 0) {
            console.log(`[reconcile-deletes] recovered tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} count=${result.recovered.length} ids=${JSON.stringify(result.recovered)}`);
        }

        return res.status(200).json({
            success: true,
            tuleap_tracker_id,
            tracker_type,
            qc_project_id,
            present_count: present_artifact_ids.length,
            ...result,
        });
    } catch (error) {
        console.error('[reconcile-deletes] unhandled_error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to reconcile deletes',
            message: error.message,
        });
    }
});
```

### Step 3.2 — Smoke-test the endpoint manually with `curl`

- [ ] Pick an active config and verify the endpoint returns sane output for a no-op cycle (everything present):

```bash
# 1. Get an active config to find a real tracker_id, qc_project_id, tracker_type
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT tuleap_tracker_id, qc_project_id, tracker_type FROM tuleap_sync_config WHERE is_active = true LIMIT 1;"

# 2. Get the current tuleap_artifact_ids in QC for that (project, type) — let's say type='bug'
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT tuleap_artifact_id FROM bugs WHERE project_id = '<qc_project_id>' AND tuleap_artifact_id IS NOT NULL AND deleted_at IS NULL;"

# 3. POST the same set as 'present' — diff should be empty, no action
curl -s -X POST http://localhost:3001/tuleap-webhook/reconcile-deletes \
  -H 'Content-Type: application/json' \
  -d '{
        "tuleap_tracker_id": <id>,
        "qc_project_id": "<uuid>",
        "tracker_type": "bug",
        "present_artifact_ids": [<id1>,<id2>,...],
        "page_count": 1,
        "truncated": false
      }' | jq .
```

Expected output:
```json
{ "success": true, "suspected": [], "confirmedDeletes": [], "recovered": [], "aborted": false, ... }
```

### Step 3.3 — Smoke-test with a fake-missing artifact (cycle 1)

- [ ] POST the same body but **omit one ID** from `present_artifact_ids`. That ID should appear in `suspected` but NOT yet in `confirmedDeletes`:

```bash
curl -s -X POST http://localhost:3001/tuleap-webhook/reconcile-deletes \
  -H 'Content-Type: application/json' \
  -d '{... same as above but with one id omitted ...}' | jq .
```

Expected: `"suspected": [<missing_id>], "confirmedDeletes": []`. Then verify in DB:

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT tuleap_artifact_id, miss_count, resolved_at FROM tuleap_missing_artifact WHERE tuleap_artifact_id = <missing_id>;"
```

Expected: `miss_count = 1, resolved_at = NULL`. The QC `bugs` row's `deleted_at` should still be NULL.

### Step 3.4 — Smoke-test with the same fake-missing artifact (cycle 2)

- [ ] Repeat the same POST. This is the second consecutive miss; `confirmedDeletes` should now include the ID:

```bash
curl -s -X POST http://localhost:3001/tuleap-webhook/reconcile-deletes -H 'Content-Type: application/json' -d '{... same body ...}' | jq .
```

Expected: `"confirmedDeletes": [<missing_id>]`.

Verify:
```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT id, deleted_at FROM bugs WHERE tuleap_artifact_id = <missing_id>;"
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT resolved_at, resolution FROM tuleap_missing_artifact WHERE tuleap_artifact_id = <missing_id>;"
```

Expected: `bugs.deleted_at` set, `tuleap_missing_artifact.resolved_at` set, `resolution = 'soft_deleted'`.

### Step 3.5 — Restore the test artifact

The smoke test soft-deleted a real bug. Restore it before moving on:

- [ ] In the DB:

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "UPDATE bugs SET deleted_at = NULL WHERE tuleap_artifact_id = <missing_id>;"
docker exec supabase-db psql -U postgres -d postgres -c \
  "DELETE FROM tuleap_missing_artifact WHERE tuleap_artifact_id = <missing_id>;"
```

### Step 3.6 — Commit

```bash
git add apps/api/src/routes/tuleapWebhook.js
git commit -m "feat(tuleap): POST /tuleap-webhook/reconcile-deletes endpoint with circuit breaker"
```

---

## Task 4 — Build the n8n reconcile workflow

**Files:**
- Create: `n8n-workflows/tuleap-unified-reconcile-deletes.json`

The workflow:
1. Schedule trigger every 4 minutes.
2. Fetch active configs (reuses `GET /tuleap-webhook/config?is_active=true`).
3. Split per config.
4. For each config, run a Code node that paginates Tuleap exhaustively, building `present_artifact_ids[]`.
5. POST the result to `/tuleap-webhook/reconcile-deletes`.

### Step 4.1 — Create the workflow JSON

- [ ] Create `n8n-workflows/tuleap-unified-reconcile-deletes.json`:

```json
{
  "name": "Tuleap Unified Reconcile Deletes",
  "id": "RECreconcile001",
  "nodes": [
    {
      "id": "schedule-trigger",
      "name": "Every 4 minutes",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [200, 300],
      "parameters": {
        "rule": {
          "interval": [{ "field": "cronExpression", "expression": "*/4 * * * *" }]
        }
      }
    },
    {
      "id": "fetch-active-trackers",
      "name": "Fetch Active Trackers",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [450, 300],
      "parameters": {
        "method": "GET",
        "url": "http://qc-api:3001/tuleap-webhook/config?is_active=true",
        "options": {}
      }
    },
    {
      "id": "split-configs",
      "name": "Split Configs",
      "type": "n8n-nodes-base.code",
      "typeVersion": 1,
      "position": [700, 300],
      "parameters": {
        "jsCode": "const configs = $input.first().json.data || [];\nreturn configs.map(config => ({ json: config }));"
      }
    },
    {
      "id": "split-in-batches",
      "name": "Split In Batches",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 1,
      "position": [950, 300],
      "parameters": { "batchSize": 1, "options": {} }
    },
    {
      "id": "paginate-and-post",
      "name": "Paginate Tuleap and POST Reconcile",
      "type": "n8n-nodes-base.code",
      "typeVersion": 1,
      "position": [1200, 300],
      "parameters": {
        "jsCode": "const config = $input.item.json;\nconst baseUrl = $env.TULEAP_BASE_URL;\nconst accessKey = $env.TULEAP_ACCESS_KEY;\nconst trackerId = config.tuleap_tracker_id;\nconst qcProjectId = config.qc_project_id;\nconst trackerType = config.tracker_type;\n\nconst MAX_PAGES = 50;        // safety cap = 5,000 artifacts per tracker\nconst LIMIT = 100;\n\nconst present = [];\nlet offset = 0;\nlet pageCount = 0;\nlet truncated = false;\n\nwhile (pageCount < MAX_PAGES) {\n  const url = `${baseUrl}/api/v1/trackers/${trackerId}/artifacts?limit=${LIMIT}&offset=${offset}&values_format=collection`;\n  let resp;\n  try {\n    resp = await this.helpers.httpRequest({\n      url,\n      method: 'GET',\n      headers: { 'X-Auth-AccessKey': accessKey },\n      json: true,\n    });\n  } catch (err) {\n    // Bail on any HTTP error — partial pagination must NOT trigger deletes downstream\n    return [{ json: { skipped: true, reason: `tuleap_fetch_failed: ${err.message}`, tuleap_tracker_id: trackerId } }];\n  }\n  const items = Array.isArray(resp) ? resp : (resp.collection || resp.data || []);\n  if (!items.length) break;\n  for (const a of items) present.push(a.id);\n  pageCount += 1;\n  if (items.length < LIMIT) break;\n  offset += LIMIT;\n}\nif (pageCount >= MAX_PAGES) truncated = true;\n\n// Send to QC API\ntry {\n  const reconcileResp = await this.helpers.httpRequest({\n    url: 'http://qc-api:3001/tuleap-webhook/reconcile-deletes',\n    method: 'POST',\n    body: {\n      tuleap_tracker_id: trackerId,\n      qc_project_id: qcProjectId,\n      tracker_type: trackerType,\n      present_artifact_ids: present,\n      page_count: pageCount,\n      truncated,\n    },\n    json: true,\n  });\n  return [{ json: { tuleap_tracker_id: trackerId, present_count: present.length, page_count: pageCount, truncated, qc_response: reconcileResp } }];\n} catch (err) {\n  return [{ json: { skipped: true, reason: `qc_post_failed: ${err.message}`, tuleap_tracker_id: trackerId, present_count: present.length } }];\n}"
      }
    }
  ],
  "connections": {
    "Every 4 minutes": {
      "main": [[{ "node": "Fetch Active Trackers", "type": "main", "index": 0 }]]
    },
    "Fetch Active Trackers": {
      "main": [[{ "node": "Split Configs", "type": "main", "index": 0 }]]
    },
    "Split Configs": {
      "main": [[{ "node": "Split In Batches", "type": "main", "index": 0 }]]
    },
    "Split In Batches": {
      "main": [[{ "node": "Paginate Tuleap and POST Reconcile", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": { "executionOrder": "v1" },
  "versionId": "",
  "meta": { "instanceId": "" },
  "tags": [
    { "name": "tuleap" },
    { "name": "unified" },
    { "name": "reconcile" }
  ]
}
```

### Step 4.2 — Import the workflow to n8n on the VPS

- [ ] After deploy (Task 6), SSH to the VPS and import:

```bash
docker exec -i n8n-n8n-1 n8n import:workflow --input=/path/to/tuleap-unified-reconcile-deletes.json
```

Then in the n8n UI:
- Open **Tuleap Unified Reconcile Deletes**.
- Click **Active** toggle to ON.
- Verify the schedule node shows `*/4 * * * *`.

### Step 4.3 — Manually trigger one execution as a smoke test

- [ ] In the n8n UI, click **Execute Workflow** on the reconcile workflow.
- [ ] Inspect each node's output:
  - `Fetch Active Trackers` → returns the list of configs.
  - `Paginate Tuleap and POST Reconcile` → for each config, returns `{ tuleap_tracker_id, present_count, page_count, truncated, qc_response: { suspected: [...], confirmedDeletes: [...], ... } }`.
- [ ] Tail QC API logs and confirm a `[reconcile-deletes] ...` log line per active tracker:

```bash
docker logs qc-api --since 2m | grep "reconcile-deletes"
```

Expected: lines like `[reconcile-deletes] suspected_missing tracker_id=... count=0` (count=0 is healthy on first run).

### Step 4.4 — Commit

```bash
git add n8n-workflows/tuleap-unified-reconcile-deletes.json
git commit -m "feat(tuleap): n8n reconcile-deletes workflow with full pagination"
```

---

## Task 5 — End-to-end smoke test (real Tuleap delete)

This is the only test that exercises the entire path. Pick a project with at least one Tuleap-linked artifact you can safely delete (a throwaway test bug works best).

### Step 5.1 — Bug delete via Tuleap web UI

- [ ] In the Tuleap web UI, create a fresh test bug in a tracker QC syncs from. Wait 2 min for the sync poll to land it in QC's `bugs` table.
- [ ] Confirm in QC:
  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT id, title, tuleap_artifact_id, deleted_at FROM bugs WHERE tuleap_artifact_id = <new_id>;"
  ```
  Expected: row exists, `deleted_at = NULL`.

- [ ] In Tuleap web UI, **delete the artifact** (via the artifact's overflow menu).

- [ ] Wait 4 min. Refresh the reconcile workflow's execution list in n8n. Verify there is at least one execution since the delete.

- [ ] Confirm in QC the artifact is now in the missing table with `miss_count = 1`:
  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT tuleap_artifact_id, miss_count, resolved_at FROM tuleap_missing_artifact WHERE tuleap_artifact_id = <id>;"
  ```
  Expected: `miss_count = 1, resolved_at = NULL`. The bug row is still NOT soft-deleted yet.

- [ ] Wait another 4 min (so a second cycle runs). Verify:
  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT id, deleted_at FROM bugs WHERE tuleap_artifact_id = <id>;"
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT miss_count, resolved_at, resolution FROM tuleap_missing_artifact WHERE tuleap_artifact_id = <id>;"
  ```
  Expected: `bugs.deleted_at` set; `tuleap_missing_artifact.resolved_at` set, `resolution = 'soft_deleted'`, `miss_count >= 2`.

- [ ] Tail logs and confirm:
  ```bash
  docker logs qc-api --since 10m | grep "reconcile-deletes"
  ```
  Expected: at least one `suspected_missing ... count=1 ids=[<id>]` and one `confirmed_deletes ... count=1 ids=[<id>]`.

### Step 5.2 — Recovery test (artifact reappears before 2 cycles)

- [ ] Create another fresh test bug in Tuleap; wait for it to sync.
- [ ] In Tuleap, **don't delete** — instead, simulate a transient miss by **temporarily** removing the bug from a Tuleap query (e.g., move it to a different tracker, then move it back within 2 min). This is harder to do cleanly; if your Tuleap doesn't support easy move, skip this step and rely on the unit test for recovery.
- [ ] Alternative: directly POST a `present_artifact_ids` list with the new bug's ID **omitted** for cycle 1, then the same list **with** the ID for cycle 2. In `tuleap_missing_artifact`, the row should have `resolved_at` set with `resolution = 'reappeared'`. The QC `bugs` row should never have `deleted_at` set.

### Step 5.3 — Circuit-breaker test

- [ ] Manually POST a body with `present_artifact_ids: []` for a tracker that has many artifacts in QC:

```bash
curl -s -X POST http://localhost:3001/tuleap-webhook/reconcile-deletes \
  -H 'Content-Type: application/json' \
  -d '{
        "tuleap_tracker_id": <id>,
        "qc_project_id": "<uuid>",
        "tracker_type": "bug",
        "present_artifact_ids": [],
        "page_count": 1,
        "truncated": false
      }' | jq .
```

Expected: `"aborted": true, "abortedReason": "suspected_count=N exceeds maxMissingPerCycle=50"`.

Verify nothing was soft-deleted:
```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM bugs WHERE project_id = '<uuid>' AND deleted_at IS NULL AND tuleap_artifact_id IS NOT NULL;"
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM tuleap_missing_artifact WHERE qc_project_id = '<uuid>' AND tracker_type = 'bug' AND resolved_at IS NULL;"
```

Expected: `bugs.count` unchanged from before the call; `tuleap_missing_artifact` count unchanged (the breaker fires *before* upserts).

### Step 5.4 — Other tracker types

- [ ] Repeat Step 5.1 for `task` and `test_case`. Skip `user_story` if no easy delete UI.

---

## Task 6 — Deployment

This project deploys via GitHub Actions (`.github/workflows/deploy.yml`) on push to `main`. The migration runs automatically on deploy if the project's deploy step applies pending migrations; if not, run it manually post-deploy on prod.

- [ ] Verify lint / build:

```bash
cd /root/QC-Manager
npm run -w apps/api lint   # or the project's lint command
npx jest tests/api/tuleapReconcileDeletes.test.js
```

- [ ] Open PR from feature branch `feat/tuleap-bidirectional-sync-slice2`:

```bash
gh pr create --title "feat(tuleap): inbound delete reconciliation (slice 2)" --body "$(cat <<'EOF'
## Summary
- Adds `POST /tuleap-webhook/reconcile-deletes` endpoint that diffs an n8n-supplied list of present Tuleap artifact IDs against QC and soft-deletes orphans after 2 consecutive missing cycles
- New n8n workflow `tuleap-unified-reconcile-deletes` paginates Tuleap exhaustively every 4 min and POSTs the result
- New table `tuleap_missing_artifact` tracks per-artifact consecutive-miss state
- Circuit breaker refuses to delete if more than `TULEAP_RECONCILE_MAX_MISSING` (default 50) artifacts go missing in one cycle

Closes Slice 2 of the bidirectional sync plan (docs/superpowers/plans/2026-05-09-tuleap-bidirectional-sync-slice2.md).

## Test plan
- [x] Unit tests for `reconcileDeletes` (4 cases: no-op, 2-cycle confirm, circuit breaker, recovery)
- [ ] Manual: delete a real test bug in Tuleap, verify QC soft-deletes it after ≤ 8 min
- [ ] Manual: verify circuit breaker via curl POST with empty present_artifact_ids
- [ ] Manual: verify n8n reconcile workflow runs every 4 min with no errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] After PR merges to `main`:
  1. CI deploys to prod.
  2. SSH to the VPS, run the migration on prod DB:
     ```bash
     ssh <vps>
     docker exec -i supabase-db psql -U postgres -d postgres < /path/to/repo/database/migrations/027_tuleap_missing_artifact.sql
     ```
  3. Import the n8n workflow:
     ```bash
     docker exec -i n8n-n8n-1 n8n import:workflow --input=/path/to/tuleap-unified-reconcile-deletes.json
     ```
  4. Activate the workflow in the n8n UI.

- [ ] Run Task 5 smoke tests against prod (use a throwaway bug).

---

## Rollback plan

The change has one schema migration (additive only — new table, no FK on existing tables that would block a revert) and three code surfaces (route, service, n8n workflow).

If post-deploy something goes wrong:

1. **First-line:** In the n8n UI, **deactivate** the `Tuleap Unified Reconcile Deletes` workflow. This stops further reconcile cycles immediately. The endpoint is harmless without traffic.
2. **If false-positive deletes already happened:** Restore them with:
   ```sql
   UPDATE bugs   SET deleted_at = NULL WHERE id IN (
     SELECT b.id FROM bugs b
     JOIN tuleap_missing_artifact m ON m.tuleap_artifact_id = b.tuleap_artifact_id AND m.tracker_type = 'bug'
     WHERE m.resolution = 'soft_deleted' AND m.resolved_at > NOW() - INTERVAL '24 hours'
   );
   -- Repeat for tasks / user_stories / test_case as needed.
   ```
3. **Code revert:** `git revert <merge-sha>` → push. CI redeploys.
4. The migration can stay (additive). If you want it gone: `DROP TABLE tuleap_missing_artifact;`.

---

## Out of scope — Slice 3 candidates

- **Pagination fix for `tuleap-unified-poll.json`.** The 2-min sync poll still uses `limit=100` only. Trackers with >100 artifacts will miss tail-end edits in the sync poll (delete detection is unaffected — reconcile workflow paginates).
- **`PATCH /api/{bugs,tasks,test-cases}/:id` through emitter.** Slice 1 Q6 deferred work; QC-only fields need careful refactor.
- **Tuleap-side webhook delivery.** Tuleap admin says webhooks are configured but nothing reaches n8n since 2026-04-23. Requires SSH/admin on the Tuleap VM.
- **Operator dashboard for `tuleap_missing_artifact`.** A simple admin view listing currently-suspected-missing artifacts with their miss_count would help diagnose Tuleap flakiness without log-grepping. Add only if log-grepping proves painful.
- **Hard-delete cleanup.** Soft-deleted rows accumulate. A monthly job could hard-delete `bugs/tasks/etc.` rows whose `deleted_at < NOW() - INTERVAL '90 days'`. Defer until volume warrants.

---

## Open questions for the implementing agent

1. **Does the project's CI run pending SQL migrations automatically on deploy?** If yes, Task 6's "run the migration on prod DB" step is unnecessary. Check `.github/workflows/deploy.yml` for a migration step before running by hand.
2. **n8n's `this.helpers.httpRequest` availability in a Code node** — the workflow JSON in Task 4 uses it. n8n versions ≥ 1.0 expose it; older versions may need `$http.request` instead. If the smoke test in Step 4.3 fails with `helpers is undefined`, swap to `$http.request`.
3. **`apps/api/src/services/persisters/test_case.js`** soft-deletes from a table called `test_case` (singular). Confirm before relying on `TABLE_BY_TYPE` in `tuleapReconcileDeletes.js` — if the actual table name differs in your snapshot, fix the constant.
4. **`projects.id` foreign key in the new table** — uses `REFERENCES projects(id)`. If the existing schema uses a different column name (e.g. `project_id`), adjust the migration.
5. **Jest config** — the test file path assumes `tests/api/...` is collected by Jest. If the project uses a different test root, move the file accordingly. Check `jest.config.js` / `package.json` `jest` block before writing.
