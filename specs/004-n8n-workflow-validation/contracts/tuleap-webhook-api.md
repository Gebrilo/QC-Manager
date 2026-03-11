# Tuleap Webhook API Contract

**Feature**: 004-n8n-workflow-validation  
**Date**: 2026-03-02  
**Base URL**: `http://qc-api:3001/tuleap-webhook`

## Endpoints

### POST /task

Receives processed task data from n8n Tuleap Task Sync workflow.

**Request Body**:
```json
{
  "action": "create | update | reject | archive",
  "tuleap_artifact_id": 12345,
  "tuleap_url": "https://tuleap.example.com/plugins/tracker/?aid=12345",
  "task_name": "Implement feature X",
  "notes": "Description text from Tuleap",
  "resource1_id": "uuid-of-matched-resource",
  "project_id": "uuid-of-qc-project",
  "new_assignee_name": "John Doe",
  "action_reason": "Assignee not found in QC Tool",
  "raw_tuleap_payload": {}
}
```

**Response — Created (201)**:
```json
{
  "success": true,
  "action": "created",
  "data": { "id": "uuid", "task_id": "TSK-001", "task_name": "..." }
}
```

**Response — Updated (200)**:
```json
{
  "success": true,
  "action": "updated",
  "data": { "id": "uuid", "task_id": "TSK-001", "task_name": "..." }
}
```

**Response — Rejected (200)**:
```json
{
  "success": true,
  "action": "rejected",
  "message": "Task rejected: ... (assigned to unknown user: ...)"
}
```

**Response — Archived (200)**:
```json
{
  "success": true,
  "action": "archived",
  "message": "Task archived: ... (reassigned to: ...)"
}
```

---

### POST /bug

Receives processed bug data from n8n Tuleap Bug Sync workflow.

**Request Body**:
```json
{
  "tuleap_artifact_id": 67890,
  "tuleap_tracker_id": 101,
  "tuleap_url": "https://tuleap.example.com/plugins/tracker/?aid=67890",
  "bug_id": "TLP-67890",
  "title": "Button not working",
  "description": "Full description...",
  "status": "Open",
  "severity": "high",
  "priority": "high",
  "bug_type": "UI Defect",
  "component": "Frontend",
  "project_id": "uuid-of-qc-project",
  "reported_by": "Jane Doe",
  "assigned_to": "Bob Smith",
  "reported_date": "2026-03-01T00:00:00Z",
  "raw_tuleap_payload": {}
}
```

**Response — Created (201)**:
```json
{
  "success": true,
  "action": "created",
  "data": { "id": "uuid", "bug_id": "BUG-xxx", "title": "..." }
}
```

---

### GET /resources

Resource lookup used by n8n to resolve Tuleap assignee names to QC resource IDs.

**Query Parameters**: `?name=John+Doe` or `?email=john@example.com`

**Response (200)**:
```json
{
  "success": true,
  "count": 1,
  "data": [
    { "id": "uuid", "resource_name": "John Doe", "email": "john@example.com" }
  ]
}
```

> **Important**: `data` is always an **array**, even for single results. Consumers must access `data[0]`.

---

### POST /config

Create or update Tuleap sync configuration.

**Request Body**:
```json
{
  "tuleap_project_id": 42,
  "tuleap_tracker_id": 101,
  "tuleap_base_url": "https://tuleap.example.com",
  "tracker_type": "task",
  "qc_project_id": "uuid-of-qc-project",
  "field_mappings": {
    "title_field_id": "201",
    "description_field_id": "202",
    "assigned_to_field_id": "204"
  },
  "status_mappings": {
    "New": "Backlog",
    "In Progress": "In Progress",
    "Done": "Completed"
  },
  "is_active": true
}
```

---

### GET /config

List sync configurations. Optional filters: `?tracker_type=task&is_active=true`

---

### GET /task-history

List archived/rejected tasks. Optional filters: `?project_id=uuid&action=rejected_new&limit=50&offset=0`
