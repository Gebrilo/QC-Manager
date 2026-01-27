# n8n Workflows for QC Management Tool

## Overview

This directory contains n8n workflow definitions for automating QC Management Tool operations.

## Quick Start

1. **Open n8n Dashboard**: http://localhost:5678
2. **Login**: Use credentials from `.env` (default: admin/admin)
3. **Create PostgreSQL Credentials**:
   - Host: `postgres` (in Docker) or `localhost` (standalone)
   - Port: `5432`
   - Database: `qc_app`
   - User: `postgres`
   - Password: `postgres`
4. **Import Workflows**: Go to "Workflows" > "Import from File" and select `.json` files
5. **Activate Workflows**: Toggle the workflow active switch

## Available Workflows

### Report Generation
| Workflow | Webhook URL | Description |
|----------|-------------|-------------|
| `qc_generate_project_summary_pdf.json` | `/webhook/generate-report` | Generate PDF summary for a project |
| `qc_generate_task_export_excel.json` | `/webhook/task-export` | Export tasks to Excel |
| `qc_task_export_excel.json` | `/webhook/task-export-excel` | Alternative task export |

### Task Automation
| Workflow | Webhook URL | Description |
|----------|-------------|-------------|
| `workflows/01_Create_Task.json` | `/webhook/task-created` | Triggered when task is created |
| `workflows/02_Update_Task.json` | `/webhook/task-updated` | Triggered when task is updated |
| `workflows/task_automation.json` | `/webhook/task-automation` | Generic task automation |

### Project Workflows
| Workflow | Webhook URL | Description |
|----------|-------------|-------------|
| `workflows/create_project.json` | `/webhook/project-created` | Triggered when project is created |

### Maintenance
| Workflow | Description |
|----------|-------------|
| `qc_cleanup_expired_reports.json` | Scheduled cleanup of expired report files |

## API Integration Points

The QC API triggers n8n workflows via webhooks. Configure `N8N_WEBHOOK_URL` in the API environment:

```bash
# In Docker (default)
N8N_WEBHOOK_URL=http://n8n:5678/webhook

# External access
N8N_WEBHOOK_URL=http://localhost:5678/webhook
```

### Webhook Triggers from API

The API (`apps/api/src/utils/n8n.js`) triggers these webhooks:

| Event | Webhook Path | Payload |
|-------|--------------|---------|
| Task Created | `task-created` | `{ task_id, task_name, project_id, status, ... }` |
| Task Updated | `task-updated` | `{ task_id, changes, old_values, new_values }` |
| Project Created | `project-created` | `{ project_id, name, owner, ... }` |
| Report Requested | `generate-report` | `{ job_id, report_type, format, filters }` |

### Example: Triggering Report Generation

```javascript
// From API code
const { triggerWorkflow } = require('./utils/n8n');

await triggerWorkflow('generate-report', {
  job_id: 'uuid-here',
  report_type: 'project_status',
  format: 'xlsx',
  filters: { project_ids: ['uuid-1', 'uuid-2'] }
});
```

## Database Views Used

Workflows query these PostgreSQL views for real-time data:

| View | Purpose |
|------|---------|
| `v_projects_with_metrics` | Project summaries with task counts |
| `v_tasks_with_calculations` | Tasks with calculated hours/completion |
| `v_resources_with_utilization` | Resource capacity and allocation |
| `v_dashboard_metrics` | Aggregated dashboard statistics |

## Environment Variables

n8n uses these environment variables (from `docker-compose.yml`):

```bash
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=admin
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678

# PostgreSQL connection (for n8n internal storage)
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=qc_app
DB_POSTGRESDB_USER=postgres
DB_POSTGRESDB_PASSWORD=postgres
```

## Customization

### Adding New Workflows

1. Create workflow in n8n UI
2. Export as JSON
3. Save to `n8n/workflows/` directory
4. Update this README

### Modifying Webhook Paths

If you change webhook paths, update the API trigger code in:
- `apps/api/src/utils/n8n.js`
- `apps/api/src/routes/reports.js`

## Troubleshooting

### Workflow Not Triggering
1. Ensure workflow is activated (toggle is green)
2. Check n8n logs: `docker-compose logs n8n`
3. Verify `N8N_WEBHOOK_URL` is correct in API environment

### Database Connection Failed
1. Verify PostgreSQL credentials in workflow
2. Use `postgres` as host inside Docker network
3. Check if PostgreSQL container is healthy

### Report Not Generating
1. Check workflow execution history in n8n
2. Verify `report_jobs` table has the job record
3. Check if callback to API is configured
