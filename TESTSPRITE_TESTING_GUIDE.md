# TestSprite Integration Testing Guide

**Date:** 2026-01-21
**Purpose:** Test the TestSprite MCP integration with the QC Management Tool

---

## Prerequisites

1. **Database Migration Applied**
   ```bash
   psql -U qc_user -d qc_management -f "database/migrations/002_simplified_test_results.sql"
   ```

2. **Sample Project Created**
   - You need at least one project in the database to test with
   - Get the project UUID from: `SELECT id, name FROM project;`

3. **API Server Running**
   ```bash
   cd "d:\Claude\QC management tool\qc-app\apps\api"
   npm start
   ```
   Server should be running on: http://localhost:3001

---

## Test 1: Check Integration Status

Verify the TestSprite webhook endpoint is available.

**Command:**
```bash
curl http://localhost:3001/testsprite/status
```

**Expected Response:**
```json
{
  "status": "ok",
  "integration": "TestSprite MCP",
  "version": "1.0.0",
  "webhook_url": "/testsprite/webhook",
  "supported_formats": [
    "TestSprite MCP results",
    "Jest format",
    "Mocha format",
    "Generic test results"
  ]
}
```

**✅ Pass Criteria:** Status returns 200 OK with expected JSON

---

## Test 2: Upload Sample TestSprite Results via Webhook

Test the webhook endpoint with sample TestSprite test results.

**Sample File:** `test-testsprite-sample.json` (already created)

**Command:**
```bash
# Replace YOUR-PROJECT-UUID with an actual project ID from your database
curl -X POST http://localhost:3001/testsprite/webhook \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"YOUR-PROJECT-UUID\",
    \"results\": {
      \"tests\": [
        {
          \"id\": \"TS-001\",
          \"name\": \"User login with valid credentials\",
          \"title\": \"Login Test - Valid Credentials\",
          \"status\": \"passed\",
          \"duration\": 145,
          \"timestamp\": \"2026-01-21\"
        },
        {
          \"id\": \"TS-002\",
          \"name\": \"Dashboard loads within 3 seconds\",
          \"title\": \"Performance Test - Dashboard Load\",
          \"status\": \"failed\",
          \"error\": \"Timeout: Dashboard took 5 seconds to load\",
          \"duration\": 5000,
          \"timestamp\": \"2026-01-21\"
        },
        {
          \"id\": \"TS-003\",
          \"name\": \"User profile update\",
          \"title\": \"User Profile Update Test\",
          \"status\": \"passed\",
          \"duration\": 89,
          \"timestamp\": \"2026-01-21\"
        }
      ]
    }
  }"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "TestSprite results uploaded successfully",
  "upload_batch_id": "some-uuid",
  "summary": {
    "total": 3,
    "imported": 3,
    "updated": 0,
    "errors": 0,
    "success_rate": "100.00%"
  },
  "details": {
    "success": [
      { "test_case_id": "TS-001", "status": "passed" },
      { "test_case_id": "TS-002", "status": "failed" },
      { "test_case_id": "TS-003", "status": "passed" }
    ],
    "updated": [],
    "errors": []
  }
}
```

**✅ Pass Criteria:**
- Response status 200
- `summary.imported` = 3
- `summary.errors` = 0
- `success_rate` = "100.00%"

---

## Test 3: Upload Using CLI Script

Test the manual upload script for CI/CD scenarios.

**Command:**
```bash
# Replace YOUR-PROJECT-UUID with actual project ID
node scripts/testsprite-upload.js YOUR-PROJECT-UUID test-testsprite-sample.json
```

**Expected Output:**
```
TestSprite Results Upload
=========================

Project ID: YOUR-PROJECT-UUID
Results File: test-testsprite-sample.json
API URL: http://localhost:3001

Reading results file...
Uploading results...

✓ Upload successful!

Summary:
  Total: 5
  Imported: 5
  Updated: 0
  Errors: 0
  Success Rate: 100.00%

Upload Batch ID: some-uuid

View results at:
  http://localhost:3000/test-results?project_id=YOUR-PROJECT-UUID
```

**✅ Pass Criteria:**
- Exit code 0
- All results imported successfully
- Success rate 100%

---

## Test 4: Verify Status Mapping

Test that TestSprite statuses map correctly to QC Tool statuses.

**Test Data:**
```json
{
  "tests": [
    { "id": "MAP-1", "status": "passed", "name": "Should map to passed" },
    { "id": "MAP-2", "status": "pass", "name": "Should map to passed" },
    { "id": "MAP-3", "status": "success", "name": "Should map to passed" },
    { "id": "MAP-4", "status": "failed", "name": "Should map to failed" },
    { "id": "MAP-5", "status": "fail", "name": "Should map to failed" },
    { "id": "MAP-6", "status": "error", "name": "Should map to failed" },
    { "id": "MAP-7", "status": "skipped", "name": "Should map to not_run" },
    { "id": "MAP-8", "status": "pending", "name": "Should map to not_run" },
    { "id": "MAP-9", "status": "blocked", "name": "Should map to blocked" }
  ]
}
```

**Command:**
```bash
# Create test file
cat > status-mapping-test.json << 'EOF'
{
  "tests": [
    { "id": "MAP-1", "status": "passed", "name": "Should map to passed" },
    { "id": "MAP-2", "status": "pass", "name": "Should map to passed" },
    { "id": "MAP-3", "status": "success", "name": "Should map to passed" },
    { "id": "MAP-4", "status": "failed", "name": "Should map to failed" },
    { "id": "MAP-5", "status": "fail", "name": "Should map to failed" },
    { "id": "MAP-6", "status": "error", "name": "Should map to failed" },
    { "id": "MAP-7", "status": "skipped", "name": "Should map to not_run" },
    { "id": "MAP-8", "status": "pending", "name": "Should map to not_run" },
    { "id": "MAP-9", "status": "blocked", "name": "Should map to blocked" }
  ]
}
EOF

# Upload
node scripts/testsprite-upload.js YOUR-PROJECT-UUID status-mapping-test.json
```

**Verify in Database:**
```sql
SELECT test_case_id, status
FROM test_result
WHERE test_case_id LIKE 'MAP-%'
ORDER BY test_case_id;
```

**Expected Results:**
| test_case_id | status   |
|--------------|----------|
| MAP-1        | passed   |
| MAP-2        | passed   |
| MAP-3        | passed   |
| MAP-4        | failed   |
| MAP-5        | failed   |
| MAP-6        | failed   |
| MAP-7        | not_run  |
| MAP-8        | not_run  |
| MAP-9        | blocked  |

**✅ Pass Criteria:** All statuses mapped correctly

---

## Test 5: Verify Duplicate Handling

Test that uploading the same test on the same date updates instead of duplicating.

**Step 1: Initial Upload**
```bash
node scripts/testsprite-upload.js YOUR-PROJECT-UUID test-testsprite-sample.json
```
Note the response: `imported: 5`

**Step 2: Re-upload Same Results**
```bash
node scripts/testsprite-upload.js YOUR-PROJECT-UUID test-testsprite-sample.json
```

**Expected Response:**
```
Summary:
  Total: 5
  Imported: 0
  Updated: 5
  Errors: 0
  Success Rate: 100.00%
```

**Verify in Database:**
```sql
SELECT test_case_id, COUNT(*)
FROM test_result
WHERE test_case_id LIKE 'TS-%'
  AND executed_at = '2026-01-21'
  AND deleted_at IS NULL
GROUP BY test_case_id;
```

**Expected:** Each test_case_id should have COUNT = 1 (no duplicates)

**✅ Pass Criteria:**
- Second upload shows `updated: 5, imported: 0`
- No duplicate records in database

---

## Test 6: Verify Quality Metrics

Test that uploaded results appear in quality metrics dashboard.

**Database Query:**
```sql
SELECT
  project_name,
  total_test_cases,
  latest_passed_count,
  latest_failed_count,
  latest_pass_rate_pct,
  latest_not_run_pct,
  test_coverage_pct
FROM v_project_quality_metrics
WHERE project_id = 'YOUR-PROJECT-UUID';
```

**Expected Results:** (based on sample data)
- total_test_cases: 5
- latest_passed_count: 2 (TS-001, TS-003)
- latest_failed_count: 1 (TS-002)
- latest_pass_rate_pct: ~40% (2 passed out of 5)
- latest_not_run_pct: ~20% (TS-005 pending)

**API Endpoint Test:**
```bash
curl http://localhost:3001/test-results/project/YOUR-PROJECT-UUID/metrics
```

**✅ Pass Criteria:**
- Metrics match uploaded test results
- Pass rate calculates correctly

---

## Test 7: Verify Audit Log

Test that uploads are logged in audit_log.

**Database Query:**
```sql
SELECT
  action,
  entity_type,
  entity_id as upload_batch_id,
  details,
  created_at
FROM audit_log
WHERE action = 'testsprite_results_uploaded'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- Records exist for each upload
- `details` JSON contains project_id, total, success/updated/errors counts
- `source: 'TestSprite MCP'` in details

**✅ Pass Criteria:** Audit records exist with correct details

---

## Test 8: Test Suite Format

TestSprite can return results in suite format. Test that it parses correctly.

**Test Data:**
```json
{
  "suites": [
    {
      "name": "Authentication Suite",
      "tests": [
        { "id": "auth-1", "title": "Login", "status": "passed" },
        { "id": "auth-2", "title": "Logout", "status": "passed" }
      ]
    },
    {
      "name": "Dashboard Suite",
      "tests": [
        { "id": "dash-1", "title": "Load time", "status": "failed" }
      ]
    }
  ]
}
```

**Command:**
```bash
# Create suite format test file
cat > suite-format-test.json << 'EOF'
{
  "suites": [
    {
      "name": "Authentication Suite",
      "tests": [
        { "id": "auth-1", "title": "Login", "status": "passed" },
        { "id": "auth-2", "title": "Logout", "status": "passed" }
      ]
    },
    {
      "name": "Dashboard Suite",
      "tests": [
        { "id": "dash-1", "title": "Load time", "status": "failed" }
      ]
    }
  ]
}
EOF

node scripts/testsprite-upload.js YOUR-PROJECT-UUID suite-format-test.json
```

**Expected:** 3 tests imported with suite name prefixed to test_case_title

**Verify:**
```sql
SELECT test_case_id, test_case_title
FROM test_result
WHERE test_case_id LIKE 'Authentication Suite-%'
   OR test_case_id LIKE 'Dashboard Suite-%';
```

**✅ Pass Criteria:** Suite-based results parse and upload correctly

---

## Test 9: View Results in Frontend

Test that uploaded results display in the web interface.

**Steps:**
1. Start frontend: `cd qc-app/apps/web && npm run dev`
2. Open browser: http://localhost:3000/test-results
3. Filter by project: Select your test project
4. Verify uploaded tests appear

**Expected:**
- All 5 sample tests (TS-001 through TS-005) visible
- Status badges show correct colors:
  - 🟢 Green for "passed"
  - 🔴 Red for "failed"
  - 🟡 Yellow for "blocked"
  - ⚪ Gray for "not_run"
- Tester name shows "TestSprite AI"

**✅ Pass Criteria:** All results visible with correct formatting

---

## Test 10: View Quality Dashboard

Test the quality metrics dashboard display.

**Steps:**
1. Navigate to: http://localhost:3000/projects/YOUR-PROJECT-UUID/quality
2. View metrics widget and trend chart

**Expected Dashboard Elements:**
- Health status badge (based on pass rate)
- Pass rate percentage
- Total test cases count
- Latest execution date
- Status breakdown (passed/failed/not run counts)
- Trend chart showing execution history

**✅ Pass Criteria:** Dashboard displays all metrics correctly

---

## Common Issues & Troubleshooting

### Issue 1: "Cannot GET /testsprite/status"
**Cause:** API server not running
**Fix:**
```bash
cd "d:\Claude\QC management tool\qc-app\apps\api"
npm start
```

### Issue 2: "project_id is required"
**Cause:** Missing or invalid project_id in webhook payload
**Fix:** Verify project exists in database:
```sql
SELECT id, name FROM project;
```

### Issue 3: Upload script fails with connection error
**Cause:** API server not accessible
**Fix:** Check API is running:
```bash
curl http://localhost:3001/health
```

### Issue 4: Results not showing in dashboard
**Cause:** Possible issues:
1. Wrong project_id
2. Migration not applied
3. Results soft-deleted

**Fix:**
```sql
-- Check results exist
SELECT * FROM test_result WHERE project_id = 'YOUR-UUID';

-- Check if soft-deleted
SELECT * FROM test_result WHERE project_id = 'YOUR-UUID' AND deleted_at IS NOT NULL;
```

---

## Test Results Checklist

Use this checklist to track your testing progress:

- [ ] Test 1: Integration status endpoint works
- [ ] Test 2: Webhook accepts and processes results
- [ ] Test 3: CLI upload script works
- [ ] Test 4: Status mapping works correctly
- [ ] Test 5: Duplicate handling prevents duplicates
- [ ] Test 6: Quality metrics calculate correctly
- [ ] Test 7: Audit log records uploads
- [ ] Test 8: Suite format parsing works
- [ ] Test 9: Results display in frontend
- [ ] Test 10: Quality dashboard shows metrics

---

## Quick Start Testing (Fastest Path)

If you want to quickly verify everything works:

```bash
# 1. Get a project ID
psql -U qc_user -d qc_management -c "SELECT id, name FROM project LIMIT 1;"

# 2. Start API server
cd "d:\Claude\QC management tool\qc-app\apps\api"
npm start &

# 3. Test status endpoint
curl http://localhost:3001/testsprite/status

# 4. Upload sample results (replace YOUR-PROJECT-UUID)
node scripts/testsprite-upload.js YOUR-PROJECT-UUID test-testsprite-sample.json

# 5. Check results
psql -U qc_user -d qc_management -c "SELECT test_case_id, status FROM test_result WHERE tester_name = 'TestSprite AI' ORDER BY created_at DESC LIMIT 10;"

# 6. Open dashboard
start http://localhost:3000/test-results
```

---

## Next Steps After Testing

Once all tests pass:

1. **Configure for Production**
   - Copy `.env.testsprite.example` to `.env.testsprite`
   - Set your TestSprite API key
   - Configure webhook URL for TestSprite

2. **Set Up Automated Testing**
   - Configure TestSprite to automatically POST to webhook
   - Set up CI/CD pipeline integration
   - Monitor audit logs for automated uploads

3. **Monitor Quality Metrics**
   - Review dashboard regularly
   - Set up alerts for low pass rates
   - Track trends over time

---

**Testing Status:** Ready to begin testing
**Documentation:** See [TESTSPRITE_INTEGRATION.md](docs/TESTSPRITE_INTEGRATION.md) for detailed integration guide
