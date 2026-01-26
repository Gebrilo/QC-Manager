# QC SCENARIO PLANNING - RELATIONAL DATABASE SCHEMA DESIGN

**Version:** 1.0
**Database:** PostgreSQL 14+
**Date:** January 2025
**Purpose:** Enterprise-grade database schema for QC task and project management

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Core Tables](#core-tables)
4. [Configuration Tables](#configuration-tables)
5. [Audit & Logging](#audit--logging)
6. [Database Views](#database-views)
7. [Relationships & Foreign Keys](#relationships--foreign-keys)
8. [Indexes](#indexes)
9. [Business Rules](#business-rules)
10. [Soft Delete Strategy](#soft-delete-strategy)
11. [Audit Log Strategy](#audit-log-strategy)
12. [Migration Mapping](#migration-mapping)
13. [Sample Queries](#sample-queries)

---

## OVERVIEW

### System Purpose

This database schema supports a **task-driven project management system** for quality assurance teams with:

- **Single Source of Truth:** Tasks are the primary data entry point
- **Automatic Aggregation:** Projects calculate metrics from tasks
- **Real-time Metrics:** Views provide instant reporting
- **Complete Audit Trail:** Every change is logged with before/after states
- **Soft Deletes:** Data is never physically deleted
- **UUID-based:** Immutable primary keys for all entities

### Key Statistics

| Metric | Count |
|--------|-------|
| Core Tables | 3 (projects, tasks, resources) |
| Configuration Tables | 3 (status_options, status_transitions, system_config) |
| Audit Tables | 1 (audit_log) |
| Database Views | 5 (all derived calculations) |
| Foreign Key Relationships | 4 |
| Indexes | 30+ |
| Database Triggers | 7 |

---

## ARCHITECTURE PRINCIPLES

### Design Decisions

1. ✅ **UUID Primary Keys** - All tables use `gen_random_uuid()` for immutable identity
2. ✅ **Soft Deletes** - `deleted_at` timestamp instead of physical deletion
3. ✅ **Audit Trail** - Comprehensive logging with JSONB state capture
4. ✅ **Derived Fields in Views** - No stored calculated fields; computed in real-time
5. ✅ **Referential Integrity** - Foreign keys with CASCADE rules
6. ✅ **Timezone Awareness** - All timestamps use `TIMESTAMPTZ`
7. ✅ **Data Validation** - CHECK constraints at database level

### Data Flow

```
User Action (create/update task)
    ↓
Tasks Table (INSERT/UPDATE)
    ↓
Audit Trigger Fires
    ↓
audit_log Table (append record)
    ↓
Views Recalculate (automatic)
    ↓
Dashboard Displays Updated Metrics
```

---

## CORE TABLES

### 1. TABLE: `projects`

**Purpose:** Project containers that automatically aggregate task data

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `project_uuid` | UUID | NOT NULL | `gen_random_uuid()` | **Primary Key** - Immutable identifier |
| `project_id` | VARCHAR(20) | NOT NULL | - | User-visible display ID (format: PRJ-001) |
| `project_name` | VARCHAR(100) | NOT NULL | - | Display name |
| `total_weight` | INTEGER | NULL | - | Priority weighting (1-5 scale) |
| `priority` | VARCHAR(20) | NULL | - | High / Medium / Low |
| `start_date` | DATE | NULL | - | Project start date |
| `target_date` | DATE | NULL | - | Project target completion |
| `created_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Record creation timestamp |
| `created_by` | VARCHAR(255) | NULL | - | User email who created record |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Last update timestamp |
| `updated_by` | VARCHAR(255) | NULL | - | User email who last updated |
| `deleted_at` | TIMESTAMPTZ | NULL | - | **Soft delete** timestamp (NULL = active) |
| `deleted_by` | VARCHAR(255) | NULL | - | User email who deleted |

**Constraints:**

- `UNIQUE (project_id)` - Unique display ID
- `CHECK (project_id ~ '^PRJ-[0-9]{3}$')` - Format validation
- `CHECK (total_weight BETWEEN 1 AND 5)` - Range validation
- `CHECK (priority IN ('High', 'Medium', 'Low'))` - Enum validation
- `CHECK (target_date >= start_date)` - Logical date validation

**Derived Fields (NOT stored, calculated in views):**

- `task_hrs_est` - Sum of task estimated hours
- `task_hrs_actual` - Sum of task actual hours
- `task_hrs_done` - Sum of done task hours
- `completion_pct` - Percentage complete
- `tasks_done_count` - Count of done tasks
- `tasks_total_count` - Total task count
- `status` - Complete / On Track / At Risk / No Tasks

**Indexes:**

- `idx_projects_project_id_active` - Unique on `project_id` WHERE `deleted_at IS NULL`
- `idx_projects_deleted_at` - On `deleted_at` WHERE `deleted_at IS NOT NULL`
- `idx_projects_priority` - On `priority` WHERE `deleted_at IS NULL`
- `idx_projects_dates` - On `(start_date, target_date)` WHERE `deleted_at IS NULL`

---

### 2. TABLE: `tasks`

**Purpose:** Primary work tracking with hours, resources, and status lifecycle

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `task_uuid` | UUID | NOT NULL | `gen_random_uuid()` | **Primary Key** - Immutable identifier |
| `task_id` | VARCHAR(20) | NOT NULL | - | User-visible display ID (format: TSK-001) |
| `project_uuid` | UUID | NOT NULL | - | **Foreign Key** → `projects.project_uuid` |
| `resource1_uuid` | UUID | NOT NULL | - | **Foreign Key** → `resources.resource_uuid` |
| `resource2_uuid` | UUID | NULL | - | **Foreign Key** → `resources.resource_uuid` (optional) |
| `task_name` | VARCHAR(200) | NOT NULL | - | Task description |
| `status` | VARCHAR(20) | NOT NULL | `'Backlog'` | Backlog / In Progress / Done / Cancelled |
| `estimate_days` | NUMERIC(10,2) | NULL | - | Estimated duration in days |
| `r1_estimate_hrs` | NUMERIC(10,2) | NOT NULL | `0` | Resource 1 estimated hours |
| `r1_actual_hrs` | NUMERIC(10,2) | NOT NULL | `0` | Resource 1 actual hours worked |
| `r2_estimate_hrs` | NUMERIC(10,2) | NOT NULL | `0` | Resource 2 estimated hours |
| `r2_actual_hrs` | NUMERIC(10,2) | NOT NULL | `0` | Resource 2 actual hours worked |
| `deadline` | DATE | NULL | - | Task due date |
| `completed_date` | DATE | NULL | - | Date when marked Done |
| `description` | TEXT | NULL | - | Detailed task description |
| `notes` | TEXT | NULL | - | Additional notes |
| `tags` | TEXT[] | NULL | - | PostgreSQL array for tags |
| `created_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Record creation timestamp |
| `created_by` | VARCHAR(255) | NULL | - | User email who created record |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Last update timestamp |
| `updated_by` | VARCHAR(255) | NULL | - | User email who last updated |
| `deleted_at` | TIMESTAMPTZ | NULL | - | **Soft delete** timestamp |
| `deleted_by` | VARCHAR(255) | NULL | - | User email who deleted |

**Constraints:**

- `UNIQUE (task_id)` - Unique display ID
- `CHECK (task_id ~ '^TSK-[0-9]{3}$')` - Format validation
- `CHECK (status IN ('Backlog', 'In Progress', 'Done', 'Cancelled'))` - Enum validation
- `CHECK (estimate_days > 0)` - Positive value validation
- `CHECK (r1_estimate_hrs >= 0 AND r1_actual_hrs >= 0)` - Non-negative hours
- `CHECK (r2_estimate_hrs >= 0 AND r2_actual_hrs >= 0)` - Non-negative hours
- `CHECK (status != 'Done' OR (completed_date IS NOT NULL AND (r1_actual_hrs + r2_actual_hrs) > 0))` - Done requires completion date and hours
- `CHECK (completed_date >= created_at::DATE)` - Logical date validation
- `CHECK (resource2_uuid IS NOT NULL OR (r2_estimate_hrs = 0 AND r2_actual_hrs = 0))` - Resource 2 hours logic

**Derived Fields (NOT stored, calculated in views):**

- `estimate_hrs` - `estimate_days × 8`
- `total_est_hrs` - `r1_estimate_hrs + r2_estimate_hrs`
- `total_actual_hrs` - `r1_actual_hrs + r2_actual_hrs`
- `r1_completion_pct` - `r1_actual_hrs / r1_estimate_hrs × 100`
- `r2_completion_pct` - `r2_actual_hrs / r2_estimate_hrs × 100`
- `hours_variance` - `total_actual_hrs - total_est_hrs`
- `variance_pct` - `hours_variance / total_est_hrs × 100`
- `overall_completion_pct` - `total_actual_hrs / total_est_hrs × 100`

**Indexes:**

- `idx_tasks_task_id_active` - Unique on `task_id` WHERE `deleted_at IS NULL`
- `idx_tasks_project_uuid` - On `project_uuid` WHERE `deleted_at IS NULL`
- `idx_tasks_status` - On `status` WHERE `deleted_at IS NULL`
- `idx_tasks_resource1_uuid` - On `resource1_uuid` WHERE `deleted_at IS NULL`
- `idx_tasks_resource2_uuid` - On `resource2_uuid` WHERE `deleted_at IS NULL AND resource2_uuid IS NOT NULL`
- `idx_tasks_deleted_at` - On `deleted_at` WHERE `deleted_at IS NOT NULL`
- `idx_tasks_deadline` - On `deadline` WHERE `deleted_at IS NULL AND status NOT IN ('Done', 'Cancelled')`
- `idx_tasks_project_status` - Composite on `(project_uuid, status)` WHERE `deleted_at IS NULL`
- `idx_tasks_resource1_status` - Composite on `(resource1_uuid, status)` WHERE `deleted_at IS NULL`
- `idx_tasks_tags` - GIN index on `tags` for array search

---

### 3. TABLE: `resources`

**Purpose:** Resource pool with automatic utilization tracking from task assignments

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `resource_uuid` | UUID | NOT NULL | `gen_random_uuid()` | **Primary Key** - Immutable identifier |
| `resource_name` | VARCHAR(100) | NOT NULL | - | Person name (unique) |
| `weekly_capacity_hrs` | INTEGER | NOT NULL | `40` | Available hours per week |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Active flag (soft disable) |
| `email` | VARCHAR(255) | NULL | - | Email address |
| `department` | VARCHAR(100) | NULL | - | Department name |
| `role` | VARCHAR(100) | NULL | - | Job role/title |
| `created_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Record creation timestamp |
| `created_by` | VARCHAR(255) | NULL | - | User email who created record |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Last update timestamp |
| `updated_by` | VARCHAR(255) | NULL | - | User email who last updated |
| `deleted_at` | TIMESTAMPTZ | NULL | - | **Soft delete** timestamp |
| `deleted_by` | VARCHAR(255) | NULL | - | User email who deleted |

**Constraints:**

- `UNIQUE (resource_name)` - Unique person name
- `CHECK (weekly_capacity_hrs > 0)` - Positive capacity
- `CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')` - Email format validation

**Derived Fields (NOT stored, calculated in views):**

- `current_allocation_hrs` - Sum of estimated hours from all active task assignments
- `utilization_pct` - `current_allocation_hrs / weekly_capacity_hrs × 100`
- `available_hrs` - `weekly_capacity_hrs - current_allocation_hrs`
- `active_tasks_count` - Count of tasks with status = 'In Progress'
- `backlog_tasks_count` - Count of tasks with status = 'Backlog'

**Indexes:**

- `idx_resources_name_active` - Unique on `resource_name` WHERE `deleted_at IS NULL`
- `idx_resources_active` - On `is_active` WHERE `deleted_at IS NULL AND is_active = TRUE`
- `idx_resources_deleted_at` - On `deleted_at` WHERE `deleted_at IS NOT NULL`

---

## CONFIGURATION TABLES

### 4. TABLE: `status_options`

**Purpose:** Valid task statuses with display metadata for UI rendering

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `status_id` | SERIAL | NOT NULL | Auto-increment | **Primary Key** |
| `status_name` | VARCHAR(20) | NOT NULL | - | Status label (unique) |
| `display_order` | INTEGER | NOT NULL | - | Sort order for UI |
| `is_terminal` | BOOLEAN | NOT NULL | `FALSE` | Terminal states cannot transition |
| `color_code` | VARCHAR(7) | NULL | - | Hex color for UI (e.g., #4CAF50) |
| `description` | TEXT | NULL | - | Status description |
| `created_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Last update timestamp |

**Constraints:**

- `UNIQUE (status_name)` - Unique status labels
- `UNIQUE (display_order)` - Unique sort order
- `CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$')` - Hex color format

**Seed Data:**

| status_name | display_order | is_terminal | color_code | description |
|-------------|---------------|-------------|------------|-------------|
| Backlog | 1 | FALSE | #2196F3 | Task created but not started |
| In Progress | 2 | FALSE | #FF9800 | Work actively underway |
| Done | 3 | TRUE | #4CAF50 | Work completed |
| Cancelled | 4 | TRUE | #9E9E9E | Task abandoned or no longer needed |

**Indexes:**

- `idx_status_options_order` - On `display_order`

---

### 5. TABLE: `status_transitions`

**Purpose:** Allowed status transitions (state machine rules)

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `transition_id` | SERIAL | NOT NULL | Auto-increment | **Primary Key** |
| `from_status` | VARCHAR(20) | NOT NULL | - | **Foreign Key** → `status_options.status_name` |
| `to_status` | VARCHAR(20) | NOT NULL | - | **Foreign Key** → `status_options.status_name` |
| `requires_fields` | TEXT[] | NULL | - | Array of required field names for transition |
| `created_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Record creation timestamp |

**Constraints:**

- `UNIQUE (from_status, to_status)` - Unique transition pairs
- `FOREIGN KEY (from_status)` → `status_options(status_name)` ON DELETE CASCADE
- `FOREIGN KEY (to_status)` → `status_options(status_name)` ON DELETE CASCADE

**Seed Data (Valid Transitions):**

| from_status | to_status | requires_fields |
|-------------|-----------|-----------------|
| Backlog | In Progress | NULL |
| Backlog | Cancelled | NULL |
| In Progress | Done | `['completed_date']` |
| In Progress | Cancelled | NULL |

**State Machine Diagram:**

```
┌──────────┐
│ BACKLOG  │ (Initial state)
└────┬─────┘
     │
     ├──────────→ In Progress  (Start work)
     │
     └──────────→ Cancelled     (Abandon before starting)

┌──────────────┐
│ IN PROGRESS  │
└────┬─────────┘
     │
     ├──────────→ Done          (Complete work, requires completed_date)
     │
     └──────────→ Cancelled     (Abandon during work)

┌──────────┐
│   DONE   │ (Terminal state - cannot transition)
└──────────┘

┌───────────┐
│ CANCELLED │ (Terminal state - cannot transition)
└───────────┘
```

---

### 6. TABLE: `system_config`

**Purpose:** System-wide configuration key-value store

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `config_key` | VARCHAR(100) | NOT NULL | - | **Primary Key** - Configuration key |
| `config_value` | TEXT | NOT NULL | - | Configuration value (stored as text) |
| `data_type` | VARCHAR(20) | NOT NULL | - | Type hint: string, integer, decimal, boolean, json |
| `description` | TEXT | NULL | - | Configuration description |
| `is_editable` | BOOLEAN | NOT NULL | `TRUE` | Whether users can edit this config |
| `category` | VARCHAR(50) | NULL | - | Grouping category |
| `created_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | Last update timestamp |
| `updated_by` | VARCHAR(255) | NULL | - | User email who last updated |

**Constraints:**

- `CHECK (data_type IN ('string', 'integer', 'decimal', 'boolean', 'json'))` - Valid data types

**Seed Data:**

| config_key | config_value | data_type | description | is_editable | category |
|------------|--------------|-----------|-------------|-------------|----------|
| default_weekly_capacity | 40 | integer | Default weekly hours for new resources | TRUE | resources |
| hours_per_day | 8 | integer | Conversion factor: days to hours | TRUE | calculations |
| completion_threshold_on_track | 0.70 | decimal | Threshold for On Track status (70%) | TRUE | projects |
| enable_audit_log | true | boolean | Enable comprehensive audit logging | FALSE | system |
| app_name | QC Scenario Planning | string | Application display name | TRUE | general |
| app_version | 1.0.0 | string | Current application version | FALSE | general |

**Indexes:**

- `idx_system_config_category` - On `category`

---

## AUDIT & LOGGING

### 7. TABLE: `audit_log`

**Purpose:** Append-only audit trail with full state capture in JSONB format

**Schema:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `audit_uuid` | UUID | NOT NULL | `gen_random_uuid()` | **Primary Key** - Immutable identifier |
| `timestamp` | TIMESTAMPTZ | NOT NULL | `CURRENT_TIMESTAMP` | When the change occurred |
| `action` | VARCHAR(20) | NOT NULL | - | CREATE / UPDATE / DELETE / RESTORE |
| `entity_type` | VARCHAR(50) | NOT NULL | - | projects / tasks / resources / config |
| `entity_uuid` | UUID | NOT NULL | - | UUID of the affected record |
| `user_email` | VARCHAR(255) | NOT NULL | - | Email of user who made the change |
| `user_ip` | INET | NULL | - | IP address of user |
| `user_agent` | TEXT | NULL | - | Browser user agent string |
| `before_state` | JSONB | NULL | - | Complete record state before mutation (NULL for CREATE) |
| `after_state` | JSONB | NULL | - | Complete record state after mutation (NULL for DELETE) |
| `changed_fields` | TEXT[] | NULL | - | Array of field names that changed |
| `change_summary` | TEXT | NULL | - | Human-readable summary of the change |
| `request_id` | UUID | NULL | - | Groups multiple changes in single transaction |
| `session_id` | UUID | NULL | - | User session identifier |
| `api_endpoint` | VARCHAR(255) | NULL | - | API endpoint that triggered change |

**Constraints:**

- `CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE'))` - Valid actions
- `CHECK (entity_type IN ('projects', 'tasks', 'resources', 'config'))` - Valid entity types
- `CHECK ((action = 'CREATE' AND before_state IS NULL) OR (action = 'DELETE' AND after_state IS NULL) OR (action IN ('UPDATE', 'RESTORE')))` - State logic validation

**Key Features:**

- ✅ **Append-Only** - Records never updated or deleted
- ✅ **JSONB Storage** - Flexible JSON storage with indexing support
- ✅ **Full State Capture** - Complete before/after record states
- ✅ **Change Tracking** - Array of specific fields that changed
- ✅ **Request Grouping** - Link related changes via `request_id`

**Indexes:**

- `idx_audit_log_timestamp` - On `timestamp DESC` (most recent first)
- `idx_audit_log_entity` - On `(entity_type, entity_uuid)` (find all changes to a record)
- `idx_audit_log_user` - On `(user_email, timestamp DESC)` (user activity)
- `idx_audit_log_action` - On `action` (filter by action type)
- `idx_audit_log_request_id` - On `request_id` WHERE `request_id IS NOT NULL` (group related changes)
- `idx_audit_log_before_state` - GIN index on `before_state` (fast JSON queries)
- `idx_audit_log_after_state` - GIN index on `after_state` (fast JSON queries)

**Example Audit Record:**

```json
{
  "audit_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-15T10:30:00Z",
  "action": "UPDATE",
  "entity_type": "tasks",
  "entity_uuid": "123e4567-e89b-12d3-a456-426614174000",
  "user_email": "user@example.com",
  "before_state": {
    "task_id": "TSK-001",
    "status": "Backlog",
    "r1_actual_hrs": 0
  },
  "after_state": {
    "task_id": "TSK-001",
    "status": "In Progress",
    "r1_actual_hrs": 5
  },
  "changed_fields": ["status", "r1_actual_hrs"],
  "change_summary": "Updated task: TSK-001 - Changed status from Backlog to In Progress"
}
```

---

## DATABASE VIEWS

### 8. VIEW: `v_tasks_with_calculations`

**Purpose:** Tasks with all derived fields calculated (replaces Excel formulas)

**Calculated Fields:**

| Field | Formula | Description |
|-------|---------|-------------|
| `estimate_hrs` | `estimate_days × 8` | Convert days to hours |
| `total_est_hrs` | `r1_estimate_hrs + r2_estimate_hrs` | Total estimated hours |
| `total_actual_hrs` | `r1_actual_hrs + r2_actual_hrs` | Total actual hours worked |
| `r1_completion_pct` | `(r1_actual_hrs / r1_estimate_hrs) × 100` | Resource 1 completion % |
| `r2_completion_pct` | `(r2_actual_hrs / r2_estimate_hrs) × 100` | Resource 2 completion % |
| `hours_variance` | `total_actual_hrs - total_est_hrs` | Over/under estimate |
| `variance_pct` | `(hours_variance / total_est_hrs) × 100` | Variance percentage |
| `overall_completion_pct` | `(total_actual_hrs / total_est_hrs) × 100` | Overall task completion |
| `days_until_deadline` | `deadline - CURRENT_DATE` | Days remaining |

**Usage:**

```sql
-- Get all active tasks with calculations
SELECT * FROM v_tasks_with_calculations;

-- Get tasks for a specific project
SELECT * FROM v_tasks_with_calculations
WHERE project_id = 'PRJ-001';

-- Get overdue tasks
SELECT * FROM v_tasks_with_calculations
WHERE deadline < CURRENT_DATE
  AND status NOT IN ('Done', 'Cancelled');
```

---

### 9. VIEW: `v_projects_with_aggregations`

**Purpose:** Projects with all aggregated task metrics (replaces Excel formulas)

**Calculated Fields:**

| Field | Formula | Description |
|-------|---------|-------------|
| `task_hrs_est` | `SUM(tasks.total_est_hrs)` | Sum of all task estimated hours |
| `task_hrs_actual` | `SUM(tasks.total_actual_hrs)` | Sum of all task actual hours |
| `task_hrs_done` | `SUM(tasks.total_actual_hrs WHERE status='Done')` | Sum of done task hours |
| `completion_pct` | `(task_hrs_done / task_hrs_est) × 100` | Project completion percentage |
| `tasks_done_count` | `COUNT(tasks WHERE status='Done')` | Count of completed tasks |
| `tasks_in_progress_count` | `COUNT(tasks WHERE status='In Progress')` | Count of in-progress tasks |
| `tasks_backlog_count` | `COUNT(tasks WHERE status='Backlog')` | Count of backlog tasks |
| `tasks_total_count` | `COUNT(tasks)` | Total task count |
| `status` | See formula below | Project status calculation |
| `days_until_target` | `target_date - CURRENT_DATE` | Days until target date |

**Project Status Calculation:**

```
IF tasks_total_count = 0:
    status = "No Tasks"
ELSE IF tasks_done_count = tasks_total_count:
    status = "Complete"
ELSE IF completion_pct >= 70:
    status = "On Track"
ELSE:
    status = "At Risk"
```

**Usage:**

```sql
-- Get all active projects with metrics
SELECT * FROM v_projects_with_aggregations;

-- Get at-risk projects
SELECT * FROM v_projects_with_aggregations
WHERE status = 'At Risk';

-- Get projects by priority
SELECT * FROM v_projects_with_aggregations
WHERE priority = 'High'
ORDER BY completion_pct ASC;
```

---

### 10. VIEW: `v_resources_with_utilization`

**Purpose:** Resources with calculated allocation and utilization (replaces Excel formulas)

**Calculated Fields:**

| Field | Formula | Description |
|-------|---------|-------------|
| `current_allocation_hrs` | `SUM(tasks.r1_estimate_hrs WHERE resource1 = this) + SUM(tasks.r2_estimate_hrs WHERE resource2 = this)` | Total hours allocated from active tasks |
| `utilization_pct` | `(current_allocation_hrs / weekly_capacity_hrs) × 100` | Utilization percentage |
| `available_hrs` | `weekly_capacity_hrs - current_allocation_hrs` | Available capacity |
| `active_tasks_count` | `COUNT(tasks WHERE status='In Progress')` | Count of active tasks |
| `backlog_tasks_count` | `COUNT(tasks WHERE status='Backlog')` | Count of backlog tasks |

**Usage:**

```sql
-- Get all active resources with utilization
SELECT * FROM v_resources_with_utilization;

-- Get overallocated resources
SELECT * FROM v_resources_with_utilization
WHERE utilization_pct > 100;

-- Get available resources
SELECT * FROM v_resources_with_utilization
WHERE available_hrs > 0
ORDER BY available_hrs DESC;
```

---

### 11. VIEW: `v_dashboard_metrics`

**Purpose:** Single-row dashboard summary metrics for reporting

**Calculated Fields:**

| Field | Description |
|-------|-------------|
| `total_tasks` | Total count of active tasks |
| `tasks_done` | Count of done tasks |
| `tasks_in_progress` | Count of in-progress tasks |
| `tasks_backlog` | Count of backlog tasks |
| `tasks_cancelled` | Count of cancelled tasks |
| `overall_completion_rate_pct` | Overall completion rate (%) |
| `total_estimated_hrs` | Sum of all estimated hours |
| `total_actual_hrs` | Sum of all actual hours |
| `total_hours_variance` | Total variance (actual - estimated) |
| `total_projects` | Total count of active projects |
| `projects_with_tasks` | Count of projects with tasks |
| `projects_complete` | Count of complete projects |
| `projects_on_track` | Count of on-track projects |
| `projects_at_risk` | Count of at-risk projects |
| `active_resources` | Count of active resources |
| `overallocated_resources` | Count of resources over 100% utilization |
| `calculated_at` | Timestamp when calculated |

**Usage:**

```sql
-- Get dashboard summary (returns single row)
SELECT * FROM v_dashboard_metrics;
```

---

### 12. VIEW: `v_audit_trail`

**Purpose:** Human-readable audit trail with display IDs extracted from JSONB

**Features:**

- Extracts display IDs (`project_id`, `task_id`, `resource_name`) from JSONB states
- Extracts display names from JSONB states
- Orders by timestamp descending (most recent first)
- Provides clean interface to audit log

**Usage:**

```sql
-- Get recent audit trail
SELECT * FROM v_audit_trail LIMIT 100;

-- Get audit trail for specific record
SELECT * FROM v_audit_trail
WHERE entity_uuid = '123e4567-e89b-12d3-a456-426614174000';

-- Get audit trail for specific user
SELECT * FROM v_audit_trail
WHERE user_email = 'user@example.com'
  AND timestamp >= NOW() - INTERVAL '7 days';

-- Get changes to a specific field
SELECT * FROM v_audit_trail
WHERE 'status' = ANY(changed_fields);
```

---

## RELATIONSHIPS & FOREIGN KEYS

### Entity Relationship Diagram

```
┌────────────────────┐
│  status_options    │
│  (Configuration)   │
└──────────┬─────────┘
           │ validates
           ↓
┌──────────────────────────────────────────────────────────┐
│                      CORE ENTITIES                       │
│                                                          │
│  ┌──────────────┐       ┌──────────────┐              │
│  │  projects    │       │  resources   │              │
│  │              │       │              │              │
│  │ project_uuid │       │ resource_uuid│              │
│  └──────┬───────┘       └──────┬───────┘              │
│         │                       │                       │
│         │ 1                     │ 1                     │
│         │                       │                       │
│         └───────┐       ┌───────┘                       │
│                 │       │                               │
│                 ↓   N   ↓   N                           │
│         ┌────────────────────────┐                      │
│         │      tasks             │                      │
│         │                        │                      │
│         │ • project_uuid (FK)    │                      │
│         │ • resource1_uuid (FK)  │                      │
│         │ • resource2_uuid (FK)  │                      │
│         └────────────────────────┘                      │
│                 │                                       │
│                 │ generates                             │
│                 ↓                                       │
│         ┌────────────────┐                              │
│         │  audit_log     │                              │
│         │                │                              │
│         │ entity_uuid    │                              │
│         └────────────────┘                              │
└──────────────────────────────────────────────────────────┘
```

---

### Foreign Key Definitions

#### FK-1: `tasks.project_uuid` → `projects.project_uuid`

**Type:** Many-to-One (Composition)
**Cardinality:** N:1 (required)
**Delete Behavior:** RESTRICT
**Update Behavior:** CASCADE

```sql
FOREIGN KEY (project_uuid)
REFERENCES projects(project_uuid)
ON DELETE RESTRICT
ON UPDATE CASCADE
```

**Business Rule:**
- A task MUST belong to exactly one project
- Cannot delete a project if it has tasks (must soft delete or reassign first)
- If project UUID updates (rare), cascade to tasks

---

#### FK-2: `tasks.resource1_uuid` → `resources.resource_uuid`

**Type:** Many-to-One (Association)
**Cardinality:** N:1 (required)
**Delete Behavior:** RESTRICT
**Update Behavior:** CASCADE

```sql
FOREIGN KEY (resource1_uuid)
REFERENCES resources(resource_uuid)
ON DELETE RESTRICT
ON UPDATE CASCADE
```

**Business Rule:**
- A task MUST have at least one resource (Resource 1 is required)
- Cannot delete a resource if assigned as Resource 1 on any task
- Resource must be soft deleted instead

---

#### FK-3: `tasks.resource2_uuid` → `resources.resource_uuid`

**Type:** Many-to-One (Association)
**Cardinality:** N:1 (optional)
**Delete Behavior:** RESTRICT
**Update Behavior:** CASCADE

```sql
FOREIGN KEY (resource2_uuid)
REFERENCES resources(resource_uuid)
ON DELETE RESTRICT
ON UPDATE CASCADE
```

**Business Rule:**
- A task MAY have a second resource (optional)
- Cannot delete a resource if assigned as Resource 2 on any task
- Resource must be soft deleted instead

---

#### FK-4: `status_transitions` → `status_options`

**Type:** Reference (Configuration)
**Cardinality:** N:1
**Delete Behavior:** CASCADE
**Update Behavior:** CASCADE

```sql
-- From status foreign key
FOREIGN KEY (from_status)
REFERENCES status_options(status_name)
ON DELETE CASCADE
ON UPDATE CASCADE

-- To status foreign key
FOREIGN KEY (to_status)
REFERENCES status_options(status_name)
ON DELETE CASCADE
ON UPDATE CASCADE
```

**Business Rule:**
- Status transitions reference valid statuses
- If status option deleted, cascade delete transitions (configuration management)

---

## INDEXES

### Index Strategy

**Principles:**
1. Index all foreign keys for JOIN performance
2. Index soft delete columns (`deleted_at`) for filtering
3. Use partial indexes for active records only (WHERE `deleted_at IS NULL`)
4. Create composite indexes for common query patterns
5. Use GIN indexes for JSONB and array columns

### Index List

#### Projects Table Indexes

```sql
-- Unique display ID for active records
CREATE UNIQUE INDEX idx_projects_project_id_active
ON projects(project_id) WHERE deleted_at IS NULL;

-- Soft deleted records
CREATE INDEX idx_projects_deleted_at
ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

-- Filter by priority
CREATE INDEX idx_projects_priority
ON projects(priority) WHERE deleted_at IS NULL;

-- Date range queries
CREATE INDEX idx_projects_dates
ON projects(start_date, target_date) WHERE deleted_at IS NULL;
```

#### Tasks Table Indexes

```sql
-- Unique display ID for active records
CREATE UNIQUE INDEX idx_tasks_task_id_active
ON tasks(task_id) WHERE deleted_at IS NULL;

-- Foreign key to projects
CREATE INDEX idx_tasks_project_uuid
ON tasks(project_uuid) WHERE deleted_at IS NULL;

-- Filter by status
CREATE INDEX idx_tasks_status
ON tasks(status) WHERE deleted_at IS NULL;

-- Foreign key to resource 1
CREATE INDEX idx_tasks_resource1_uuid
ON tasks(resource1_uuid) WHERE deleted_at IS NULL;

-- Foreign key to resource 2 (only if assigned)
CREATE INDEX idx_tasks_resource2_uuid
ON tasks(resource2_uuid)
WHERE deleted_at IS NULL AND resource2_uuid IS NOT NULL;

-- Soft deleted records
CREATE INDEX idx_tasks_deleted_at
ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- Upcoming deadlines
CREATE INDEX idx_tasks_deadline
ON tasks(deadline)
WHERE deleted_at IS NULL AND status NOT IN ('Done', 'Cancelled');

-- Composite: project + status (common query)
CREATE INDEX idx_tasks_project_status
ON tasks(project_uuid, status) WHERE deleted_at IS NULL;

-- Composite: resource + status (common query)
CREATE INDEX idx_tasks_resource1_status
ON tasks(resource1_uuid, status) WHERE deleted_at IS NULL;

-- GIN index for tags array search
CREATE INDEX idx_tasks_tags
ON tasks USING GIN(tags) WHERE deleted_at IS NULL;
```

#### Resources Table Indexes

```sql
-- Unique name for active records
CREATE UNIQUE INDEX idx_resources_name_active
ON resources(resource_name) WHERE deleted_at IS NULL;

-- Active resources filter
CREATE INDEX idx_resources_active
ON resources(is_active)
WHERE deleted_at IS NULL AND is_active = TRUE;

-- Soft deleted records
CREATE INDEX idx_resources_deleted_at
ON resources(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### Audit Log Indexes

```sql
-- Most recent changes first
CREATE INDEX idx_audit_log_timestamp
ON audit_log(timestamp DESC);

-- Find all changes to a specific record
CREATE INDEX idx_audit_log_entity
ON audit_log(entity_type, entity_uuid);

-- User activity
CREATE INDEX idx_audit_log_user
ON audit_log(user_email, timestamp DESC);

-- Filter by action type
CREATE INDEX idx_audit_log_action
ON audit_log(action);

-- Group related changes
CREATE INDEX idx_audit_log_request_id
ON audit_log(request_id) WHERE request_id IS NOT NULL;

-- Fast JSON queries on states
CREATE INDEX idx_audit_log_before_state
ON audit_log USING GIN(before_state);

CREATE INDEX idx_audit_log_after_state
ON audit_log USING GIN(after_state);
```

#### Configuration Table Indexes

```sql
-- Status options sort order
CREATE INDEX idx_status_options_order
ON status_options(display_order);

-- System config category grouping
CREATE INDEX idx_system_config_category
ON system_config(category);
```

---

## BUSINESS RULES

### Data Validation Rules

#### Rule: Project ID Format
- **Field:** `projects.project_id`
- **Rule:** Must match pattern `PRJ-XXX` where XXX is 3 digits
- **Implementation:** `CHECK (project_id ~ '^PRJ-[0-9]{3}$')`
- **Example:** ✅ `PRJ-001` | ❌ `PRJ-1` | ❌ `PROJ-001`

#### Rule: Task ID Format
- **Field:** `tasks.task_id`
- **Rule:** Must match pattern `TSK-XXX` where XXX is 3 digits
- **Implementation:** `CHECK (task_id ~ '^TSK-[0-9]{3}$')`
- **Example:** ✅ `TSK-001` | ❌ `TSK-1` | ❌ `TASK-001`

#### Rule: Priority Values
- **Field:** `projects.priority`
- **Rule:** Must be one of: `High`, `Medium`, `Low`
- **Implementation:** `CHECK (priority IN ('High', 'Medium', 'Low'))`

#### Rule: Status Values
- **Field:** `tasks.status`
- **Rule:** Must be one of: `Backlog`, `In Progress`, `Done`, `Cancelled`
- **Implementation:** `CHECK (status IN ('Backlog', 'In Progress', 'Done', 'Cancelled'))`

#### Rule: Weight Range
- **Field:** `projects.total_weight`
- **Rule:** Must be between 1 and 5 (inclusive)
- **Implementation:** `CHECK (total_weight BETWEEN 1 AND 5)`

#### Rule: Positive Capacity
- **Field:** `resources.weekly_capacity_hrs`
- **Rule:** Must be greater than 0
- **Implementation:** `CHECK (weekly_capacity_hrs > 0)`

#### Rule: Non-Negative Hours
- **Fields:** `tasks.r1_estimate_hrs`, `r1_actual_hrs`, `r2_estimate_hrs`, `r2_actual_hrs`
- **Rule:** All hour fields must be >= 0
- **Implementation:** `CHECK (r1_estimate_hrs >= 0 AND r1_actual_hrs >= 0 AND r2_estimate_hrs >= 0 AND r2_actual_hrs >= 0)`

#### Rule: Positive Estimate Days
- **Field:** `tasks.estimate_days`
- **Rule:** If provided, must be greater than 0
- **Implementation:** `CHECK (estimate_days IS NULL OR estimate_days > 0)`

#### Rule: Done Task Requirements
- **Fields:** `tasks.status`, `tasks.completed_date`, `tasks.r1_actual_hrs`, `tasks.r2_actual_hrs`
- **Rule:** If status is 'Done', completed_date must be set AND total actual hours must be > 0
- **Implementation:** `CHECK (status != 'Done' OR (completed_date IS NOT NULL AND (r1_actual_hrs + r2_actual_hrs) > 0))`

#### Rule: Logical Date Order
- **Fields:** `tasks.completed_date`, `tasks.created_at`
- **Rule:** Completed date must be on or after creation date
- **Implementation:** `CHECK (completed_date IS NULL OR completed_date >= created_at::DATE)`

#### Rule: Resource 2 Hours Logic
- **Fields:** `tasks.resource2_uuid`, `tasks.r2_estimate_hrs`, `tasks.r2_actual_hrs`
- **Rule:** If Resource 2 is not assigned, both R2 hour fields must be 0
- **Implementation:** `CHECK (resource2_uuid IS NOT NULL OR (r2_estimate_hrs = 0 AND r2_actual_hrs = 0))`

#### Rule: Email Format
- **Field:** `resources.email`
- **Rule:** If provided, must be valid email format
- **Implementation:** `CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')`

---

### Calculated Field Rules

#### Rule: Project Status Calculation
**Formula:**
```
IF tasks_total_count = 0:
    status = "No Tasks"
ELSE IF tasks_done_count = tasks_total_count:
    status = "Complete"
ELSE IF completion_pct >= 70:
    status = "On Track"
ELSE:
    status = "At Risk"
```

**Explanation:**
- Projects with no tasks show "No Tasks"
- Projects where all tasks are done show "Complete"
- Projects with ≥70% completion show "On Track"
- All other projects show "At Risk"

#### Rule: Zero Division Protection
**All percentage calculations must check denominator:**

```sql
-- ✅ Correct
CASE WHEN denominator > 0
     THEN ROUND((numerator / denominator * 100)::NUMERIC, 2)
     ELSE 0
END

-- ❌ Incorrect (can cause division by zero)
ROUND((numerator / denominator * 100)::NUMERIC, 2)
```

**Applies to:**
- `r1_completion_pct`
- `r2_completion_pct`
- `overall_completion_pct`
- `variance_pct`
- `completion_pct` (projects)
- `utilization_pct` (resources)

---

### Status Transition Rules

#### Allowed Transitions

| From Status | To Status | Allowed | Required Fields |
|-------------|-----------|---------|-----------------|
| Backlog | In Progress | ✅ Yes | None |
| Backlog | Cancelled | ✅ Yes | None |
| Backlog | Done | ❌ No | - |
| In Progress | Done | ✅ Yes | `completed_date` |
| In Progress | Cancelled | ✅ Yes | None |
| In Progress | Backlog | ❌ No | - |
| Done | (any) | ❌ No | Terminal state |
| Cancelled | (any) | ❌ No | Terminal state |

#### Transition Validation Function

```sql
-- Check if transition is valid
SELECT fn_validate_status_transition('Backlog', 'In Progress');
-- Returns: TRUE

SELECT fn_validate_status_transition('Done', 'Backlog');
-- Returns: FALSE
```

---

### Referential Integrity Rules

#### Rule: Project Cannot Be Deleted If Has Tasks
- **Constraint:** Foreign key with `ON DELETE RESTRICT`
- **Behavior:** Database will reject DELETE operation if tasks exist
- **Workaround:** Soft delete project instead (set `deleted_at`)

#### Rule: Resource Cannot Be Deleted If Assigned to Tasks
- **Constraint:** Foreign keys on `resource1_uuid` and `resource2_uuid` with `ON DELETE RESTRICT`
- **Behavior:** Database will reject DELETE operation if resource is assigned
- **Workaround:** Soft delete resource instead (set `deleted_at` and `is_active = FALSE`)

#### Rule: Task Must Have Valid Project
- **Constraint:** `tasks.project_uuid` must exist in `projects.project_uuid`
- **Behavior:** Database will reject INSERT/UPDATE if project doesn't exist
- **Validation:** Check project exists before creating task

#### Rule: Task Must Have Valid Resources
- **Constraint:** `tasks.resource1_uuid` and `resource2_uuid` must exist in `resources.resource_uuid`
- **Behavior:** Database will reject INSERT/UPDATE if resource doesn't exist
- **Validation:** Check resources exist before creating/updating task

---

## SOFT DELETE STRATEGY

### Implementation

**All core tables use `deleted_at` timestamp column for soft deletes:**

- `NULL` = Active record
- `TIMESTAMPTZ` value = Soft deleted record

### Soft Delete Pattern

#### Soft Delete (Set deleted_at)

```sql
-- Soft delete a task
UPDATE tasks
SET
    deleted_at = CURRENT_TIMESTAMP,
    deleted_by = 'user@example.com',
    status = 'Cancelled'  -- For tasks specifically
WHERE task_uuid = '123e4567-e89b-12d3-a456-426614174000';
```

#### Restore from Soft Delete

```sql
-- Restore a soft deleted task
UPDATE tasks
SET
    deleted_at = NULL,
    deleted_by = NULL
WHERE task_uuid = '123e4567-e89b-12d3-a456-426614174000';
```

#### Hard Delete (Rare - Admin Only)

```sql
-- Permanently delete (use with caution)
DELETE FROM tasks
WHERE task_uuid = '123e4567-e89b-12d3-a456-426614174000';
```

---

### Soft Delete Rules by Entity

#### Projects
- **Column:** `deleted_at`
- **Additional Actions:**
  - Set `deleted_by` to user email
  - Optionally soft-delete all child tasks (cascade)
- **Business Rule:** Cannot delete if has active tasks (foreign key constraint)

#### Tasks
- **Column:** `deleted_at`
- **Additional Actions:**
  - Set `deleted_by` to user email
  - Set `status = 'Cancelled'`
  - Preserve UUID for audit trail
- **Business Rule:** Always allowed (no dependencies)

#### Resources
- **Column:** `deleted_at`
- **Additional Actions:**
  - Set `deleted_by` to user email
  - Set `is_active = FALSE`
- **Business Rule:** Cannot delete if assigned to active tasks (foreign key constraint)

---

### Query Patterns with Soft Deletes

#### Always Filter Out Soft Deletes

```sql
-- ✅ Correct: Filter deleted_at IS NULL
SELECT * FROM projects WHERE deleted_at IS NULL;

-- ✅ Correct: Views already handle this
SELECT * FROM v_projects_with_aggregations;

-- ❌ Incorrect: Returns deleted records too
SELECT * FROM projects;
```

#### Include Soft Deleted Records (Admin View)

```sql
-- Include all records for audit/admin
SELECT
    project_id,
    project_name,
    CASE
        WHEN deleted_at IS NULL THEN 'Active'
        ELSE 'Deleted'
    END AS record_status,
    deleted_at,
    deleted_by
FROM projects
ORDER BY COALESCE(deleted_at, updated_at) DESC;
```

#### Count Active vs Deleted Records

```sql
-- Count active and deleted projects
SELECT
    COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active_count,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_count
FROM projects;
```

---

### Benefits of Soft Deletes

1. ✅ **Audit Trail** - Preserve history of deleted records
2. ✅ **Undo Capability** - Can restore accidentally deleted records
3. ✅ **Referential Integrity** - Doesn't break foreign key constraints
4. ✅ **Historical Reporting** - Past reports remain accurate
5. ✅ **Compliance** - Meet data retention requirements
6. ✅ **Data Safety** - Prevents accidental permanent data loss

---

## AUDIT LOG STRATEGY

### What Gets Logged

| Action | Trigger | before_state | after_state |
|--------|---------|--------------|-------------|
| **CREATE** | INSERT | NULL | Full record |
| **UPDATE** | UPDATE (normal) | Full record | Full record |
| **DELETE** | UPDATE (soft delete) | Full record | Full record with `deleted_at` |
| **RESTORE** | UPDATE (restore) | Full record with `deleted_at` | Full record without `deleted_at` |

---

### Audit Trigger Flow

```
User Action
    ↓
INSERT/UPDATE/DELETE on table
    ↓
AFTER trigger fires
    ↓
fn_audit_log() function executes
    ↓
Determines action type (CREATE/UPDATE/DELETE/RESTORE)
    ↓
Captures before_state and after_state as JSONB
    ↓
Calculates changed_fields array
    ↓
Inserts record into audit_log
    ↓
Returns control to application
```

---

### Audit Record Structure

#### CREATE Action

```json
{
  "action": "CREATE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "user@example.com",
  "timestamp": "2025-01-15T10:00:00Z",
  "before_state": null,
  "after_state": {
    "task_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "task_id": "TSK-001",
    "project_uuid": "123e4567-e89b-12d3-a456-426614174000",
    "task_name": "Mobile View Testing",
    "status": "Backlog",
    "r1_estimate_hrs": 40,
    "r1_actual_hrs": 0
  },
  "changed_fields": [],
  "change_summary": "Created task: TSK-001 (Mobile View Testing)"
}
```

#### UPDATE Action

```json
{
  "action": "UPDATE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "user@example.com",
  "timestamp": "2025-01-15T14:30:00Z",
  "before_state": {
    "status": "Backlog",
    "r1_actual_hrs": 0
  },
  "after_state": {
    "status": "In Progress",
    "r1_actual_hrs": 5
  },
  "changed_fields": ["status", "r1_actual_hrs"],
  "change_summary": "Updated task: TSK-001"
}
```

#### DELETE Action (Soft Delete)

```json
{
  "action": "DELETE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "user@example.com",
  "timestamp": "2025-01-15T16:00:00Z",
  "before_state": {
    "status": "In Progress",
    "deleted_at": null
  },
  "after_state": {
    "status": "Cancelled",
    "deleted_at": "2025-01-15T16:00:00Z"
  },
  "changed_fields": ["status", "deleted_at"],
  "change_summary": "Soft deleted task: TSK-001"
}
```

---

### Audit Query Examples

#### Get Full History of a Record

```sql
SELECT
    timestamp,
    action,
    user_email,
    changed_fields,
    change_summary
FROM audit_log
WHERE entity_type = 'tasks'
  AND entity_uuid = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY timestamp ASC;
```

#### Compare Before/After States

```sql
SELECT
    timestamp,
    action,
    before_state->>'status' AS old_status,
    after_state->>'status' AS new_status,
    before_state->>'r1_actual_hrs' AS old_hours,
    after_state->>'r1_actual_hrs' AS new_hours,
    user_email
FROM audit_log
WHERE entity_type = 'tasks'
  AND entity_uuid = '550e8400-e29b-41d4-a716-446655440000'
  AND action = 'UPDATE'
ORDER BY timestamp DESC;
```

#### Get All Changes by User

```sql
SELECT
    timestamp,
    entity_type,
    display_id,
    action,
    change_summary
FROM v_audit_trail
WHERE user_email = 'user@example.com'
  AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

#### Find Changes to Specific Field

```sql
-- Find all status changes
SELECT
    timestamp,
    entity_type,
    display_id,
    before_state->>'status' AS old_status,
    after_state->>'status' AS new_status,
    user_email
FROM audit_log
WHERE 'status' = ANY(changed_fields)
ORDER BY timestamp DESC
LIMIT 100;
```

#### Group Related Changes (Transaction)

```sql
-- Find all changes in a single request
SELECT
    timestamp,
    entity_type,
    display_id,
    action,
    change_summary
FROM v_audit_trail
WHERE request_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY timestamp ASC;
```

---

### Audit Retention Policy

**Recommendations:**

- **Short-term (0-90 days):** Keep all audit records in main table with full indexes
- **Medium-term (90 days - 2 years):** Partition by month, keep for compliance
- **Long-term (2+ years):** Archive to cold storage or separate archive table

**Partitioning Strategy (Optional):**

```sql
-- Partition audit_log by month for performance
CREATE TABLE audit_log_y2025m01 PARTITION OF audit_log
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE audit_log_y2025m02 PARTITION OF audit_log
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
-- Continue for each month...
```

---

## MIGRATION MAPPING

### Spreadsheet to Database Mapping

| Spreadsheet Sheet | Database Table/View | Notes |
|-------------------|---------------------|-------|
| **Projects** | `projects` table | Add `project_uuid` as column A (shift all right) |
| **Tasks** | `tasks` table | Add `task_uuid` as column A (shift all right) |
| **Resources** | `resources` table | Add `resource_uuid` as column A (shift all right) |
| **Assumptions** | `status_options` + `system_config` | Split into config tables |
| **Dashboard** | Database views | No table; use `v_*` views |
| **(New)** AUDIT_LOG | `audit_log` table | Create initial import records |

---

### Column Mapping: Projects

| Excel Column | Excel Name | Database Column | Database Type | Notes |
|--------------|------------|-----------------|---------------|-------|
| **(NEW)** A | - | `project_uuid` | UUID | Generate new UUID |
| A → B | Project ID | `project_id` | VARCHAR(20) | Keep as-is |
| B → C | Project Name | `project_name` | VARCHAR(100) | Keep as-is |
| C → D | Total Weight | `total_weight` | INTEGER | Keep as-is |
| K → E | Priority | `priority` | VARCHAR(20) | Keep as-is |
| L → F | Start Date | `start_date` | DATE | Keep as-is |
| M → G | Target Date | `target_date` | DATE | Keep as-is |
| D, E, F | Task Hrs (Est/Actual/Done) | **(NOT STORED)** | - | Calculated in `v_projects_with_aggregations` |
| G, H, I, J | Completion%, Tasks Done/Total, Status | **(NOT STORED)** | - | Calculated in `v_projects_with_aggregations` |

---

### Column Mapping: Tasks

| Excel Column | Excel Name | Database Column | Database Type | Notes |
|--------------|------------|-----------------|---------------|-------|
| **(NEW)** A | - | `task_uuid` | UUID | Generate new UUID |
| A → B | Task ID | `task_id` | VARCHAR(20) | Keep as-is |
| B → C | Project ID | `project_uuid` | UUID | **Lookup** from `projects.project_id` |
| C → D | Task Name | `task_name` | VARCHAR(200) | Keep as-is |
| D → E | Status | `status` | VARCHAR(20) | Keep as-is |
| E → F | Estimate (days) | `estimate_days` | NUMERIC(10,2) | Keep as-is |
| G → - | Resource 1 | `resource1_uuid` | UUID | **Lookup** from `resources.resource_name` |
| H → G | R1 Estimate (hrs) | `r1_estimate_hrs` | NUMERIC(10,2) | Keep as-is |
| I → H | R1 Actual (hrs) | `r1_actual_hrs` | NUMERIC(10,2) | Keep as-is |
| J → - | Resource 2 | `resource2_uuid` | UUID | **Lookup** from `resources.resource_name` |
| K → I | R2 Estimate (hrs) | `r2_estimate_hrs` | NUMERIC(10,2) | Keep as-is |
| L → J | R2 Actual (hrs) | `r2_actual_hrs` | NUMERIC(10,2) | Keep as-is |
| T → K | Deadline | `deadline` | DATE | Keep as-is |
| U → L | Completed Date | `completed_date` | DATE | Keep as-is |
| F, M-S | (Formulas) | **(NOT STORED)** | - | Calculated in `v_tasks_with_calculations` |

---

### Column Mapping: Resources

| Excel Column | Excel Name | Database Column | Database Type | Notes |
|--------------|------------|-----------------|---------------|-------|
| **(NEW)** A | - | `resource_uuid` | UUID | Generate new UUID |
| A → B | Resource Name | `resource_name` | VARCHAR(100) | Keep as-is |
| B → C | Weekly Capacity | `weekly_capacity_hrs` | INTEGER | Keep as-is (default: 40) |
| C, D, E | Allocation/Utilization/Available | **(NOT STORED)** | - | Calculated in `v_resources_with_utilization` |

---

### Migration Process Steps

#### Step 1: Create Database Schema

```sql
-- Run full schema creation script
-- Creates all tables, views, indexes, triggers, functions
```

#### Step 2: Seed Configuration Tables

```sql
-- Insert status_options
-- Insert status_transitions
-- Insert system_config
```

#### Step 3: Import Resources

```sql
INSERT INTO resources (resource_uuid, resource_name, weekly_capacity_hrs, created_by)
SELECT
    gen_random_uuid(),
    resource_name_from_excel,
    COALESCE(weekly_capacity_from_excel, 40),
    'migration_script'
FROM excel_import_resources;
```

#### Step 4: Import Projects

```sql
INSERT INTO projects (
    project_uuid, project_id, project_name, total_weight,
    priority, start_date, target_date, created_by
)
SELECT
    gen_random_uuid(),
    project_id_from_excel,
    project_name_from_excel,
    total_weight_from_excel,
    priority_from_excel,
    start_date_from_excel,
    target_date_from_excel,
    'migration_script'
FROM excel_import_projects;
```

#### Step 5: Import Tasks (with FK Lookups)

```sql
INSERT INTO tasks (
    task_uuid, task_id, project_uuid, resource1_uuid, resource2_uuid,
    task_name, status, estimate_days,
    r1_estimate_hrs, r1_actual_hrs, r2_estimate_hrs, r2_actual_hrs,
    deadline, completed_date, created_by
)
SELECT
    gen_random_uuid(),
    t.task_id_from_excel,
    p.project_uuid,                    -- FK lookup
    r1.resource_uuid,                  -- FK lookup
    r2.resource_uuid,                  -- FK lookup
    t.task_name_from_excel,
    t.status_from_excel,
    t.estimate_days_from_excel,
    t.r1_estimate_hrs_from_excel,
    t.r1_actual_hrs_from_excel,
    t.r2_estimate_hrs_from_excel,
    t.r2_actual_hrs_from_excel,
    t.deadline_from_excel,
    t.completed_date_from_excel,
    'migration_script'
FROM excel_import_tasks t
INNER JOIN projects p
    ON t.project_id_from_excel = p.project_id
INNER JOIN resources r1
    ON t.resource1_name_from_excel = r1.resource_name
LEFT JOIN resources r2
    ON t.resource2_name_from_excel = r2.resource_name;
```

#### Step 6: Create Initial Audit Records

```sql
-- Log initial import as CREATE actions
INSERT INTO audit_log (
    action, entity_type, entity_uuid, user_email,
    before_state, after_state, change_summary
)
SELECT
    'CREATE',
    'tasks',
    task_uuid,
    'migration_script',
    NULL,
    to_jsonb(tasks.*),
    'Imported from Excel: ' || task_id
FROM tasks;
```

#### Step 7: Verify Data Integrity

```sql
-- Verify formulas match original spreadsheet
SELECT * FROM v_projects_with_aggregations;
SELECT * FROM v_tasks_with_calculations;
SELECT * FROM v_resources_with_utilization;
SELECT * FROM v_dashboard_metrics;

-- Compare totals
SELECT
    SUM(task_hrs_est) AS db_total_est,
    SUM(task_hrs_actual) AS db_total_actual
FROM v_projects_with_aggregations;
-- Compare with Excel totals
```

---

## SAMPLE QUERIES

### Common Query Patterns

#### Get All Active Projects with Metrics

```sql
SELECT
    project_id,
    project_name,
    priority,
    task_hrs_est,
    task_hrs_actual,
    completion_pct,
    tasks_done_count || '/' || tasks_total_count AS tasks_progress,
    status,
    days_until_target
FROM v_projects_with_aggregations
ORDER BY completion_pct ASC;
```

#### Get At-Risk Projects

```sql
SELECT
    project_id,
    project_name,
    completion_pct,
    tasks_total_count,
    days_until_target
FROM v_projects_with_aggregations
WHERE status = 'At Risk'
ORDER BY days_until_target ASC;
```

#### Get Overdue Tasks

```sql
SELECT
    task_id,
    task_name,
    project_id,
    project_name,
    resource1_name,
    status,
    deadline,
    days_until_deadline
FROM v_tasks_with_calculations
WHERE deadline < CURRENT_DATE
  AND status NOT IN ('Done', 'Cancelled')
ORDER BY deadline ASC;
```

#### Get Overallocated Resources

```sql
SELECT
    resource_name,
    email,
    weekly_capacity_hrs,
    current_allocation_hrs,
    utilization_pct,
    active_tasks_count,
    available_hrs
FROM v_resources_with_utilization
WHERE utilization_pct > 100
ORDER BY utilization_pct DESC;
```

#### Get Tasks by Status for a Project

```sql
SELECT
    status,
    COUNT(*) AS task_count,
    ROUND(SUM(total_est_hrs), 2) AS total_est_hrs,
    ROUND(SUM(total_actual_hrs), 2) AS total_actual_hrs
FROM v_tasks_with_calculations
WHERE project_id = 'PRJ-001'
GROUP BY status
ORDER BY
    CASE status
        WHEN 'Backlog' THEN 1
        WHEN 'In Progress' THEN 2
        WHEN 'Done' THEN 3
        WHEN 'Cancelled' THEN 4
    END;
```

#### Get Resource Workload by Project

```sql
SELECT
    r.resource_name,
    p.project_id,
    p.project_name,
    COUNT(t.task_uuid) AS task_count,
    ROUND(SUM(
        CASE WHEN t.resource1_uuid = r.resource_uuid
        THEN t.r1_estimate_hrs ELSE t.r2_estimate_hrs END
    ), 2) AS allocated_hrs
FROM resources r
CROSS JOIN projects p
LEFT JOIN tasks t
    ON p.project_uuid = t.project_uuid
    AND (t.resource1_uuid = r.resource_uuid OR t.resource2_uuid = r.resource_uuid)
    AND t.deleted_at IS NULL
    AND t.status NOT IN ('Done', 'Cancelled')
WHERE r.deleted_at IS NULL
  AND p.deleted_at IS NULL
GROUP BY r.resource_name, p.project_id, p.project_name
HAVING COUNT(t.task_uuid) > 0
ORDER BY r.resource_name, allocated_hrs DESC;
```

#### Get Top 10 Tasks by Variance

```sql
-- Tasks most over budget
SELECT
    task_id,
    task_name,
    project_name,
    total_est_hrs,
    total_actual_hrs,
    hours_variance,
    variance_pct
FROM v_tasks_with_calculations
WHERE status = 'Done'
ORDER BY hours_variance DESC
LIMIT 10;
```

#### Get Dashboard Summary

```sql
-- Single row with all dashboard metrics
SELECT * FROM v_dashboard_metrics;
```

#### Search Tasks by Keyword

```sql
-- Search in task name or description
SELECT
    task_id,
    task_name,
    project_name,
    status,
    resource1_name
FROM v_tasks_with_calculations
WHERE
    task_name ILIKE '%mobile%'
    OR description ILIKE '%mobile%'
ORDER BY created_at DESC;
```

#### Get Tasks by Tag

```sql
-- Find tasks with specific tag (using array search)
SELECT
    task_id,
    task_name,
    project_name,
    tags,
    status
FROM v_tasks_with_calculations
WHERE 'urgent' = ANY(tags)
ORDER BY deadline ASC;
```

#### Get Audit History for a Task

```sql
-- Full change history for a specific task
SELECT
    timestamp,
    action,
    user_email,
    changed_fields,
    change_summary,
    before_state,
    after_state
FROM v_audit_trail
WHERE display_id = 'TSK-001'
ORDER BY timestamp ASC;
```

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] PostgreSQL 14+ installed and running
- [ ] Database created with appropriate user permissions
- [ ] Extensions enabled: `uuid-ossp`, `pgcrypto`, `btree_gist`
- [ ] Backup strategy defined
- [ ] Migration scripts prepared from Excel data

### Deployment

- [ ] Run schema creation script (all CREATE TABLE statements)
- [ ] Verify all tables created successfully
- [ ] Run seed data script (status_options, status_transitions, system_config)
- [ ] Create all views (5 views)
- [ ] Create all indexes (30+ indexes)
- [ ] Create all triggers (7 triggers)
- [ ] Create all functions (4 functions)
- [ ] Run ANALYZE on all tables
- [ ] Verify foreign keys with verification query
- [ ] Verify indexes with verification query

### Post-Deployment

- [ ] Import data from Excel (resources → projects → tasks)
- [ ] Create initial audit records
- [ ] Verify calculations match Excel formulas
- [ ] Run sample queries to test performance
- [ ] Set up automated backups (daily)
- [ ] Configure monitoring and alerts
- [ ] Document connection strings and credentials (secure storage)
- [ ] Train team on new system

### Verification Queries

```sql
-- 1. Verify all tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'qc_planning' ORDER BY table_name;

-- 2. Verify all views
SELECT table_name FROM information_schema.views
WHERE table_schema = 'qc_planning' ORDER BY table_name;

-- 3. Verify all indexes
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'qc_planning' ORDER BY tablename;

-- 4. Verify triggers
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'qc_planning';

-- 5. Verify foreign keys
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'qc_planning';

-- 6. Test views
SELECT * FROM v_dashboard_metrics;
SELECT COUNT(*) FROM v_projects_with_aggregations;
SELECT COUNT(*) FROM v_tasks_with_calculations;
SELECT COUNT(*) FROM v_resources_with_utilization;
```

---

## PERFORMANCE OPTIMIZATION

### Best Practices

1. ✅ **Always filter by `deleted_at IS NULL`** in queries
2. ✅ **Use views instead of raw tables** for derived calculations
3. ✅ **Use partial indexes** for active records only
4. ✅ **Run ANALYZE regularly** to update query planner statistics
5. ✅ **Consider materialized views** for expensive aggregations
6. ✅ **Use JSONB operators** for efficient audit log queries
7. ✅ **Partition audit_log** by month for large datasets
8. ✅ **Monitor slow queries** with `pg_stat_statements`

### Maintenance Commands

```sql
-- Analyze tables (update statistics)
ANALYZE projects;
ANALYZE tasks;
ANALYZE resources;
ANALYZE audit_log;

-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'qc_planning'
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT
    schemaname,
    tablename,
    indexname
FROM pg_stat_user_indexes
WHERE schemaname = 'qc_planning'
  AND idx_scan = 0
  AND indexname NOT LIKE '%pkey';
```

---

## BACKUP & RESTORE

### Backup Commands

```bash
# Full database backup (compressed)
pg_dump -h localhost -U postgres -d qc_planning_db \
  -F c -f qc_planning_$(date +%Y%m%d).dump

# Schema-only backup
pg_dump -h localhost -U postgres -d qc_planning_db \
  -s -f qc_planning_schema.sql

# Data-only backup
pg_dump -h localhost -U postgres -d qc_planning_db \
  -a -f qc_planning_data.sql

# Specific schema backup
pg_dump -h localhost -U postgres -d qc_planning_db \
  -n qc_planning -F c -f qc_planning_schema_backup.dump
```

### Restore Commands

```bash
# Restore from compressed backup
pg_restore -h localhost -U postgres -d qc_planning_db \
  -c qc_planning_20250115.dump

# Restore schema only
psql -h localhost -U postgres -d qc_planning_db \
  -f qc_planning_schema.sql

# Restore data only
psql -h localhost -U postgres -d qc_planning_db \
  -f qc_planning_data.sql
```

---

## CONCLUSION

This relational database schema provides a **production-ready foundation** for the QC Scenario Planning system with:

✅ Enterprise-grade data integrity (foreign keys, constraints, validation)
✅ Complete audit trail with JSONB state capture
✅ Soft delete support for data safety
✅ Real-time calculated fields via database views
✅ PostgreSQL-specific optimizations (UUID, TIMESTAMPTZ, JSONB, arrays)
✅ Comprehensive indexing for query performance
✅ Clear migration path from Excel spreadsheets
✅ Scalable architecture for future growth

**Next Steps:**
1. Deploy schema to PostgreSQL database
2. Migrate data from Excel spreadsheets
3. Build backend API layer (Node.js/Python/etc.)
4. Implement business logic and validation
5. Create frontend interface
6. Set up monitoring and backups

---

**Document Version:** 1.0
**Last Updated:** January 2025
**Database:** PostgreSQL 14+
**Schema Version:** qc_planning v1.0
