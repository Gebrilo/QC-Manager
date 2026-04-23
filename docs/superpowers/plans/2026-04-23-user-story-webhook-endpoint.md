# User Story Webhook Endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /tuleap-webhook/user-story` endpoint to QC-Manager so n8n can upsert Tuleap User Story artifacts into the local DB.

**Architecture:** One new DB migration creates the `user_stories` table and extends the `tuleap_sync_config.tracker_type` CHECK constraint. One new route handler in `tuleapWebhook.js` follows the identical pattern of `POST /tuleap-webhook/test-case` — hash-based idempotency via `tuleap_webhook_log`, upsert by `tuleap_artifact_id`.

**Tech Stack:** Node.js 18+, Express, PostgreSQL, Jest (route tested by directly invoking handler via `tuleapRouter.stack`, matching existing test pattern)

---

## File Structure

```
database/migrations/
  025_user_stories.sql               ← new table + extend tracker_type constraint

apps/api/src/routes/tuleapWebhook.js ← add POST /user-story handler (append after /test-case)

apps/api/__tests__/
  tuleapWebhook.userStory.test.js    ← new test file
  fixtures/tuleapPayloads.js         ← add processedUserStoryData fixture
```

---

## Task 1: DB Migration — `user_stories` table

**File:** `database/migrations/025_user_stories.sql`

- [ ] **Step 1.1: Create the migration file**

```sql
-- Migration 025: User Stories Table
-- Description: Create user_stories table for Tuleap User Story sync, extend tracker_type constraint
-- Date: 2026-04-23

BEGIN;

-- =====================================================
-- USER_STORIES TABLE — Store synced User Stories from Tuleap
-- =====================================================
CREATE TABLE IF NOT EXISTS user_stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tuleap Reference
    tuleap_artifact_id INTEGER NOT NULL UNIQUE,
    tuleap_tracker_id  INTEGER,
    tuleap_url         TEXT,

    -- Story Data
    title                VARCHAR(500) NOT NULL,
    description          TEXT,
    acceptance_criteria  TEXT,
    status               VARCHAR(50) NOT NULL DEFAULT 'Draft',
    requirement_version  VARCHAR(50),
    priority             VARCHAR(50),
    ba_author            VARCHAR(255),

    -- Relationships
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- Sync Metadata
    last_sync_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    raw_tuleap_payload JSONB,

    -- Standard audit columns
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_stories_tuleap_artifact ON user_stories(tuleap_artifact_id);
CREATE INDEX IF NOT EXISTS idx_user_stories_project_id ON user_stories(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_stories_status ON user_stories(status) WHERE deleted_at IS NULL;

CREATE TRIGGER update_user_stories_updated_at
    BEFORE UPDATE ON user_stories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- EXTEND tuleap_sync_config tracker_type constraint
-- Adds 'user-story' alongside existing 'test_case', 'bug', 'task'
-- =====================================================
ALTER TABLE tuleap_sync_config
    DROP CONSTRAINT IF EXISTS tuleap_sync_config_tracker_type_check;

ALTER TABLE tuleap_sync_config
    ADD CONSTRAINT tuleap_sync_config_tracker_type_check
    CHECK (tracker_type IN ('test_case', 'bug', 'task', 'user-story', 'test-case'));

COMMENT ON TABLE user_stories IS 'User Stories synced from Tuleap tracker 6';
COMMENT ON COLUMN user_stories.tuleap_artifact_id IS 'Tuleap artifact ID — used as the upsert key';
COMMENT ON COLUMN user_stories.status IS 'Tuleap status label: Draft | Changes | Review | Approved';

COMMIT;
```

- [ ] **Step 1.2: Apply the migration**

```bash
cd /root/QC-Manager && psql "$DATABASE_URL" -f database/migrations/025_user_stories.sql
```
Expected: output ends with `COMMIT` and no errors.

If `DATABASE_URL` is not set, check `.env` for `DB_*` variables and construct the connection string:
```bash
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -f database/migrations/025_user_stories.sql
```

- [ ] **Step 1.3: Verify table and constraint exist**

```bash
psql "$DATABASE_URL" -c "\d user_stories" | head -20
psql "$DATABASE_URL" -c "\d tuleap_sync_config" | grep tracker_type
```
Expected: `user_stories` table with listed columns; `tuleap_sync_config` shows the updated CHECK constraint including `'user-story'`.

- [ ] **Step 1.4: Commit**

```bash
git add database/migrations/025_user_stories.sql
git commit -m "feat(db): add user_stories table and extend tracker_type constraint"
```

---

## Task 2: Add fixture to `tuleapPayloads.js`

**File:** `apps/api/__tests__/fixtures/tuleapPayloads.js`

- [ ] **Step 2.1: Append the user story fixture**

Open `apps/api/__tests__/fixtures/tuleapPayloads.js`. Find the `module.exports` line at the bottom and add `processedUserStoryData` to it.

First, add this constant before `module.exports`:

```js
/**
 * Processed user story data — shape sent by n8n to POST /tuleap-webhook/user-story
 */
const processedUserStoryData = {
  tuleap_artifact_id: 5001,
  tuleap_tracker_id:  6,
  title:              'As a user I can log in with SSO',
  description:        '## Overview\nAllow users to authenticate via SSO.',
  acceptance_criteria:'## AC\n- Given a valid SSO token, the user is logged in.',
  status:             'Draft',
  requirement_version:'1',
  priority:           'P2-High',
  ba_author:          'BA-Team',
  project_id:         null,
  raw_tuleap_payload: { id: 5001, tracker: { id: 6 } },
};
```

Then add `processedUserStoryData` to the `module.exports` object.

- [ ] **Step 2.2: Confirm the fixture file is syntactically valid**

```bash
node -e "require('./apps/api/__tests__/fixtures/tuleapPayloads'); console.log('OK')"
```
Expected: `OK`

---

## Task 3: Write failing tests for `POST /tuleap-webhook/user-story`

**File:** `apps/api/__tests__/tuleapWebhook.userStory.test.js`

- [ ] **Step 3.1: Create the test file**

```js
// apps/api/__tests__/tuleapWebhook.userStory.test.js
const { processedUserStoryData } = require('./fixtures/tuleapPayloads');

const mockQuery    = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));
jest.mock('../src/middleware/audit', () => ({ auditLog: mockAuditLog }));

const express     = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
  mockQuery.mockReset();
  mockAuditLog.mockReset();
});

// Helper: invoke the /user-story route handler directly (same pattern as bug tests)
function getHandler() {
  const layer = tuleapRouter.stack.find(
    l => l.route && l.route.path === '/user-story' && l.route.methods.post
  );
  expect(layer).toBeDefined();
  return layer.route.stack[0].handle;
}

function makeRes() {
  const res = { statusCode: 200 };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = jest.fn();
  return res;
}

describe('POST /tuleap-webhook/user-story', () => {
  test('creates a new user story when tuleap_artifact_id does not exist', async () => {
    const payload = { ...processedUserStoryData };

    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // logWebhook insert
      .mockResolvedValueOnce({ rows: [] })   // SELECT: no existing story
      .mockResolvedValueOnce({ rows: [{ id: 'new-us-uuid', title: payload.title, tuleap_artifact_id: payload.tuleap_artifact_id }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });  // logWebhook update

    const handler = getHandler();
    const res = makeRes();
    await handler({ body: payload }, res, jest.fn());

    expect(res.statusCode).toBe(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.action).toBe('created');
    expect(body.data.tuleap_artifact_id).toBe(payload.tuleap_artifact_id);
  });

  test('updates an existing user story when tuleap_artifact_id matches', async () => {
    const payload = { ...processedUserStoryData };

    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // logWebhook insert
      .mockResolvedValueOnce({ rows: [{ id: 'existing-us-uuid' }] }) // SELECT: found
      .mockResolvedValueOnce({ rows: [{ id: 'existing-us-uuid', title: payload.title, tuleap_artifact_id: payload.tuleap_artifact_id }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] });  // logWebhook update

    const handler = getHandler();
    const res = makeRes();
    await handler({ body: payload }, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.action).toBe('updated');
  });

  test('returns 400 when tuleap_artifact_id is missing', async () => {
    const handler = getHandler();
    const res = makeRes();
    await handler({ body: { title: 'Some story' } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    expect(res.json.mock.calls[0][0].error).toMatch(/tuleap_artifact_id.*title|title.*tuleap_artifact_id/i);
  });

  test('returns 400 when title is missing', async () => {
    const handler = getHandler();
    const res = makeRes();
    await handler({ body: { tuleap_artifact_id: 9999 } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('returns 500 on unexpected DB error', async () => {
    const payload = { ...processedUserStoryData };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // logWebhook insert
      .mockRejectedValueOnce(new Error('DB connection lost')); // SELECT throws

    const handler = getHandler();
    const res = makeRes();
    await handler({ body: payload }, res, jest.fn());

    expect(res.statusCode).toBe(500);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run tests — confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapWebhook.userStory.test.js --no-coverage 2>&1 | tail -10
```
Expected: `FAIL` — `getHandler()` assertion fails because the `/user-story` route doesn't exist yet.

---

## Task 4: Implement `POST /tuleap-webhook/user-story`

**File:** `apps/api/src/routes/tuleapWebhook.js`

- [ ] **Step 4.1: Find the insertion point**

The handler goes after the existing `POST /test-case` handler. Find the line:
```
// =====================================================
// POST /tuleap-webhook/task
```
(around line 565). Insert the new handler block immediately before it.

- [ ] **Step 4.2: Add the handler**

```js
// =====================================================
// POST /tuleap-webhook/user-story
// Receive processed User Story from n8n — upsert by tuleap_artifact_id
// =====================================================
router.post('/user-story', async (req, res) => {
    try {
        const {
            tuleap_artifact_id,
            title,
            description         = null,
            acceptance_criteria = null,
            status              = 'Draft',
            requirement_version = null,
            priority            = null,
            ba_author           = null,
            project_id          = null,
            raw_tuleap_payload  = null,
        } = req.body;

        if (!tuleap_artifact_id || !title) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_artifact_id and title are required',
            });
        }

        const payload_hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        await pool.query(
            `INSERT INTO tuleap_webhook_log
               (tuleap_artifact_id, artifact_type, action, payload_hash, raw_payload, processing_status)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tuleap_artifact_id, payload_hash) DO NOTHING`,
            [tuleap_artifact_id, 'user_story', 'sync', payload_hash, raw_tuleap_payload, 'received']
        );

        const existing = await pool.query(
            `SELECT id FROM user_stories WHERE tuleap_artifact_id = $1`,
            [tuleap_artifact_id]
        );
        const isUpdate = existing.rows.length > 0;

        let story;
        if (isUpdate) {
            const result = await pool.query(
                `UPDATE user_stories SET
                    title = $1, description = $2, acceptance_criteria = $3,
                    status = $4, requirement_version = $5, priority = $6,
                    ba_author = $7, raw_tuleap_payload = $8,
                    last_sync_at = NOW(), updated_at = NOW()
                 WHERE tuleap_artifact_id = $9
                 RETURNING *`,
                [title, description, acceptance_criteria, status,
                 requirement_version, priority, ba_author,
                 raw_tuleap_payload, tuleap_artifact_id]
            );
            story = result.rows[0];
        } else {
            const result = await pool.query(
                `INSERT INTO user_stories
                   (tuleap_artifact_id, title, description, acceptance_criteria,
                    status, requirement_version, priority, ba_author,
                    project_id, raw_tuleap_payload)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [tuleap_artifact_id, title, description, acceptance_criteria,
                 status, requirement_version, priority, ba_author,
                 project_id, raw_tuleap_payload]
            );
            story = result.rows[0];
        }

        await pool.query(
            `UPDATE tuleap_webhook_log SET
                processing_status = $1, processing_result = $2, processed_at = NOW()
             WHERE tuleap_artifact_id = $3 AND payload_hash = $4`,
            ['processed',
             `User story ${isUpdate ? 'updated' : 'created'}: ${story.id}`,
             tuleap_artifact_id, payload_hash]
        );

        return res.status(isUpdate ? 200 : 201).json({
            success: true,
            action: isUpdate ? 'updated' : 'created',
            data: story,
        });
    } catch (error) {
        console.error('Error processing user story webhook:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process user story webhook',
            message: error.message,
        });
    }
});
```

- [ ] **Step 4.3: Run tests — confirm they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapWebhook.userStory.test.js --no-coverage
```
Expected: all 5 tests PASS.

- [ ] **Step 4.4: Run the full tuleap webhook test suite — confirm no regressions**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapWebhook --no-coverage
```
Expected: all existing tests PASS (bug, bugOwnership, config, task).

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/routes/tuleapWebhook.js \
        apps/api/__tests__/tuleapWebhook.userStory.test.js \
        apps/api/__tests__/fixtures/tuleapPayloads.js
git commit -m "feat(tuleap): add POST /tuleap-webhook/user-story endpoint with upsert"
```

---

## Outcome

After this plan completes:
- `POST /tuleap-webhook/user-story` is live and accepts the shape produced by `tuleap-user-story-sync.json` and `tuleap-user-story-poll.json`
- The `user_stories` table stores synced User Stories keyed on `tuleap_artifact_id`
- The `tuleap_sync_config.tracker_type` constraint now includes `'user-story'`
- The n8n workflows from the previous plan (`tuleap-user-story-sync.json`, `tuleap-user-story-poll.json`) are now fully functional end-to-end
