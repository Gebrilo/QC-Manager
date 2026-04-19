# Sync "Updated By" Field for Bugs from Tuleap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that when a bug is updated in Tuleap, the `updated_by` field in QC-Manager is always synced to reflect the latest editor, without overwriting immutable fields like `reported_by` or `owner_resource_id`.

**Architecture:** Add an `updated_by` column to the `bugs` table. Extend the n8n workflow to send the webhook-triggering user as `updated_by`. Update the API webhook handler to write it on every sync UPDATE while keeping it absent from the CREATE path's immutable fields.

**Tech Stack:** PostgreSQL (Supabase), Node.js/Express, n8n, TypeScript (frontend types)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `database/migrations/016_add_updated_by_to_bugs.sql` | Create | Adds `updated_by` column to bugs table |
| `apps/api/__tests__/fixtures/tuleapPayloads.js` | Modify | Add `updated_by` to `processedBugData` fixture |
| `apps/api/__tests__/tuleapWebhook.bug.test.js` | Modify | Add T021 test: updated_by is synced on update |
| `apps/api/src/routes/tuleapWebhook.js` | Modify | Destructure + write `updated_by` in UPDATE path |
| `apps/api/src/routes/bugs.js` | Modify | Add `updated_by` to PATCH `allowedFields` |
| `n8n-workflows/tuleap-bug-sync.json` | Modify | Add `updated_by` to "Transform Bug Data" node output |
| `apps/web/src/types/governance.ts` | Modify | Add `updated_by?: string` to `Bug` interface |

---

### Task 1: DB Migration — Add `updated_by` to bugs table

**Files:**
- Create: `database/migrations/016_add_updated_by_to_bugs.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- database/migrations/016_add_updated_by_to_bugs.sql
-- Adds mutable updated_by field: overwritten on every sync, records the Tuleap user who last edited.

ALTER TABLE bugs
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

COMMENT ON COLUMN bugs.updated_by IS 'Tuleap user who last updated this bug; synced on every webhook update';
```

- [ ] **Step 2: Apply to the database**

Connect to your running Supabase/Postgres instance and run:

```bash
psql "$DATABASE_URL" -f database/migrations/016_add_updated_by_to_bugs.sql
```

Expected output:
```
ALTER TABLE
COMMENT
```

- [ ] **Step 3: Verify the column exists**

```bash
psql "$DATABASE_URL" -c "\d bugs" | grep updated_by
```

Expected output:
```
 updated_by          | character varying(255)      |           |          |
```

- [ ] **Step 4: Commit**

```bash
git add database/migrations/016_add_updated_by_to_bugs.sql
git commit -m "feat: add updated_by column to bugs table"
```

---

### Task 2: Update test fixture + write failing test

**Files:**
- Modify: `apps/api/__tests__/fixtures/tuleapPayloads.js`
- Modify: `apps/api/__tests__/tuleapWebhook.bug.test.js`

- [ ] **Step 1: Add `updated_by` to the processedBugData fixture**

In `apps/api/__tests__/fixtures/tuleapPayloads.js`, find the `processedBugData` object (around line 81) and add `updated_by`:

Old:
```javascript
const processedBugData = {
    tuleap_artifact_id: 67890,
    tuleap_tracker_id: 102,
    tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=67890',
    bug_id: 'TLP-67890',
    title: 'Button click does not submit form',
    description: 'When clicking the submit button on the login page, nothing happens',
    status: 'Open',
    severity: 'critical',
    priority: 'high',
    bug_type: 'UI Defect',
    component: 'Frontend',
    project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    reported_by: 'Jane Smith',
    assigned_to: 'Bob Builder',
    reported_date: '2026-02-20T14:00:00+00:00',
    raw_tuleap_payload: sampleBugPayload
};
```

New:
```javascript
const processedBugData = {
    tuleap_artifact_id: 67890,
    tuleap_tracker_id: 102,
    tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=67890',
    bug_id: 'TLP-67890',
    title: 'Button click does not submit form',
    description: 'When clicking the submit button on the login page, nothing happens',
    status: 'Open',
    severity: 'critical',
    priority: 'high',
    bug_type: 'UI Defect',
    component: 'Frontend',
    project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    reported_by: 'Jane Smith',
    updated_by: 'Jane Smith',
    assigned_to: 'Bob Builder',
    reported_date: '2026-02-20T14:00:00+00:00',
    raw_tuleap_payload: sampleBugPayload
};
```

- [ ] **Step 2: Add failing test T021 to tuleapWebhook.bug.test.js**

Append this test inside the `describe('POST /tuleap-webhook/bug', ...)` block at the end of the file:

```javascript
// T021: updated_by is synced on update, reported_by is not overwritten
test('T021: updated_by is written to DB on update; reported_by is not touched', async () => {
    const bugPayload = {
        ...processedBugData,
        updated_by: 'Bob Editor',   // a different user from the original reporter
    };

    const existingBug = {
        id: 'existing-bug-uuid',
        bug_id: 'TLP-67890',
        tuleap_artifact_id: bugPayload.tuleap_artifact_id,
        deleted_at: null,
        reported_by: 'Jane Smith',  // original reporter — must not change
    };

    mockQuery
        .mockResolvedValueOnce({ rows: [] })            // logWebhook (received)
        .mockResolvedValueOnce({ rows: [existingBug] }) // SELECT: bug exists
        .mockResolvedValueOnce({
            rows: [{
                ...existingBug,
                title: bugPayload.title,
                status: bugPayload.status,
                updated_by: 'Bob Editor',
            }]
        })                                              // UPDATE bug
        .mockResolvedValueOnce({ rows: [] });           // logWebhook (processed)

    const mockReq = { body: bugPayload };
    const mockRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json: jest.fn()
    };

    const routeLayer = tuleapRouter.stack.find(
        layer => layer.route && layer.route.path === '/bug' && layer.route.methods.post
    );
    await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

    expect(mockRes.statusCode).toBe(200);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.action).toBe('updated');
    expect(response.data.updated_by).toBe('Bob Editor');

    // Verify the UPDATE query included updated_by
    const updateCall = mockQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE bugs SET')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toContain('updated_by');
    expect(updateCall[1]).toContain('Bob Editor');

    // Verify reported_by was NOT included in the UPDATE query parameters
    expect(updateCall[1]).not.toContain('Jane Smith');
});
```

- [ ] **Step 3: Run the new test to confirm it fails**

```bash
cd apps/api && npx jest tuleapWebhook.bug.test.js -t "T021" --no-coverage
```

Expected: FAIL — `updated_by` not in UPDATE query, `response.data.updated_by` is undefined.

- [ ] **Step 4: Commit the fixture + failing test**

```bash
git add apps/api/__tests__/fixtures/tuleapPayloads.js apps/api/__tests__/tuleapWebhook.bug.test.js
git commit -m "test: add T021 failing test for updated_by sync on bug update"
```

---

### Task 3: Update API webhook handler to write `updated_by`

**Files:**
- Modify: `apps/api/src/routes/tuleapWebhook.js:227-409`

- [ ] **Step 1: Destructure `updated_by` from request body**

In the `router.post('/bug', ...)` handler, find the destructuring block (around line 229). Add `updated_by` after `reported_by`:

Old:
```javascript
        reported_by,
        assigned_to,
```

New:
```javascript
        reported_by,
        updated_by,
        assigned_to,
```

- [ ] **Step 2: Add `updated_by` to the UPDATE query**

Find the `if (isUpdate)` block (around line 349). Replace the entire UPDATE query:

Old:
```javascript
            const result = await pool.query(`
                UPDATE bugs SET
                    title = $1, description = $2, status = $3, severity = $4, priority = $5,
                    bug_type = $6, component = $7, assigned_to = $8,
                    linked_test_case_ids = $9, linked_test_execution_ids = $10,
                    raw_tuleap_payload = $11, source = $12, last_sync_at = NOW(), updated_at = NOW()
                WHERE id = $13
                RETURNING *
            `, [
                title, description, status, severity, priority,
                bug_type, component, assigned_to,
                linked_test_case_ids, linked_test_execution_ids,
                raw_tuleap_payload, finalSource, existingId
            ]);
```

New:
```javascript
            const result = await pool.query(`
                UPDATE bugs SET
                    title = $1, description = $2, status = $3, severity = $4, priority = $5,
                    bug_type = $6, component = $7, assigned_to = $8,
                    linked_test_case_ids = $9, linked_test_execution_ids = $10,
                    raw_tuleap_payload = $11, source = $12,
                    updated_by = $13,
                    last_sync_at = NOW(), updated_at = NOW()
                WHERE id = $14
                RETURNING *
            `, [
                title, description, status, severity, priority,
                bug_type, component, assigned_to,
                linked_test_case_ids, linked_test_execution_ids,
                raw_tuleap_payload, finalSource,
                updated_by || null,
                existingId
            ]);
```

- [ ] **Step 3: Run T021 to verify it now passes**

```bash
cd apps/api && npx jest tuleapWebhook.bug.test.js -t "T021" --no-coverage
```

Expected: PASS

- [ ] **Step 4: Run all bug webhook tests to verify no regressions**

```bash
cd apps/api && npx jest tuleapWebhook.bug.test.js --no-coverage
```

Expected: All tests PASS (T018, T019, T020, T020b, T021).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/tuleapWebhook.js
git commit -m "feat: sync updated_by field in bug webhook handler on update"
```

---

### Task 4: Update n8n workflow to send `updated_by`

**Files:**
- Modify: `n8n-workflows/tuleap-bug-sync.json`

The "Transform Bug Data" node (id `b1234567-0006-4006-8006-000000000006`) builds `bugData`. Its `jsCode` must emit `updated_by`.

- [ ] **Step 1: Write a test that verifies the n8n node code produces `updated_by`**

Create a temporary test script to validate the node logic in isolation:

```bash
cat > /tmp/test_n8n_node.js << 'EOF'
// Simulates the Transform Bug Data node output
const payload = {
    id: 999,
    user: { display_name: 'Alice Updater', username: 'aupdater' },
    tracker: { id: 102 },
    current: {
        id: 999,
        values: [],
        submitted_on: '2026-04-01T10:00:00Z'
    },
    project: { id: 42 }
};

const config = {
    qc_project_id: 'test-project-uuid',
    tuleap_base_url: 'https://tuleap.example.com',
    status_mappings: {}
};

// --- paste the bugData construction from the n8n node here ---
// (after your edit, this block should include updated_by)

const bugData = {
    tuleap_artifact_id: payload.id || payload.current?.id,
    reported_by: payload.user?.display_name || null,
    updated_by: payload.user?.display_name || null,   // THIS is what we're testing
};

console.assert(bugData.updated_by === 'Alice Updater', 'updated_by must be set from payload.user');
console.assert(bugData.reported_by === 'Alice Updater', 'reported_by must still be present');
console.log('PASS: updated_by and reported_by both set correctly');
EOF
node /tmp/test_n8n_node.js
```

Expected output: `PASS: updated_by and reported_by both set correctly`

- [ ] **Step 2: Edit the n8n workflow JSON to add `updated_by`**

In `n8n-workflows/tuleap-bug-sync.json`, find the `"Transform Bug Data"` node. Within its `jsCode` string, find the `bugData` object's `reported_by` line and add `updated_by` immediately after:

Old (within the jsCode string — note JSON escaping):
```
  reported_by:  payload.user?.display_name || null,\n  assigned_to:  user(
```

New:
```
  reported_by:  payload.user?.display_name || null,\n  updated_by:   payload.user?.display_name || null,\n  assigned_to:  user(
```

In the raw JSON file, the jsCode property contains `\n` as literal two-character sequences. Search for:
```
reported_by:  payload.user?.display_name || null,
```
and replace with:
```
reported_by:  payload.user?.display_name || null,\n  updated_by:   payload.user?.display_name || null,
```

The surrounding context in the file (for uniqueness) is `assigned_to:  user('Assigned to','Assigned To','assigned_to'),` which follows immediately.

- [ ] **Step 3: Verify the n8n node test still passes after the edit**

```bash
node /tmp/test_n8n_node.js
```

Expected: `PASS: updated_by and reported_by both set correctly`

- [ ] **Step 4: Commit**

```bash
git add n8n-workflows/tuleap-bug-sync.json
git commit -m "feat: emit updated_by from n8n Transform Bug Data node"
```

---

### Task 5: Add `updated_by` to manual PATCH endpoint

**Files:**
- Modify: `apps/api/src/routes/bugs.js:327-333`

The `PATCH /:id` route has an `allowedFields` array. Adding `updated_by` lets manual edits via the API also update this field.

- [ ] **Step 1: Write a test that verifies `updated_by` is accepted in PATCH**

Add to `apps/api/__tests__/tuleapWebhook.bug.test.js` or a suitable test file. Since `bugs.js` has no dedicated test file, add it inline here:

```javascript
// In a describe block for bugs PATCH, or verify manually via curl:
// curl -X PATCH http://localhost:3001/api/bugs/<id> \
//   -H "Content-Type: application/json" \
//   -d '{"updated_by": "Manual Editor"}' \
//   -H "Authorization: Bearer <token>"
// Expected: 200 with updated_by: "Manual Editor"
```

Since `bugs.js` lacks unit tests, verify via integration test after deployment (see Validation section).

- [ ] **Step 2: Add `updated_by` to allowedFields**

In `apps/api/src/routes/bugs.js`, find the `allowedFields` array (around line 327):

Old:
```javascript
        const allowedFields = [
            'title', 'description', 'status', 'severity', 'priority',
            'bug_type', 'component', 'assigned_to',
            'resolved_date',
            'linked_test_case_ids', 'linked_test_execution_ids', 'raw_tuleap_payload',
            'source'
        ];
```

New:
```javascript
        const allowedFields = [
            'title', 'description', 'status', 'severity', 'priority',
            'bug_type', 'component', 'assigned_to', 'updated_by',
            'resolved_date',
            'linked_test_case_ids', 'linked_test_execution_ids', 'raw_tuleap_payload',
            'source'
        ];
```

- [ ] **Step 3: Run the full API test suite to verify no regressions**

```bash
cd apps/api && npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/bugs.js
git commit -m "feat: allow updated_by in manual bug PATCH endpoint"
```

---

### Task 6: Update frontend TypeScript Bug type

**Files:**
- Modify: `apps/web/src/types/governance.ts`

- [ ] **Step 1: Add `updated_by` to the Bug interface**

In `apps/web/src/types/governance.ts`, find the `Bug` interface and add `updated_by`:

Old:
```typescript
    reported_by?: string;
    assigned_to?: string;
```

New:
```typescript
    reported_by?: string;
    updated_by?: string;
    assigned_to?: string;
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/types/governance.ts
git commit -m "feat: add updated_by to Bug TypeScript interface"
```

---

## Validation

After all tasks are complete, perform end-to-end validation:

**Step 1: First sync (insert path)**
- Trigger a Tuleap bug webhook for a new bug
- Verify in DB: `SELECT bug_id, reported_by, updated_by FROM bugs WHERE tuleap_artifact_id = <id>;`
- Expected: `updated_by IS NULL`, `reported_by = <original reporter>`

**Step 2: Update in Tuleap**
- Edit the bug in Tuleap as a different user (e.g., "Bob Editor")
- Trigger sync (or wait for webhook)
- Verify in DB: `SELECT bug_id, reported_by, updated_by FROM bugs WHERE tuleap_artifact_id = <id>;`
- Expected: `updated_by = 'Bob Editor'`, `reported_by` unchanged

**Step 3: Resource mapping intact**
- Check `owner_resource_id` on the same bug
- Expected: unchanged from the original value set at creation

**Step 4: Bugs page display**
- Open the Bugs page in the web app
- Verify the bug shows the correct updated_by if surfaced in the UI (or confirm it's available in the API response for future UI use)
