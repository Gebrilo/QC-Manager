# Execution Date Field on Test Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users specify a past execution date when uploading test results so the Governance trend chart plots data on the correct day.

**Architecture:** Two-file change — backend validates and conditionally includes `started_at` in the INSERT; frontend adds a controlled date input and passes the value at submission time. No DB schema changes needed (`started_at` column already exists).

**Tech Stack:** Node.js/Express (API), Next.js/React (frontend), Jest (API tests), PostgreSQL

---

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `apps/api/src/routes/testExecutions.js` | Accept + validate `execution_date`, two-variant INSERT |
| Create | `apps/api/__tests__/testExecutions.upload.test.js` | Jest tests for date validation logic |
| Modify | `apps/web/app/test-executions/page.tsx` | Add `executionDate` state, date input, FormData field, form reset |

---

## Task 1: Backend — Accept and validate `execution_date`

**Files:**
- Modify: `apps/api/src/routes/testExecutions.js:848–885`
- Create: `apps/api/__tests__/testExecutions.upload.test.js`

### Step 1: Write the failing tests

Create `apps/api/__tests__/testExecutions.upload.test.js`:

```javascript
/**
 * Jest tests for POST /test-executions/upload-excel — execution_date field
 */

jest.mock('../src/config/db', () => ({ pool: { connect: jest.fn() } }));

// We test the validation logic in isolation, not the full route
// Extract the validation helper we'll add in the next step
let validateExecutionDate;

beforeAll(() => {
  // Will be imported after implementation
  ({ validateExecutionDate } = require('../src/routes/testExecutions'));
});

describe('validateExecutionDate', () => {
  const today = new Date().toISOString().split('T')[0];

  test('returns null for undefined input (no date provided)', () => {
    expect(validateExecutionDate(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(validateExecutionDate('')).toBeNull();
  });

  test('returns the date string for a valid past date', () => {
    expect(validateExecutionDate('2026-01-15')).toBe('2026-01-15');
  });

  test('returns the date string for today', () => {
    expect(validateExecutionDate(today)).toBe(today);
  });

  test('throws for a future date', () => {
    expect(() => validateExecutionDate('2099-12-31')).toThrow(
      'Execution date cannot be in the future'
    );
  });

  test('returns null for an invalid format (not YYYY-MM-DD)', () => {
    expect(validateExecutionDate('15/01/2026')).toBeNull();
  });

  test('returns null for a non-date string that fails the regex', () => {
    // strings that don't match YYYY-MM-DD pattern are treated as missing
    expect(validateExecutionDate('not-a-date')).toBeNull();
  });
});
```

- [ ] Save the file above.

### Step 2: Run tests — expect FAIL (module not exported yet)

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/testExecutions.upload.test.js --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module` or `validateExecutionDate is not a function` — confirms tests are wired correctly and implementation is missing.

### Step 3: Add `validateExecutionDate` to the route file and update the INSERT

In `apps/api/src/routes/testExecutions.js`, make these two changes:

**A) Add the exported helper** just before the `// EXCEL UPLOAD` comment block (around line 835):

```javascript
// Exported for testing
function validateExecutionDate(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const today = new Date().toISOString().split('T')[0];
  if (value > today) {
    throw new Error('Execution date cannot be in the future');
  }
  return value;
}
```

The file ends with `module.exports = router;` (confirmed at the last line). Replace that final line with:

```javascript
module.exports = router;
module.exports.validateExecutionDate = validateExecutionDate;
```

**B) Update the `upload-excel` handler** — replace the `const { project_id, test_run_name } = req.body;` block and the `testRunResult` INSERT (lines 848–885) with:

```javascript
const { project_id, test_run_name, execution_date: rawDate } = req.body;
if (!project_id) {
  return res.status(400).json({ error: 'project_id is required' });
}

// Validate execution_date if provided
let validatedDate;
try {
  validatedDate = validateExecutionDate(rawDate);
} catch (err) {
  return res.status(400).json({ error: err.message });
}

// ... (keep existing XLSX parse and BEGIN logic unchanged) ...

const testRunResult = await client.query(
  validatedDate
    ? `INSERT INTO test_run (run_id, name, description, project_id, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
       RETURNING *`
    : `INSERT INTO test_run (run_id, name, description, project_id, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
  validatedDate
    ? [runId, test_run_name || `Excel Import - ${validatedDate}`, `Imported from file: ${req.file.originalname}`, project_id, 'completed', validatedDate]
    : [runId, test_run_name || `Excel Import - ${new Date().toISOString().split('T')[0]}`, `Imported from file: ${req.file.originalname}`, project_id, 'completed']
);
```

- [ ] Save changes to `testExecutions.js`.

### Step 4: Run tests — expect PASS

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/testExecutions.upload.test.js --no-coverage 2>&1 | tail -20
```

Expected output:
```
PASS __tests__/testExecutions.upload.test.js
  validateExecutionDate
    ✓ returns null for undefined input
    ✓ returns null for empty string
    ✓ returns the date string for a valid past date
    ✓ returns the date string for today
    ✓ throws for a future date
    ✓ returns null for an invalid format (not YYYY-MM-DD)
    ✓ returns null for a non-date string that fails the regex

Test Suites: 1 passed
Tests:       7 passed
```

### Step 5: Run existing tests to check for regressions

```bash
cd /root/QC-Manager/apps/api && npx jest --no-coverage 2>&1 | tail -15
```

Expected: all pre-existing suites still pass.

### Step 6: Commit

```bash
cd /root/QC-Manager && git add apps/api/src/routes/testExecutions.js apps/api/__tests__/testExecutions.upload.test.js
git commit -m "$(cat <<'EOF'
feat: accept execution_date on test-results upload

Validates YYYY-MM-DD format, rejects future dates (HTTP 400).
Uses two distinct INSERT variants so DB default fires when omitted.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend — Execution date picker

**Files:**
- Modify: `apps/web/app/test-executions/page.tsx`

### Step 1: Add `executionDate` state

Find the block of `useState` declarations near the top of `TestExecutionsPage` (around line 69). After:

```typescript
const [testRunName, setTestRunName] = useState('');
```

Add:

```typescript
const [executionDate, setExecutionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
);
```

- [ ] Save the change.

### Step 2: Add `execution_date` to the FormData in `handleUpload`

In `handleUpload` (around line 204–209), the existing FormData block is:

```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('project_id', selectedProject);
if (testRunName) {
    formData.append('test_run_name', testRunName);
}
```

Replace with:

```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('project_id', selectedProject);
formData.append('execution_date', executionDate);
if (testRunName) {
    formData.append('test_run_name', testRunName);
}
```

- [ ] Save the change.

### Step 3: Reset `executionDate` after successful upload

In `handleUpload`, the form-clear block after a successful upload (around line 236–239) is:

```typescript
// Clear form
setFile(null);
setTestRunName('');
if (fileInputRef.current) fileInputRef.current.value = '';
```

Replace with:

```typescript
// Clear form
setFile(null);
setTestRunName('');
setExecutionDate(new Date().toISOString().split('T')[0]);
if (fileInputRef.current) fileInputRef.current.value = '';
```

- [ ] Save the change.

### Step 4: Add the date input field to the JSX

In the JSX, locate the **Test Run Name** block (around line 380–392):

```tsx
{/* Test Run Name */}
<div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        Test Run Name <span className="text-slate-400">(Optional)</span>
    </label>
    <input
        type="text"
        value={testRunName}
        ...
    />
</div>
```

Insert the following **after** that block and **before** the `{/* File Upload - Drag & Drop */}` comment:

```tsx
{/* Execution Date */}
<div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        Execution Date <span className="text-slate-400">(When tests were run)</span>
    </label>
    <input
        type="date"
        value={executionDate}
        max={new Date().toISOString().split('T')[0]}
        onChange={(e) => setExecutionDate(e.target.value)}
        className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm hover:border-indigo-300"
    />
</div>
```

- [ ] Save the change.

### Step 5: Manual verification checklist

Build and smoke-test locally (or deploy and test on staging):

```bash
cd /root/QC-Manager && docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.gebrils.cloud \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.gebrils.cloud \
  --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep ANON_KEY /opt/supabase/.env | cut -d= -f2)" \
  -t agebril/qc-web:latest ./apps/web 2>&1 | tail -5
```

Expected: `DONE` with no TypeScript errors.

UI checks:
- [ ] "Execution Date" field appears between "Test Run Name" and the file drop zone
- [ ] Field defaults to today's date
- [ ] Cannot select a future date (browser enforces `max`)
- [ ] Upload with today's date → test run `started_at` equals today → appears on today in the trend chart
- [ ] Upload with a past date (e.g., 2026-03-15) → `started_at` = 2026-03-15 → trend chart shows data on that day
- [ ] After successful upload, date field resets to today

Verify in the DB after a past-date upload:

```bash
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT run_id, name, started_at::date AS execution_date
FROM test_run
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 3;
"
```

Expected: `started_at::date` shows the date you selected, not today.

### Step 6: Commit

```bash
cd /root/QC-Manager && git add apps/web/app/test-executions/page.tsx
git commit -m "$(cat <<'EOF'
feat: add execution date picker to test results upload form

Defaults to today; lets users backdate uploads for historical data.
Resets to today after successful upload.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Deploy

### Step 1: Push web image and recreate container

```bash
source /root/.qc-deploy-secrets && \
docker login -u "${DOCKER_HUB_USERNAME}" -p "${DOCKER_HUB_TOKEN}" && \
docker push agebril/qc-web:latest && \
docker compose -f /opt/qc-manager/docker-compose.prod.yml pull web && \
docker compose -f /opt/qc-manager/docker-compose.prod.yml up -d --force-recreate web
```

### Step 2: Restart API container to pick up backend changes

The API image is built from `/root/QC-Manager/apps/api`. The change is in-repo JS — use the hotpatch approach (no full image rebuild needed):

```bash
docker cp /root/QC-Manager/apps/api/src/routes/testExecutions.js qc-api:/app/src/routes/testExecutions.js
docker restart qc-api
```

### Step 3: Health check and smoke test

```bash
curl -s https://api.gebrils.cloud/health && \
curl -s -o /dev/null -w "Web: %{http_code}\n" https://gebrils.cloud
```

Expected: `{"status":"ok",...}` and `Web: 200`.

Confirm the future-date validation is live (no auth token needed — the validation fires before auth on a multipart request that is missing auth):

```bash
curl -s -X POST https://api.gebrils.cloud/test-executions/upload-excel \
  -F "project_id=test" \
  -F "execution_date=2099-01-01" \
  -F "file=@/dev/null;type=text/csv" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unexpected response'))"
```

Expected output: `Execution date cannot be in the future`

> Note: this may return a 401 (auth required) instead — that is also acceptable; it means the request reached the API and auth fired before validation. The 400 with the exact error message is the definitive check after authenticating.
