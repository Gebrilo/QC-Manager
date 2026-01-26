# TestSprite Integration - Quick Start

**Status:** Integration code is ready, API server needs restart

---

## Current Situation

✅ **Completed:**
- TestSprite integration module created ([qc-app/apps/api/src/integrations/testsprite.js](qc-app/apps/api/src/integrations/testsprite.js))
- Webhook route created ([qc-app/apps/api/src/routes/testspriteWebhook.js](qc-app/apps/api/src/routes/testspriteWebhook.js))
- Route registered in main API ([qc-app/apps/api/src/index.js:21](qc-app/apps/api/src/index.js#L21))
- Upload script created ([scripts/testsprite-upload.js](scripts/testsprite-upload.js))
- Sample test data created ([test-testsprite-sample.json](test-testsprite-sample.json))
- Quick test script created ([quick-test-testsprite.js](quick-test-testsprite.js))
- Comprehensive docs created ([docs/TESTSPRITE_INTEGRATION.md](docs/TESTSPRITE_INTEGRATION.md))

⚠️ **Issue:**
- API server is running but with old code (before TestSprite routes were added)
- API server needs to be restarted to load new routes

---

## Step 1: Restart API Server

The API server is currently running on port 3001 (PID 29616). You need to restart it.

### Option A: Stop and Restart (Recommended)

```bash
# Open a new terminal/command prompt
cd "d:\Claude\QC management tool\qc-app\apps\api"

# Stop the current server (Ctrl+C in the terminal where it's running)
# OR kill it with:
taskkill /PID 29616 /F

# Start fresh
npm start
```

### Option B: Use Nodemon (Auto-restart on file changes)

```bash
cd "d:\Claude\QC management tool\qc-app\apps\api"

# Check if nodemon is available
npm list nodemon

# Start with nodemon
npx nodemon src/index.js
```

**Expected Output:**
```
API Server running on port 3001
```

---

## Step 2: Verify Integration Works

Once the API server is restarted, run the quick test:

```bash
cd "d:\Claude\QC management tool"
node quick-test-testsprite.js
```

**Expected Output:**
```
TestSprite Integration Quick Test
=================================

Test 1: Checking API health...
✓ API server is running

Test 2: Checking TestSprite integration status...
✓ TestSprite webhook endpoint is available
  Integration: TestSprite MCP
  Version: 1.0.0
  Webhook URL: /testsprite/webhook
  Supported formats:
    - TestSprite MCP results
    - Jest format
    - Mocha format
    - Generic test results

Test 3: Testing webhook with sample payload...
✓ Webhook endpoint is working (project validation triggered)
  This is expected - you need a valid project_id to upload results

Test 4: Checking for sample TestSprite results file...
✓ Sample file exists: D:\Claude\QC management tool\test-testsprite-sample.json
  Contains 5 test results

Test 5: Checking upload script...
✓ Upload script exists: D:\Claude\QC management tool\scripts\testsprite-upload.js

Test Summary
============

✓ api Health
✓ integration Status
✓ webhook Endpoint
✓ sample File
✓ upload Script

Passed: 5/5

🎉 All tests passed! TestSprite integration is ready.
```

---

## Step 3: Get a Project ID

You need a valid project UUID to upload test results. Check your database:

```bash
# If you have psql installed:
psql -U qc_user -d qc_management -c "SELECT id, name FROM project LIMIT 5;"

# Or use a database GUI tool to query:
SELECT id, name FROM project LIMIT 5;
```

**Example Output:**
```
                  id                  |    name
--------------------------------------+--------------
abc123-uuid-here-1234-567890abcdef   | My Project
def456-uuid-here-5678-901234abcdef   | Another Project
```

---

## Step 4: Upload Sample Test Results

Once you have a project ID, upload the sample TestSprite results:

```bash
cd "d:\Claude\QC management tool"

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

Upload Batch ID: some-uuid-here

View results at:
  http://localhost:3000/test-results?project_id=YOUR-PROJECT-UUID
```

---

## Step 5: View Results in Dashboard

Open your web browser and navigate to:

```
http://localhost:3000/test-results?project_id=YOUR-PROJECT-UUID
```

You should see:
- 5 test results (TS-001 through TS-005)
- Status badges (🟢 Passed, 🔴 Failed, 🟡 Blocked, ⚪ Not Run)
- Tester name: "TestSprite AI"
- Execution date: 2026-01-21

---

## Test Data Breakdown

The sample file ([test-testsprite-sample.json](test-testsprite-sample.json)) contains:

| Test ID | Test Name                      | Status  | Notes |
|---------|--------------------------------|---------|-------|
| TS-001  | User login with valid credentials | passed  | Duration: 145ms |
| TS-002  | Dashboard loads within 3 seconds  | failed  | Timeout: 5 seconds |
| TS-003  | User profile update            | passed  | Duration: 89ms |
| TS-004  | Password reset flow            | blocked | SMTP not configured |
| TS-005  | API rate limiting              | pending | Mapped to not_run |

**Expected Metrics:**
- Total test cases: 5
- Passed: 2 (40%)
- Failed: 1 (20%)
- Blocked: 1 (20%)
- Not Run: 1 (20%)

---

## Alternative: Use Webhook Directly

Instead of the upload script, you can POST directly to the webhook:

```bash
curl -X POST http://localhost:3001/testsprite/webhook \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "project_id": "YOUR-PROJECT-UUID",
  "results": {
    "tests": [
      {
        "id": "CURL-001",
        "name": "Test via curl",
        "title": "Manual webhook test",
        "status": "passed",
        "timestamp": "2026-01-21"
      }
    ]
  }
}
EOF
```

---

## Troubleshooting

### Issue: "Cannot POST /testsprite/webhook"

**Cause:** API server not restarted after adding new routes

**Fix:** Restart API server (see Step 1)

### Issue: "project_id not found"

**Cause:** Invalid or non-existent project UUID

**Fix:** Use a valid project ID from your database

### Issue: Quick test shows "API server not accessible"

**Cause:** API server not running

**Fix:**
```bash
cd "d:\Claude\QC management tool\qc-app\apps\api"
npm start
```

### Issue: Results not showing in dashboard

**Causes:**
1. Database migration not applied
2. Wrong project ID
3. Frontend not running

**Fixes:**
```bash
# 1. Apply migration
psql -U qc_user -d qc_management -f "database/migrations/002_simplified_test_results.sql"

# 2. Verify project ID
psql -U qc_user -d qc_management -c "SELECT id, name FROM project;"

# 3. Start frontend
cd "d:\Claude\QC management tool\qc-app\apps\web"
npm run dev
```

---

## Next Steps After Testing

Once testing is complete:

1. **Configure TestSprite MCP** to automatically POST results to the webhook
2. **Set up CI/CD** integration using the upload script
3. **Monitor quality metrics** in the dashboard
4. **Review documentation** at [docs/TESTSPRITE_INTEGRATION.md](docs/TESTSPRITE_INTEGRATION.md)

---

## Files Created for TestSprite Integration

### Backend Files:
- [qc-app/apps/api/src/integrations/testsprite.js](qc-app/apps/api/src/integrations/testsprite.js) - Core integration module
- [qc-app/apps/api/src/routes/testspriteWebhook.js](qc-app/apps/api/src/routes/testspriteWebhook.js) - Webhook routes
- [qc-app/apps/api/.env.testsprite.example](qc-app/apps/api/.env.testsprite.example) - Configuration template

### Scripts:
- [scripts/testsprite-upload.js](scripts/testsprite-upload.js) - CLI upload tool
- [quick-test-testsprite.js](quick-test-testsprite.js) - Quick integration test

### Test Data:
- [test-testsprite-sample.json](test-testsprite-sample.json) - Sample TestSprite results

### Documentation:
- [docs/TESTSPRITE_INTEGRATION.md](docs/TESTSPRITE_INTEGRATION.md) - Complete integration guide (~650 lines)
- [TESTSPRITE_INTEGRATION_SUMMARY.md](TESTSPRITE_INTEGRATION_SUMMARY.md) - Quick reference
- [TESTSPRITE_TESTING_GUIDE.md](TESTSPRITE_TESTING_GUIDE.md) - Detailed testing guide
- This file - Quick start guide

---

## Integration Architecture

```
TestSprite MCP (IDE)
        ↓
AI Generates Tests
        ↓
Test Execution
        ↓
Test Results (JSON)
        ↓
    ┌───────┴───────┐
    │               │
Webhook         Script
    │               │
    └───────┬───────┘
            ↓
POST /testsprite/webhook
            ↓
Parse & Validate
            ↓
test_result Table
            ↓
Quality Metrics
            ↓
Dashboard
```

---

## Summary

**Current Status:** Ready to test after API restart

**What to do now:**
1. ✅ Restart API server
2. ✅ Run `node quick-test-testsprite.js`
3. ✅ Get a project ID from database
4. ✅ Upload sample results
5. ✅ View in dashboard

**All code is complete and ready!** Just restart the API server and start testing.

---

*Created: 2026-01-21*
*TestSprite Integration Version: 1.0.0*
