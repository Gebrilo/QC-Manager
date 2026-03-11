# Data Model: N8N Workflow Validation

**Feature**: 004-n8n-workflow-validation  
**Date**: 2026-03-02

## Entity Relationships

```mermaid
erDiagram
    tuleap_sync_config ||--o{ tasks : "maps tracker to"
    tuleap_sync_config ||--o{ bugs : "maps tracker to"
    projects ||--o{ tasks : "contains"
    projects ||--o{ bugs : "contains"
    resources ||--o{ tasks : "assigned to"
    tuleap_webhook_log }o--|| tasks : "logs processing of"
    tuleap_webhook_log }o--|| bugs : "logs processing of"
    tuleap_task_history }o--|| tasks : "archives"
    
    tuleap_sync_config {
        uuid id PK
        int tuleap_project_id
        int tuleap_tracker_id
        text tuleap_base_url
        varchar tracker_type "task | bug | test_case"
        uuid qc_project_id FK
        jsonb field_mappings
        jsonb status_mappings
        boolean is_active
    }
    
    tasks {
        uuid id PK
        varchar task_id "TSK-001"
        varchar task_name
        text notes
        varchar status
        uuid project_id FK
        uuid resource1_id FK
        int tuleap_artifact_id UK
        text tuleap_url
        boolean synced_from_tuleap
        timestamp last_tuleap_sync
    }
    
    bugs {
        uuid id PK
        int tuleap_artifact_id UK
        int tuleap_tracker_id
        text tuleap_url
        varchar bug_id "BUG-xxx"
        varchar title
        text description
        varchar status "Open|InProgress|Resolved|Closed"
        varchar severity "critical|high|medium|low"
        varchar priority
        varchar bug_type
        varchar component
        uuid project_id FK
        jsonb raw_tuleap_payload
    }
    
    tuleap_webhook_log {
        uuid id PK
        int tuleap_artifact_id
        int tuleap_tracker_id
        varchar artifact_type "bug|test_case|task"
        varchar action
        varchar payload_hash UK_COMPOSITE
        jsonb raw_payload
        varchar processing_status
        text processing_result
        text error_message
    }
    
    tuleap_task_history {
        uuid id PK
        uuid original_task_id
        int tuleap_artifact_id
        varchar task_name
        varchar action "reassigned_out|rejected_new"
        varchar new_assignee_name
        text action_reason
    }
```

## Field Mappings (tuleap_sync_config.field_mappings)

The `field_mappings` JSONB column maps Tuleap field IDs to QC Tool field names:

```json
{
  "title_field_id": "201",
  "description_field_id": "202",
  "status_field_id": "203",
  "assigned_to_field_id": "204",
  "severity_field_id": "205",
  "priority_field_id": "206",
  "type_field_id": "207",
  "component_field_id": "208"
}
```

## Status Mappings (tuleap_sync_config.status_mappings)

The `status_mappings` JSONB column maps Tuleap status labels to QC Tool statuses:

| Tuleap Status | QC Bug Status (default) |
|---------------|------------------------|
| New | Open |
| Assigned | In Progress |
| Fixed | Resolved |
| Closed | Closed |
| Rejected | Closed |
| Open | Open |
| In Progress | In Progress |
| Reopened | Reopened |

## Severity Mappings (hardcoded in bug sync workflow)

| Tuleap Severity | QC Severity |
|-----------------|-------------|
| Critical | critical |
| High | high |
| Major | high |
| Medium | medium |
| Normal | medium |
| Low | low |
| Minor | low |

## Tuleap Field Types Supported

| Type Code | Description | Value Access |
|-----------|-------------|-------------|
| `string` | Single-line text | `field.value` |
| `text` | Multi-line text | `field.value` |
| `sb` | Select box (single) | `field.values[0].label` |
| `msb` | Multi-select box | `field.values[0].label` |
| `date` | Date/datetime | `field.value` |
| `aid` | Artifact ID | `field.value` |
| `computed` | Computed field | `field.value` (to be added) |

## State Transitions

### Task Lifecycle (via webhook actions)

```
[Tuleap webhook received]
    │
    ├─ action: create → NEW task in QC Tool (status: Backlog)
    ├─ action: update → UPDATE existing task
    ├─ action: reject → LOG to tuleap_task_history (unknown assignee, new task)
    └─ action: archive → SOFT DELETE task + LOG to tuleap_task_history (reassigned out)
```

### Bug Lifecycle

```
[Tuleap webhook received]
    │
    ├─ bug exists? NO → CREATE new bug record
    └─ bug exists? YES → UPDATE existing bug record
```
