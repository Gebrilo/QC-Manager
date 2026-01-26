# Testing Guide - Simplified Test Results System

## Quick Start Testing

### Step 1: Apply Database Migration

```bash
# Navigate to project root
cd "d:\Claude\QC management tool"

# Connect to PostgreSQL
psql -U qc_user -d qc_management

# Run migration
\i database/migrations/002_simplified_test_results.sql

# Verify tables
\dt test_result
\dv v_*

# Check sample data
SELECT * FROM test_result;
SELECT * FROM v_project_quality_metrics;

# Exit psql
\q
```

### Step 2: Start the Backend API

```bash
cd "d:\Claude\QC management tool\qc-app\apps\api"

# Install dependencies (if not already installed)
npm install

# Start server
npm start

# Should see: "API Server running on port 3001"
```

### Step 3: Start the Frontend

Open a new terminal:

```bash
cd "d:\Claude\QC management tool\qc-app\apps\web"

# Install dependencies (if not already installed)
npm install

# Start dev server
npm run dev

# Should see: "Ready on http://localhost:3000"
```

### Step 4: Create a Sample CSV File

Create a file named `test_results_sample.csv`:

```csv
test_case_id,status,test_case_title,notes,tester_name
TC-001,passed,User login with valid credentials,All checks passed,John Doe
TC-002,passed,User logout functionality,Session cleared successfully,John Doe
TC-003,failed,Dashboard load performance,Load time exceeded 3 seconds,Jane Smith
TC-004,passed,Profile page rendering,All elements displayed,Jane Smith
TC-005,not_run,Payment gateway integration,Deferred to next sprint,John Doe
TC-006,blocked,API security test,Waiting for security team,Jane Smith
TC-007,passed,Search functionality,Results accurate,John Doe
TC-008,passed,Filter functionality,Filters working correctly,Jane Smith
TC-009,failed,Export to PDF,File corruption issue,John Doe
TC-010,passed,Email notifications,Emails sent successfully,Jane Smith
```

Save this file to your desktop or a convenient location.

### Step 5: Upload Test Results

1. Open browser: http://localhost:3000/test-results/upload

2. Select a project from the dropdown (e.g., "Q1 Quality Audit")

3. Click "Choose File" and select your `test_results_sample.csv`

4. Click "Upload Test Results"

5. You should see a success summary showing:
   - Total: 10
   - Imported: 10
   - Updated: 0
   - Errors: 0
   - Success Rate: 100%

### Step 6: View Test Results

1. Click "View Test Results" button

2. You should see a table with all 10 test results

3. Try filtering:
   - Status: "Passed" → Should show 7 results
   - Status: "Failed" → Should show 2 results
   - Status: "Blocked" → Should show 1 result

### Step 7: View Quality Metrics

1. Go to: http://localhost:3000/projects

2. Click on the project you uploaded results to

3. You should see the project page with tasks

4. To view quality metrics, go to:
   http://localhost:3000/projects/{PROJECT_ID}/quality

   Replace {PROJECT_ID} with the actual UUID from the URL

5. You should see:
   - **Pass Rate**: 70% (7 passed / 10 total)
   - **Fail Rate**: 20% (2 failed / 10 total)
   - **Not Run**: 10% (1 not run / 10 total)
   - Status breakdown with color-coded badges
   - Test coverage metrics

---

## API Testing with cURL

### 1. Upload Test Results

```bash
curl -X POST http://localhost:3001/test-results/upload \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "YOUR_PROJECT_UUID",
    "results": [
      {
        "test_case_id": "TC-001",
        "status": "passed",
        "test_case_title": "Login test",
        "notes": "All checks OK"
      },
      {
        "test_case_id": "TC-002",
        "status": "failed",
        "test_case_title": "Dashboard test",
        "notes": "Timeout issue"
      }
    ]
  }'
```

### 2. Get Test Results

```bash
# All results for a project
curl "http://localhost:3001/test-results?project_id=YOUR_PROJECT_UUID"

# Latest results only
curl "http://localhost:3001/test-results?project_id=YOUR_PROJECT_UUID&latest_only=true"

# Filter by status
curl "http://localhost:3001/test-results?project_id=YOUR_PROJECT_UUID&status=failed"
```

### 3. Get Quality Metrics

```bash
curl "http://localhost:3001/test-results/project/YOUR_PROJECT_UUID/metrics"
```

Expected response:
```json
{
  "project_id": "uuid",
  "project_name": "Q1 Quality Audit",
  "latest_execution_date": "2026-01-21",
  "days_since_latest_execution": 0,
  "total_test_cases": 10,
  "latest_tests_executed": 10,
  "latest_passed_count": 7,
  "latest_failed_count": 2,
  "latest_not_run_count": 1,
  "latest_blocked_count": 0,
  "latest_rejected_count": 0,
  "latest_pass_rate_pct": 70.0,
  "latest_not_run_pct": 10.0,
  "latest_fail_rate_pct": 20.0
}
```

### 4. Get Trends

```bash
# Last 30 days
curl "http://localhost:3001/test-results/project/YOUR_PROJECT_UUID/trends?days=30"

# Last 7 days
curl "http://localhost:3001/test-results/project/YOUR_PROJECT_UUID/trends?days=7"
```

---

## Test Scenarios

### Scenario 1: Daily Test Execution Upload

**Goal**: Simulate daily test uploads to see trends

1. Upload test results with today's date
2. Manually change some statuses in the CSV
3. Upload again for tomorrow (change `executed_at` date)
4. Repeat for several days
5. View trend chart to see pass rate over time

**Sample CSV for Day 1:**
```csv
test_case_id,status,executed_at
TC-001,passed,2026-01-21
TC-002,failed,2026-01-21
```

**Sample CSV for Day 2:**
```csv
test_case_id,status,executed_at
TC-001,passed,2026-01-22
TC-002,passed,2026-01-22
```

### Scenario 2: Update Existing Results

**Goal**: Test duplicate handling (same test_case_id + same date = update)

1. Upload test results for today
2. Upload the same test_case_ids again with different statuses
3. Verify that results are updated, not duplicated
4. Check upload summary shows "Updated" count

### Scenario 3: Large Batch Upload

**Goal**: Test performance with many results

1. Create CSV with 100+ test results
2. Upload in one batch
3. Verify all imported successfully
4. Check page load times remain fast

### Scenario 4: Error Handling

**Goal**: Test validation and error reporting

1. Upload CSV with invalid status (e.g., "skipped")
   - Should show validation error

2. Upload CSV with missing required columns
   - Should show error about missing columns

3. Upload CSV with malformed rows
   - Should skip malformed rows and report errors

---

## Verification Checklist

### Database Verification

```sql
-- Check total test results
SELECT COUNT(*) FROM test_result;

-- Check results by status
SELECT status, COUNT(*)
FROM test_result
WHERE deleted_at IS NULL
GROUP BY status;

-- Check latest results per test case
SELECT * FROM v_latest_test_results;

-- Check quality metrics
SELECT * FROM v_project_quality_metrics;

-- Check trends
SELECT * FROM v_test_execution_trends
ORDER BY execution_date DESC
LIMIT 10;
```

### Frontend Verification

- [ ] Upload page loads correctly
- [ ] Project dropdown populated
- [ ] File upload accepts CSV
- [ ] Upload progress shows
- [ ] Success summary displays
- [ ] Error messages show for invalid data
- [ ] Test results list page loads
- [ ] Filters work (project, status)
- [ ] Search works (test case ID)
- [ ] Latest only toggle works
- [ ] Quality metrics display correctly
- [ ] Pass rate calculated correctly
- [ ] Trend chart renders
- [ ] Status badges color-coded correctly

### API Verification

- [ ] POST /test-results/upload works
- [ ] GET /test-results returns data
- [ ] GET /test-results with filters works
- [ ] GET /test-results/project/:id/metrics returns metrics
- [ ] GET /test-results/project/:id/trends returns trends
- [ ] Validation errors returned for bad data
- [ ] Audit log entries created

---

## Troubleshooting

### Issue: Upload fails with "project_id is required"

**Solution**: Make sure you selected a project in the dropdown

### Issue: "Invalid status values" error

**Solution**: Check your CSV status column. Valid values are:
- passed
- failed
- not_run
- blocked
- rejected

(Case-insensitive)

### Issue: Metrics not showing

**Solution**:
1. Verify results were uploaded: Check test results list page
2. Check database: `SELECT * FROM test_result;`
3. Check view: `SELECT * FROM v_project_quality_metrics;`
4. Refresh the page

### Issue: Trends chart empty

**Solution**:
- Upload results for multiple dates to see trends
- Single day results won't show a trend line

### Issue: API connection refused

**Solution**:
1. Check API is running: `curl http://localhost:3001/health`
2. Check port 3001 is not in use by another process
3. Check .env file has correct DATABASE_URL

### Issue: Database connection error

**Solution**:
1. Verify PostgreSQL is running: `psql -U qc_user -d qc_management`
2. Check database credentials in .env
3. Verify migration was applied

---

## Sample Test Data Sets

### Minimal Test (2 results)
```csv
test_case_id,status
TC-001,passed
TC-002,failed
```

### Complete Test (with all columns)
```csv
test_case_id,status,test_case_title,executed_at,notes,tester_name
TC-001,passed,Test 1,2026-01-21,All good,John
TC-002,failed,Test 2,2026-01-21,Error found,Jane
```

### Large Test (100 results)
```csv
test_case_id,status,test_case_title
TC-001,passed,Test 1
TC-002,passed,Test 2
TC-003,passed,Test 3
...
TC-100,passed,Test 100
```

(Generate programmatically if needed)

---

## Next Steps After Testing

1. **Integrate into Project Page**
   - Add quality metrics widget to main project view
   - Show pass rate badge on project cards

2. **Add Export Features**
   - Export test results to Excel
   - Generate PDF quality reports

3. **Add Notifications**
   - Email alerts when pass rate drops below threshold
   - Slack notifications for failed tests

4. **Add Advanced Filtering**
   - Date range filtering
   - Test case ID pattern matching
   - Bulk status updates

5. **Phase 2 Features**
   - Release readiness dashboard
   - Quality gates (auto pass/fail based on thresholds)
   - Risk indicators

---

**End of Testing Guide**
