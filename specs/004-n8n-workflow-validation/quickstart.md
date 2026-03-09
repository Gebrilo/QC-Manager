# Quickstart: N8N Workflow Validation

**Feature**: 004-n8n-workflow-validation  
**Date**: 2026-03-02

## Prerequisites

- Docker Desktop running
- `.env` file configured (copy from `.env.example`)
- Docker network created: `docker network create qc-shared-network`

## 1. Start the Environment

```bash
docker compose up -d
```

Wait for all services to be healthy:
```bash
docker compose ps
```

Expected: `qc-postgres` (healthy), `qc-api` (healthy), `qc-web` (healthy).

## 2. Import n8n Workflows

1. Open n8n at `http://localhost:5678`
2. Login with credentials from `.env` (default: `admin/admin`)
3. Create PostgreSQL credentials:
   - **Name**: `QC Tool Postgres`
   - **Host**: `postgres` (Docker network name)
   - **Port**: `5432`
   - **Database**: `qc_app`
   - **User/Password**: from `.env`
4. Import workflow files from `n8n/workflows/`:
   - `tuleap_task_sync.json` — Task sync from Tuleap
   - `tuleap_bug_sync.json` — Bug sync from Tuleap
5. Activate the imported workflows

## 3. Configure Tuleap Sync

Create a sync configuration by calling the API:

```bash
curl -X POST http://localhost:3001/tuleap-webhook/config \
  -H "Content-Type: application/json" \
  -d '{
    "tuleap_project_id": 42,
    "tuleap_tracker_id": 101,
    "tuleap_base_url": "https://your-tuleap.example.com",
    "tracker_type": "task",
    "qc_project_id": "<your-qc-project-uuid>",
    "field_mappings": {
      "title_field_id": "201",
      "description_field_id": "202",
      "assigned_to_field_id": "204"
    },
    "is_active": true
  }'
```

## 4. Test with a Sample Payload

Send a test task webhook:

```bash
curl -X POST http://localhost:5678/webhook/tuleap-task \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update",
    "user": { "display_name": "Test User" },
    "current": {
      "id": 99999,
      "tracker": { "id": 101 },
      "submitted_on": "2026-03-01T00:00:00+00:00",
      "last_update_date": "2026-03-02T00:00:00+00:00",
      "values": [
        { "field_id": 201, "type": "string", "value": "Test Task from Tuleap" },
        { "field_id": 202, "type": "text", "value": "This is a test task" },
        { "field_id": 204, "type": "sb", "values": [{ "display_name": "Test User" }] }
      ]
    }
  }'
```

## 5. Run Automated Tests

### API Route Tests (Jest)
```bash
cd apps/api
npx jest __tests__/tuleapWebhook.test.js --verbose
```

### Workflow JSON Validation
```bash
node n8n/validate-workflows.js
```

## 6. Verify Results

Check the database for the created task:
```bash
docker exec qc-postgres psql -U postgres -d qc_app \
  -c "SELECT task_id, task_name, synced_from_tuleap FROM tasks WHERE tuleap_artifact_id = 99999"
```

Check webhook logs:
```bash
docker exec qc-postgres psql -U postgres -d qc_app \
  -c "SELECT * FROM tuleap_webhook_log ORDER BY created_at DESC LIMIT 5"
```
