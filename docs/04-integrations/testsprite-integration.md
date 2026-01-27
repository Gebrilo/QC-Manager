# TestSprite MCP Integration Guide

## Overview

This guide explains how to integrate **TestSprite MCP** with the QC Management Tool to automatically upload test results from AI-generated tests.

### What is TestSprite MCP?

TestSprite MCP is an AI-powered testing tool that integrates with IDEs like VS Code, Cursor, and GitHub Copilot to automatically generate, execute, and debug tests. It brings fully automated software testing into your coding workflow.

**Key Features:**
- Automatically generates and executes tests
- Catches issues others miss
- Boosts AI-code pass rates from 42% to 93%
- Supports multiple test types: functional, security, edge cases, error handling

**Sources:**
- [TestSprite MCP on npm](https://www.npmjs.com/package/@testsprite/testsprite-mcp)
- [TestSprite Documentation](https://docs.testsprite.com/mcp/getting-started/installation)
- [TestSprite Solutions](https://www.testsprite.com/solutions/mcp)

---

## Integration Architecture

```
┌─────────────────┐
│   IDE (VS Code) │
│   + TestSprite  │
└────────┬────────┘
         │ AI generates & runs tests
         │
         ▼
┌─────────────────┐
│  Test Results   │
│    (JSON)       │
└────────┬────────┘
         │
         ├─► Manual Upload (CSV conversion)
         │
         ├─► Webhook (automated)
         │
         └─► Upload Script
                │
                ▼
      ┌──────────────────┐
      │ QC Management    │
      │ Tool API         │
      │ /testsprite/     │
      │   webhook        │
      └────────┬─────────┘
               │
               ▼
      ┌──────────────────┐
      │ test_result      │
      │ Database Table   │
      └────────┬─────────┘
               │
               ▼
      ┌──────────────────┐
      │ Quality Metrics  │
      │ & Dashboard      │
      └──────────────────┘
```

---

## Setup Instructions

### 1. Configure TestSprite in Your IDE

TestSprite is already configured in your Claude Desktop config:

**File:** `C:\Users\DEll\AppData\Roaming\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "TestSprite": {
      "command": "npx",
      "args": ["@testsprite/testsprite-mcp@latest"],
      "env": {
        "API_KEY": "sk-user-oT6JZ..."
      }
    }
  }
}
```

### 2. Install TestSprite MCP Globally (Optional)

```bash
npm install -g @testsprite/testsprite-mcp
```

### 3. Configure Backend Integration

Copy the example environment file:

```bash
cd "d:\Claude\QC management tool\qc-app\apps\api"
cp .env.testsprite.example .env.testsprite
```

Edit `.env.testsprite` with your settings:

```env
TESTSPRITE_API_KEY=sk-user-oT6JZ...
TESTSPRITE_WEBHOOK_URL=http://localhost:3001/testsprite/webhook
TESTSPRITE_ENABLED=true
TESTSPRITE_RESULT_FORMAT=auto
```

### 4. Restart API Server

The TestSprite webhook endpoint is now available at:
```
POST http://localhost:3001/testsprite/webhook
```

---

## Usage Methods

### Method 1: Automatic Webhook (Recommended)

Configure TestSprite to automatically POST results to the webhook after test execution.

**Webhook URL:**
```
http://localhost:3001/testsprite/webhook
```

**Payload Format:**
```json
{
  "project_id": "your-project-uuid",
  "results": {
    "tests": [
      {
        "id": "test-001",
        "name": "User login test",
        "status": "passed",
        "duration": 145,
        "timestamp": "2026-01-21"
      },
      {
        "id": "test-002",
        "name": "Dashboard load test",
        "status": "failed",
        "error": "Timeout after 5s",
        "duration": 5000,
        "timestamp": "2026-01-21"
      }
    ]
  },
  "metadata": {
    "source": "TestSprite MCP",
    "version": "1.0.0"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "TestSprite results uploaded successfully",
  "upload_batch_id": "uuid",
  "summary": {
    "total": 2,
    "imported": 2,
    "updated": 0,
    "errors": 0,
    "success_rate": "100.00%"
  }
}
```

### Method 2: Upload Script (Manual/CI/CD)

Use the provided Node.js script to upload TestSprite results:

```bash
# Basic usage
node scripts/testsprite-upload.js <project-id> <results.json>

# Example
node scripts/testsprite-upload.js abc-123-uuid ./testsprite-results.json

# With custom API URL
node scripts/testsprite-upload.js abc-123 results.json --url https://qc.example.com

# Verbose output
node scripts/testsprite-upload.js abc-123 results.json --verbose
```

**Make script executable:**
```bash
chmod +x scripts/testsprite-upload.js
```

**Use in CI/CD:**
```yaml
# GitHub Actions example
- name: Upload TestSprite Results
  run: |
    node scripts/testsprite-upload.js ${{ secrets.PROJECT_ID }} ./test-results.json
  env:
    QC_API_URL: ${{ secrets.QC_API_URL }}
```

### Method 3: Manual CSV Conversion

If you have TestSprite JSON results, convert them to CSV and upload via the web UI:

**Convert JSON to CSV:**
```bash
# Use jq or a custom script
cat testsprite-results.json | jq -r '.tests[] | [.id, .status, .name, .timestamp, .error, "TestSprite AI"] | @csv' > results.csv
```

**CSV Format:**
```csv
test_case_id,status,test_case_title,executed_at,notes,tester_name
test-001,passed,User login test,2026-01-21,,TestSprite AI
test-002,failed,Dashboard load test,2026-01-21,Timeout after 5s,TestSprite AI
```

Then upload via: http://localhost:3000/test-results/upload

---

## Status Mapping

TestSprite statuses are automatically mapped to QC Management Tool statuses:

| TestSprite Status | QC Tool Status | Description |
|-------------------|----------------|-------------|
| `passed`, `pass`, `success`, `ok` | `passed` | Test succeeded |
| `failed`, `fail`, `error` | `failed` | Test failed |
| `skipped`, `skip`, `pending` | `not_run` | Test not executed |
| `blocked` | `blocked` | Test blocked |
| `disabled` | `not_run` | Test disabled |
| `rejected` | `rejected` | Test rejected |

---

## TestSprite Result Formats

The integration supports multiple TestSprite result formats:

### Format 1: Flat Test Array
```json
{
  "tests": [
    {
      "id": "test-001",
      "name": "Test name",
      "status": "passed",
      "duration": 145,
      "timestamp": "2026-01-21"
    }
  ]
}
```

### Format 2: Test Suites
```json
{
  "suites": [
    {
      "name": "Login Suite",
      "tests": [
        {
          "id": "login-001",
          "title": "Valid credentials",
          "status": "passed"
        }
      ]
    }
  ]
}
```

### Format 3: Jest/Mocha Compatible
```json
{
  "numPassedTests": 5,
  "numFailedTests": 1,
  "testResults": [
    {
      "testFilePath": "/path/to/test.js",
      "testResults": [
        {
          "title": "should do something",
          "status": "passed",
          "duration": 10
        }
      ]
    }
  ]
}
```

---

## API Endpoints

### POST /testsprite/webhook

Upload TestSprite results to a project.

**Request:**
```json
{
  "project_id": "uuid",
  "results": { /* TestSprite results */ }
}
```

**Response:**
```json
{
  "success": true,
  "upload_batch_id": "uuid",
  "summary": {
    "total": 10,
    "imported": 8,
    "updated": 2,
    "errors": 0,
    "success_rate": "100.00%"
  },
  "details": {
    "success": [...],
    "updated": [...],
    "errors": []
  }
}
```

### GET /testsprite/status

Check TestSprite integration status.

**Response:**
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

---

## Example Workflows

### Workflow 1: IDE Integration (Real-time)

1. **Write code** in VS Code with TestSprite MCP enabled
2. **TestSprite generates tests** automatically via AI
3. **Tests execute** in the background
4. **Results POST** to webhook endpoint automatically
5. **View metrics** immediately in QC dashboard

### Workflow 2: CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Run Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Run TestSprite
        run: |
          npx @testsprite/testsprite-mcp run --output results.json
        env:
          TESTSPRITE_API_KEY: ${{ secrets.TESTSPRITE_API_KEY }}

      - name: Upload Results to QC Tool
        run: |
          node scripts/testsprite-upload.js ${{ secrets.PROJECT_ID }} results.json
        env:
          QC_API_URL: ${{ secrets.QC_API_URL }}
```

### Workflow 3: Local Development

```bash
# 1. Run TestSprite tests
npx @testsprite/testsprite-mcp run --output results.json

# 2. Upload results
node scripts/testsprite-upload.js abc-123 results.json

# 3. View in browser
open http://localhost:3000/test-results?project_id=abc-123
```

---

## Troubleshooting

### Issue: Webhook returns 400 "project_id is required"

**Solution:** Include `project_id` in the webhook payload:
```json
{
  "project_id": "your-uuid-here",
  "results": { ... }
}
```

### Issue: Results not showing in dashboard

**Checks:**
1. Verify upload was successful (check response)
2. Check database: `SELECT * FROM test_result WHERE upload_batch_id = 'uuid';`
3. Verify project_id matches an existing project
4. Check audit log: `SELECT * FROM audit_log WHERE action = 'testsprite_results_uploaded';`

### Issue: Status mapping incorrect

**Solution:** TestSprite statuses are case-insensitive and mapped automatically. Verify the status in your results JSON matches one of the supported statuses.

### Issue: Upload script fails with connection error

**Solution:**
1. Check API is running: `curl http://localhost:3001/health`
2. Verify API URL is correct
3. Check firewall/network settings

### Issue: Duplicate results

**Behavior:** Results with same `test_case_id` and `executed_at` date will **update** existing records, not create duplicates.

**To create new records:** Use different `executed_at` dates for each test run.

---

## Advanced Configuration

### Custom Result Parser

Extend the TestSprite integration to support custom formats:

**File:** `qc-app/apps/api/src/integrations/testsprite.js`

```javascript
function parseCustomFormat(data) {
  // Add your custom parsing logic
  return {
    test_case_id: data.customId,
    test_case_title: data.customTitle,
    status: mapTestSpriteStatus(data.customStatus),
    notes: data.customNotes,
    executed_at: data.customDate
  };
}
```

### Webhook Authentication

Add authentication to the webhook endpoint:

```javascript
// middleware/testspriteAuth.js
function authenticateTestSprite(req, res, next) {
  const token = req.headers['x-testsprite-token'];
  if (token !== process.env.TESTSPRITE_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

### Notification on Upload

Add Slack/email notifications when TestSprite uploads results:

```javascript
// After successful upload
await sendSlackNotification({
  message: `TestSprite uploaded ${result.summary.total} test results`,
  project: projectId,
  pass_rate: calculatePassRate(result)
});
```

---

## Performance Considerations

### Batch Size

- **Recommended:** 100-500 tests per upload
- **Maximum:** 1000 tests per upload
- For larger test suites, split into multiple uploads

### Rate Limiting

The webhook endpoint has no rate limiting by default. For high-volume scenarios, consider adding rate limiting:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

app.use('/testsprite/webhook', limiter);
```

### Database Performance

With proper indexing, the system can handle:
- 10,000+ test results per project
- 100+ concurrent uploads
- Sub-second query times for metrics

---

## Security Best Practices

1. **API Key Management**
   - Store API keys in environment variables
   - Never commit `.env` files to git
   - Rotate keys regularly

2. **Webhook Security**
   - Use HTTPS in production
   - Implement webhook authentication
   - Validate payload signatures

3. **Network Security**
   - Restrict webhook endpoint to known IPs
   - Use VPN for internal networks
   - Enable CORS only for trusted domains

---

## Monitoring & Logging

### Audit Trail

All TestSprite uploads are logged in the audit_log table:

```sql
SELECT *
FROM audit_log
WHERE action = 'testsprite_results_uploaded'
ORDER BY created_at DESC
LIMIT 10;
```

### Upload Batches

Track all upload batches:

```sql
SELECT
  upload_batch_id,
  COUNT(*) as results_count,
  MIN(uploaded_at) as uploaded_at,
  STRING_AGG(DISTINCT status::text, ', ') as statuses
FROM test_result
WHERE upload_batch_id IS NOT NULL
  AND deleted_at IS NULL
GROUP BY upload_batch_id
ORDER BY MIN(uploaded_at) DESC;
```

### Error Monitoring

Monitor failed uploads:

```bash
# Check API logs
tail -f qc-app/apps/api/logs/error.log | grep testsprite
```

---

## FAQ

**Q: Can TestSprite upload results to multiple projects?**
A: Yes, specify a different `project_id` for each upload.

**Q: How do I handle test results from different environments?**
A: Use different projects for each environment (Dev, Staging, Prod) or add environment info in test_case_title.

**Q: Can I upload results retroactively?**
A: Yes, specify the `executed_at` date in the results JSON.

**Q: What happens if the same test runs multiple times on the same day?**
A: The latest result will update the previous result (no duplicates).

**Q: Can I customize the test_case_id format?**
A: Yes, TestSprite generates IDs automatically, but you can override them in the results JSON.

**Q: Is there a limit on result history?**
A: No hard limit. Soft delete keeps historical data available.

---

## Next Steps

1. **Test the integration** with a small test suite
2. **Configure webhooks** for automatic uploads
3. **Set up CI/CD** integration for automated testing
4. **Monitor metrics** in the quality dashboard
5. **Customize** as needed for your workflow

---

## Support

### Documentation
- QC Tool Setup: [SIMPLIFIED_IMPLEMENTATION_GUIDE.md](../SIMPLIFIED_IMPLEMENTATION_GUIDE.md)
- Testing Guide: [TESTING_GUIDE.md](../TESTING_GUIDE.md)
- TestSprite Docs: https://docs.testsprite.com

### API Endpoints
- Webhook: http://localhost:3001/testsprite/webhook
- Status: http://localhost:3001/testsprite/status
- Health: http://localhost:3001/health

### Resources
- [TestSprite MCP on npm](https://www.npmjs.com/package/@testsprite/testsprite-mcp)
- [TestSprite Documentation](https://docs.testsprite.com/mcp/getting-started/installation)
- [Model Context Protocol Guide](https://modelcontextprotocol.io/specification/2025-11-25)

---

**TestSprite Integration Status:** ✅ Complete and Ready to Use

**Created:** 2026-01-21
**Version:** 1.0.0
