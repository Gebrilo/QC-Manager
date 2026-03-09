# Research: N8N Workflow Validation

**Feature**: 004-n8n-workflow-validation  
**Date**: 2026-03-02

## Research Area 1: Tuleap Artifact JSON Structure

### Decision
The Tuleap webhook sends a payload with this structure:

```json
{
  "action": "update",
  "user": { "display_name": "John Doe", "username": "jdoe" },
  "current": {
    "id": 12345,
    "tracker": { "id": 101 },
    "submitted_on": "2026-01-01T00:00:00+00:00",
    "last_update_date": "2026-03-01T00:00:00+00:00",
    "values": [
      { "field_id": 1, "type": "string", "value": "Task Title" },
      { "field_id": 2, "type": "text", "value": "Description text" },
      { "field_id": 3, "type": "sb", "values": [{ "label": "In Progress" }] },
      { "field_id": 4, "type": "sb", "values": [{ "display_name": "User Name", "username": "usr" }] },
      { "field_id": 5, "type": "date", "value": "2026-03-01" },
      { "field_id": 6, "type": "aid", "value": 12345 },
      { "field_id": 7, "type": "computed", "value": 42 }
    ]
  }
}
```

### Rationale
Analyzed the existing `tuleap_task_sync.json` and `tuleap_bug_sync.json` workflow code nodes to reverse-engineer the expected payload format. The `getFieldValue()` helper in both workflows handles `sb`, `msb`, `string`, `text`, and `date` types. The bug workflow also handles `aid`.

### Alternatives Considered
- **Tuleap REST API documentation**: Would require external lookup. Using the existing code as source of truth.
- **Tuleap webhook configuration panel**: Configuration stored in `tuleap_sync_config` table with `field_mappings` JSON.

---

## Research Area 2: Resource Lookup API Response Format

### Decision
The `/tuleap-webhook/resources` API returns:
```json
{
  "success": true,
  "count": 1,
  "data": [{ "id": "uuid", "resource_name": "John Doe", "email": "john@example.com" }]
}
```

The `data` field is always an **array** (even for single results). However, the `tuleap_task_sync.json` workflow's "Build Request" node accesses `resourceResponse.data` as a single object (`resource.id`), not an array element.

### Rationale
Reading the API code in `tuleapWebhook.js` line 737: `res.json({ success: true, count: result.rows.length, data: result.rows })` — `result.rows` is always an array. The n8n workflow needs to extract `data[0]` instead of `data` directly.

### Alternatives Considered
- **Change API to return single object**: Would break other consumers. Fix the workflow instead.
- **Add `/resources/lookup` endpoint returning single**: Over-engineering for this use case.

**Resolution**: Fix the n8n workflow JavaScript to handle array response: `const resource = resourceResponse.data && resourceResponse.data[0];`

---

## Research Area 3: Credential Naming Consistency

### Decision
Standardize all PostgreSQL credentials to use the name `QC Tool Postgres` with ID `1`.

### Rationale
Current state across workflows:
| Workflow | Credential Name | Credential ID |
|----------|----------------|---------------|
| tuleap_task_sync.json | QC Tool Postgres | 1 |
| tuleap_bug_sync.json | QC Tool Postgres | 1 |
| 02_Update_Task.json | Local Postgres | 1 |
| 03_Generate_Report.json | Local Postgres | 1 |
| task_automation.json | Postgres account | postgresCredentials |
| qc_generate_project_summary_pdf.json | Postgres account | postgresCredentials |

Inconsistent credential naming will cause import failures if the credential exists under a different name.

### Alternatives Considered
- **Leave as-is**: Would cause confusion and import failures. Not acceptable.
- **Create multiple credentials**: Unnecessary since all connect to the same database.

---

## Research Area 4: Stub Workflows Assessment

### Decision
Workflows `01_Create_Task.json` and `create_project.json` are stubs (webhook → no-op). These should be either:
1. Documented as intentional placeholders for future development, OR
2. Enhanced to at minimum log the event to the audit table

### Rationale
The `task_automation.json` workflow already handles the `task-created` webhook path and logs to the database. Having two workflows on the same path (`/webhook/task-created`) could create conflicts in n8n.

### Alternatives Considered
- **Delete stub workflows**: Could lose intended future structure.
- **Merge into task_automation.json**: Best approach — consolidate duplicate webhook paths.
- **Keep as-is with documentation**: Acceptable if webhooks aren't activated simultaneously.

**Resolution**: Document in README. Flag duplicate webhook paths as warnings in the validation script.

---

## Research Area 5: Testing Strategy for n8n Workflows

### Decision
Test in two layers:
1. **API route tests (Jest)**: Test the Express routes directly with mocked database, covering all CRUD actions, edge cases, and input validation.
2. **Workflow JSON validation (Node.js script)**: Structural validation of workflow files — no n8n runtime required.

### Rationale
Testing n8n workflow execution requires a running n8n instance with configured credentials and a connected database. This is too heavy for CI. Instead, we test the API routes (which receive the processed data from n8n) and validate the workflow JSON structure statically.

### Alternatives Considered
- **n8n CLI test execution**: n8n doesn't provide a test runner for workflows.
- **Full integration tests with Docker**: Too complex for initial validation. Can be added later.
- **Manual testing only**: Insufficient for regression detection.
