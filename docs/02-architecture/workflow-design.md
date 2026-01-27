# QC SCENARIO PLANNING - N8N WORKFLOW ARCHITECTURE

**Version:** 1.0
**Date:** January 2025
**Purpose:** Automation workflows for QC task and project management system
**Platform:** n8n (Node-based workflow automation)

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Workflow Categorization](#workflow-categorization)
3. [Core CRUD Workflows](#core-crud-workflows)
4. [Automation Workflows](#automation-workflows)
5. [Reporting Workflows](#reporting-workflows)
6. [Notification Workflows](#notification-workflows)
7. [Reusable Sub-Workflows](#reusable-sub-workflows)
8. [Audit Logging Flow](#audit-logging-flow)
9. [Workflow Implementation Guide](#workflow-implementation-guide)
10. [Error Handling Strategy](#error-handling-strategy)

---

## ARCHITECTURE OVERVIEW

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND APPLICATION                     │
│              (React/Vue/Angular - NOT n8n)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/REST
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    N8N WORKFLOW ENGINE                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   WEBHOOK    │  │   SCHEDULE   │  │   MANUAL     │    │
│  │   Workflows  │  │   Workflows  │  │   Workflows  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            │                                │
│         ┌──────────────────┴──────────────────┐            │
│         │      Reusable Sub-Workflows         │            │
│         │  • Validation                       │            │
│         │  • Audit Logging                    │            │
│         │  • Email Sending                    │            │
│         │  • Status Transition Check          │            │
│         └──────────────────┬──────────────────┘            │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ SQL
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                       │
│                                                              │
│  projects │ tasks │ resources │ audit_log │ views           │
└─────────────────────────────────────────────────────────────┘
```

### N8N Role in System

**What N8N Handles:**
- ✅ **API Layer** - REST endpoints via webhooks
- ✅ **Business Logic** - Validation, calculations, status transitions
- ✅ **Scheduled Jobs** - Daily reports, weekly summaries, deadline alerts
- ✅ **Notifications** - Email alerts for overdue tasks, resource overload
- ✅ **Audit Logging** - Centralized audit trail for all mutations
- ✅ **Data Exports** - Generate PDF/Excel reports
- ✅ **Integrations** - Connect to external systems (Slack, Teams, etc.)

**What N8N Does NOT Handle:**
- ❌ Frontend rendering (handled by separate UI framework)
- ❌ User authentication (handled by separate auth service or frontend)
- ❌ File storage (handled by external service like AWS S3)
- ❌ Real-time websockets (handled by separate service if needed)

---

## WORKFLOW CATEGORIZATION

### Workflow Categories

| Category | Count | Description |
|----------|-------|-------------|
| **CRUD Workflows** | 12 | Create, Read, Update, Delete operations for entities |
| **Automation Workflows** | 8 | Scheduled tasks, status updates, calculations |
| **Reporting Workflows** | 5 | Generate reports, dashboards, exports |
| **Notification Workflows** | 6 | Email/Slack alerts for events |
| **Sub-Workflows** | 7 | Reusable components called by other workflows |
| **TOTAL** | **38** | Complete workflow ecosystem |

---

## CORE CRUD WORKFLOWS

### WF-001: Create Project

**Purpose:** Create a new project with validation and audit logging

**Trigger:** Webhook (POST)
**Endpoint:** `POST /api/projects`

**Input:**
```json
{
  "project_id": "PRJ-003",
  "project_name": "Mobile App",
  "total_weight": 3,
  "priority": "High",
  "start_date": "2025-01-15",
  "target_date": "2025-03-15",
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**
   - Receive POST request
   - Parse JSON body
   - Extract user context

2. **Input Validation (Sub-Workflow)**
   - Call `SW-001: Validate Project Data`
   - Check required fields
   - Validate format (project_id pattern)
   - Validate ranges (total_weight 1-5)
   - Validate dates (target_date >= start_date)

3. **Check Uniqueness**
   - Query: `SELECT COUNT(*) FROM projects WHERE project_id = {{$json.project_id}} AND deleted_at IS NULL`
   - If count > 0, return error: "Project ID already exists"

4. **Generate UUID**
   - Use `gen_random_uuid()` function
   - Store in variable: `project_uuid`

5. **Insert Record**
   - SQL Insert:
   ```sql
   INSERT INTO projects (
     project_uuid, project_id, project_name, total_weight,
     priority, start_date, target_date, created_by
   ) VALUES (
     $1, $2, $3, $4, $5, $6, $7, $8
   ) RETURNING *;
   ```

6. **Audit Logging (Sub-Workflow)**
   - Call `SW-002: Log Audit Record`
   - Action: CREATE
   - Entity: projects
   - Before: null
   - After: full record

7. **Return Response**
   ```json
   {
     "success": true,
     "data": {
       "project_uuid": "uuid-here",
       "project_id": "PRJ-003",
       "project_name": "Mobile App",
       "created_at": "2025-01-15T10:00:00Z"
     },
     "message": "Project created successfully"
   }
   ```

**Output:** Project object with UUID and timestamps

**Error Handling:**
- Validation errors → 400 Bad Request
- Duplicate ID → 409 Conflict
- Database errors → 500 Internal Server Error

---

### WF-002: Get Project by ID

**Purpose:** Retrieve project details with aggregated metrics

**Trigger:** Webhook (GET)
**Endpoint:** `GET /api/projects/:project_id`

**Input:**
- Path parameter: `project_id` (e.g., "PRJ-001")
- Query parameter (optional): `include_tasks=true`

**Steps:**

1. **Webhook Trigger**
   - Receive GET request
   - Extract `project_id` from path

2. **Query Database**
   - SQL Query:
   ```sql
   SELECT * FROM v_projects_with_aggregations
   WHERE project_id = $1;
   ```

3. **Check Existence**
   - If no rows returned, return 404 Not Found

4. **Fetch Tasks (Optional)**
   - If `include_tasks=true`:
   ```sql
   SELECT * FROM v_tasks_with_calculations
   WHERE project_id = $1
   ORDER BY status, deadline;
   ```

5. **Build Response**
   ```json
   {
     "success": true,
     "data": {
       "project": { /* project object */ },
       "tasks": [ /* array of tasks */ ]
     }
   }
   ```

**Output:** Project object with optional tasks array

---

### WF-003: Update Project

**Purpose:** Update project fields with validation and audit logging

**Trigger:** Webhook (PUT/PATCH)
**Endpoint:** `PUT /api/projects/:project_id`

**Input:**
```json
{
  "project_name": "Updated Name",
  "priority": "Critical",
  "target_date": "2025-04-01",
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**
   - Receive PUT/PATCH request
   - Extract `project_id` from path
   - Parse JSON body

2. **Fetch Current State**
   ```sql
   SELECT * FROM projects
   WHERE project_id = $1 AND deleted_at IS NULL;
   ```
   - If not found, return 404

3. **Input Validation (Sub-Workflow)**
   - Call `SW-001: Validate Project Data`
   - Only validate provided fields

4. **Detect Changes**
   - Compare old values with new values
   - Build array of changed fields
   - If no changes, return 304 Not Modified

5. **Update Record**
   ```sql
   UPDATE projects
   SET
     project_name = COALESCE($1, project_name),
     priority = COALESCE($2, priority),
     target_date = COALESCE($3, target_date),
     updated_at = CURRENT_TIMESTAMP,
     updated_by = $4
   WHERE project_uuid = $5
   RETURNING *;
   ```

6. **Audit Logging (Sub-Workflow)**
   - Call `SW-002: Log Audit Record`
   - Action: UPDATE
   - Before: old state
   - After: new state
   - Changed fields: array

7. **Return Response**
   ```json
   {
     "success": true,
     "data": { /* updated project */ },
     "message": "Project updated successfully"
   }
   ```

**Output:** Updated project object

---

### WF-004: Soft Delete Project

**Purpose:** Soft delete project (set deleted_at timestamp)

**Trigger:** Webhook (DELETE)
**Endpoint:** `DELETE /api/projects/:project_id`

**Input:**
- Path parameter: `project_id`
- Body: `{ "user_email": "user@example.com" }`

**Steps:**

1. **Webhook Trigger**
   - Receive DELETE request
   - Extract `project_id`

2. **Check for Active Tasks**
   ```sql
   SELECT COUNT(*) FROM tasks
   WHERE project_uuid = (
     SELECT project_uuid FROM projects WHERE project_id = $1
   ) AND deleted_at IS NULL;
   ```
   - If count > 0, return error: "Cannot delete project with active tasks"

3. **Fetch Current State**
   ```sql
   SELECT * FROM projects
   WHERE project_id = $1 AND deleted_at IS NULL;
   ```
   - If not found, return 404

4. **Soft Delete**
   ```sql
   UPDATE projects
   SET
     deleted_at = CURRENT_TIMESTAMP,
     deleted_by = $1
   WHERE project_uuid = $2
   RETURNING *;
   ```

5. **Audit Logging (Sub-Workflow)**
   - Call `SW-002: Log Audit Record`
   - Action: DELETE
   - Before: old state
   - After: state with deleted_at

6. **Return Response**
   ```json
   {
     "success": true,
     "message": "Project deleted successfully"
   }
   ```

**Output:** Success confirmation

---

### WF-005: Create Task

**Purpose:** Create new task with resource assignment and validation

**Trigger:** Webhook (POST)
**Endpoint:** `POST /api/tasks`

**Input:**
```json
{
  "task_id": "TSK-010",
  "project_id": "PRJ-001",
  "task_name": "API Testing",
  "status": "Backlog",
  "estimate_days": 3,
  "resource1_name": "Basel",
  "r1_estimate_hrs": 24,
  "resource2_name": "Belal",
  "r2_estimate_hrs": 16,
  "deadline": "2025-02-15",
  "description": "Test all API endpoints",
  "tags": ["testing", "api"],
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**
   - Receive POST request
   - Parse JSON body

2. **Input Validation (Sub-Workflow)**
   - Call `SW-003: Validate Task Data`
   - Required fields check
   - Format validation
   - Range validation

3. **Lookup Foreign Keys**
   - **Project UUID:**
   ```sql
   SELECT project_uuid FROM projects
   WHERE project_id = $1 AND deleted_at IS NULL;
   ```
   - If not found, return error: "Project not found"

   - **Resource 1 UUID:**
   ```sql
   SELECT resource_uuid FROM resources
   WHERE resource_name = $1 AND deleted_at IS NULL;
   ```
   - If not found, return error: "Resource 1 not found"

   - **Resource 2 UUID (if provided):**
   ```sql
   SELECT resource_uuid FROM resources
   WHERE resource_name = $1 AND deleted_at IS NULL;
   ```

4. **Check Uniqueness**
   ```sql
   SELECT COUNT(*) FROM tasks
   WHERE task_id = $1 AND deleted_at IS NULL;
   ```
   - If count > 0, return error: "Task ID already exists"

5. **Check Resource Availability (Sub-Workflow)**
   - Call `SW-004: Check Resource Capacity`
   - Warn if resource will be overallocated

6. **Generate UUID**
   - Use `gen_random_uuid()`

7. **Insert Record**
   ```sql
   INSERT INTO tasks (
     task_uuid, task_id, project_uuid, resource1_uuid, resource2_uuid,
     task_name, status, estimate_days, r1_estimate_hrs, r1_actual_hrs,
     r2_estimate_hrs, r2_actual_hrs, deadline, description, tags, created_by
   ) VALUES (
     $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, 0, $11, $12, $13, $14
   ) RETURNING *;
   ```

8. **Audit Logging (Sub-Workflow)**
   - Call `SW-002: Log Audit Record`
   - Action: CREATE

9. **Send Notification (Async)**
   - Call `SW-005: Send Task Assignment Email`
   - Notify assigned resources

10. **Return Response**
    ```json
    {
      "success": true,
      "data": {
        "task_uuid": "uuid-here",
        "task_id": "TSK-010",
        "created_at": "2025-01-15T10:00:00Z"
      },
      "warnings": [
        "Resource Basel will be at 105% capacity"
      ],
      "message": "Task created successfully"
    }
    ```

**Output:** Task object with warnings array

---

### WF-006: Update Task Status

**Purpose:** Update task status with transition validation

**Trigger:** Webhook (PATCH)
**Endpoint:** `PATCH /api/tasks/:task_id/status`

**Input:**
```json
{
  "status": "In Progress",
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**
   - Receive PATCH request
   - Extract `task_id` from path

2. **Fetch Current State**
   ```sql
   SELECT * FROM tasks
   WHERE task_id = $1 AND deleted_at IS NULL;
   ```
   - If not found, return 404

3. **Validate Status Transition (Sub-Workflow)**
   - Call `SW-006: Validate Status Transition`
   - Check if transition is allowed
   - Old status: "Backlog"
   - New status: "In Progress"
   - Query `status_transitions` table

4. **Check Required Fields**
   - If new status is "Done":
     - Check `completed_date` is provided
     - Check `total_actual_hrs > 0`
   - If missing, return error with required fields

5. **Update Record**
   ```sql
   UPDATE tasks
   SET
     status = $1,
     completed_date = CASE WHEN $1 = 'Done' THEN $2 ELSE completed_date END,
     updated_at = CURRENT_TIMESTAMP,
     updated_by = $3
   WHERE task_uuid = $4
   RETURNING *;
   ```

6. **Audit Logging (Sub-Workflow)**
   - Call `SW-002: Log Audit Record`
   - Action: UPDATE
   - Changed fields: ["status"]

7. **Trigger Downstream Actions**
   - If status → "Done":
     - Call `WF-021: Update Project Completion`
     - Call `SW-005: Send Task Completion Email`
   - If status → "Cancelled":
     - Call `WF-022: Recalculate Resource Allocation`

8. **Return Response**
   ```json
   {
     "success": true,
     "data": { /* updated task */ },
     "message": "Task status updated to In Progress"
   }
   ```

**Output:** Updated task object

---

### WF-007: Update Task Hours

**Purpose:** Update actual hours worked with automatic calculations

**Trigger:** Webhook (PATCH)
**Endpoint:** `PATCH /api/tasks/:task_id/hours`

**Input:**
```json
{
  "r1_actual_hrs": 10,
  "r2_actual_hrs": 5,
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**
   - Receive PATCH request
   - Extract `task_id` from path

2. **Input Validation**
   - Check `r1_actual_hrs >= 0`
   - Check `r2_actual_hrs >= 0`

3. **Fetch Current State**
   ```sql
   SELECT * FROM tasks
   WHERE task_id = $1 AND deleted_at IS NULL;
   ```

4. **Update Hours**
   ```sql
   UPDATE tasks
   SET
     r1_actual_hrs = $1,
     r2_actual_hrs = $2,
     updated_at = CURRENT_TIMESTAMP,
     updated_by = $3
   WHERE task_uuid = $4
   RETURNING *;
   ```

5. **Fetch Calculated Fields**
   ```sql
   SELECT
     total_actual_hrs,
     overall_completion_pct,
     hours_variance,
     variance_pct
   FROM v_tasks_with_calculations
   WHERE task_uuid = $1;
   ```

6. **Audit Logging (Sub-Workflow)**
   - Call `SW-002: Log Audit Record`

7. **Check for Alerts**
   - If `variance_pct > 50`:
     - Call `SW-007: Send Over-Budget Alert`

8. **Return Response**
   ```json
   {
     "success": true,
     "data": {
       "task_uuid": "uuid-here",
       "r1_actual_hrs": 10,
       "r2_actual_hrs": 5,
       "total_actual_hrs": 15,
       "overall_completion_pct": 37.5,
       "hours_variance": -25,
       "variance_pct": -62.5
     },
     "message": "Task hours updated successfully"
   }
   ```

**Output:** Task with calculated fields

---

### WF-008: Get All Tasks (with Filters)

**Purpose:** List tasks with optional filtering, sorting, pagination

**Trigger:** Webhook (GET)
**Endpoint:** `GET /api/tasks`

**Input (Query Parameters):**
```
?project_id=PRJ-001
&status=In Progress
&resource_name=Basel
&deadline_before=2025-02-01
&page=1
&per_page=20
&sort_by=deadline
&sort_order=asc
```

**Steps:**

1. **Webhook Trigger**
   - Receive GET request
   - Parse query parameters

2. **Build Dynamic Query**
   - Start with base:
   ```sql
   SELECT * FROM v_tasks_with_calculations
   WHERE deleted_at IS NULL
   ```

3. **Apply Filters**
   - If `project_id`: `AND project_id = $1`
   - If `status`: `AND status = $2`
   - If `resource_name`: `AND (resource1_name = $3 OR resource2_name = $3)`
   - If `deadline_before`: `AND deadline < $4`
   - If `search`: `AND (task_name ILIKE $5 OR description ILIKE $5)`

4. **Apply Sorting**
   - Default: `ORDER BY created_at DESC`
   - If `sort_by` provided: `ORDER BY {{sort_by}} {{sort_order}}`

5. **Apply Pagination**
   - Calculate offset: `(page - 1) * per_page`
   - Add: `LIMIT $x OFFSET $y`

6. **Get Total Count**
   ```sql
   SELECT COUNT(*) FROM v_tasks_with_calculations
   WHERE /* same filters */;
   ```

7. **Return Response**
   ```json
   {
     "success": true,
     "data": {
       "tasks": [ /* array of tasks */ ],
       "pagination": {
         "page": 1,
         "per_page": 20,
         "total": 156,
         "total_pages": 8
       }
     }
   }
   ```

**Output:** Paginated task list with metadata

---

### WF-009: Create Resource

**Purpose:** Create new resource with capacity validation

**Trigger:** Webhook (POST)
**Endpoint:** `POST /api/resources`

**Input:**
```json
{
  "resource_name": "Ahmed",
  "weekly_capacity_hrs": 40,
  "email": "ahmed@example.com",
  "department": "QA",
  "role": "Senior Tester",
  "is_active": true,
  "user_email": "admin@example.com"
}
```

**Steps:**

1. **Webhook Trigger**
   - Parse JSON body

2. **Input Validation**
   - Required: `resource_name`, `weekly_capacity_hrs`
   - Email format validation
   - Capacity > 0

3. **Check Uniqueness**
   ```sql
   SELECT COUNT(*) FROM resources
   WHERE resource_name = $1 AND deleted_at IS NULL;
   ```

4. **Generate UUID**

5. **Insert Record**
   ```sql
   INSERT INTO resources (
     resource_uuid, resource_name, weekly_capacity_hrs,
     email, department, role, is_active, created_by
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   RETURNING *;
   ```

6. **Audit Logging**

7. **Return Response**

**Output:** Resource object

---

### WF-010: Update Resource Capacity

**Purpose:** Update resource weekly capacity with allocation check

**Trigger:** Webhook (PATCH)
**Endpoint:** `PATCH /api/resources/:resource_name/capacity`

**Input:**
```json
{
  "weekly_capacity_hrs": 32,
  "user_email": "admin@example.com"
}
```

**Steps:**

1. **Webhook Trigger**

2. **Fetch Current State + Allocation**
   ```sql
   SELECT * FROM v_resources_with_utilization
   WHERE resource_name = $1;
   ```

3. **Check New Capacity vs Current Allocation**
   - If `new_capacity < current_allocation`:
     - Return warning: "New capacity is less than current allocation (X hrs)"
     - Require confirmation flag

4. **Update Record**
   ```sql
   UPDATE resources
   SET
     weekly_capacity_hrs = $1,
     updated_at = CURRENT_TIMESTAMP,
     updated_by = $2
   WHERE resource_uuid = $3
   RETURNING *;
   ```

5. **Audit Logging**

6. **Recalculate Utilization**
   ```sql
   SELECT * FROM v_resources_with_utilization
   WHERE resource_uuid = $1;
   ```

7. **Return Response**

**Output:** Updated resource with new utilization

---

### WF-011: Get Dashboard Metrics

**Purpose:** Retrieve real-time dashboard summary

**Trigger:** Webhook (GET)
**Endpoint:** `GET /api/dashboard`

**Input:** None (or optional date range filters)

**Steps:**

1. **Webhook Trigger**

2. **Query Dashboard View**
   ```sql
   SELECT * FROM v_dashboard_metrics;
   ```

3. **Query Project Summary**
   ```sql
   SELECT
     status,
     COUNT(*) AS count,
     ROUND(AVG(completion_pct), 2) AS avg_completion
   FROM v_projects_with_aggregations
   GROUP BY status;
   ```

4. **Query Resource Summary**
   ```sql
   SELECT
     CASE
       WHEN utilization_pct > 100 THEN 'Overallocated'
       WHEN utilization_pct > 80 THEN 'High'
       WHEN utilization_pct > 50 THEN 'Medium'
       ELSE 'Low'
     END AS utilization_level,
     COUNT(*) AS count
   FROM v_resources_with_utilization
   GROUP BY utilization_level;
   ```

5. **Query Upcoming Deadlines**
   ```sql
   SELECT * FROM v_tasks_with_calculations
   WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     AND status NOT IN ('Done', 'Cancelled')
   ORDER BY deadline ASC
   LIMIT 10;
   ```

6. **Build Response**
   ```json
   {
     "success": true,
     "data": {
       "summary": { /* dashboard_metrics */ },
       "projects_by_status": [ /* grouped counts */ ],
       "resources_by_utilization": [ /* grouped counts */ ],
       "upcoming_deadlines": [ /* tasks */ ]
     }
   }
   ```

**Output:** Comprehensive dashboard data

---

### WF-012: Soft Delete Task

**Purpose:** Soft delete task (set to Cancelled status and deleted_at)

**Trigger:** Webhook (DELETE)
**Endpoint:** `DELETE /api/tasks/:task_id`

**Input:**
- Path: `task_id`
- Body: `{ "user_email": "user@example.com" }`

**Steps:**

1. **Webhook Trigger**

2. **Fetch Current State**

3. **Soft Delete**
   ```sql
   UPDATE tasks
   SET
     status = 'Cancelled',
     deleted_at = CURRENT_TIMESTAMP,
     deleted_by = $1
   WHERE task_uuid = $2
   RETURNING *;
   ```

4. **Audit Logging**

5. **Trigger Recalculations**
   - Project metrics will auto-update via views
   - Resource allocation will auto-update via views

6. **Return Response**

**Output:** Success confirmation

---

## AUTOMATION WORKFLOWS

### WF-013: Daily Deadline Reminder

**Purpose:** Send email reminders for tasks due in next 3 days

**Trigger:** Schedule (Cron)
**Schedule:** Every day at 9:00 AM

**Input:** None (scheduled)

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 9 * * *` (9 AM daily)

2. **Query Upcoming Deadlines**
   ```sql
   SELECT
     t.task_id,
     t.task_name,
     t.deadline,
     t.days_until_deadline,
     p.project_name,
     r1.resource_name AS resource1_name,
     r1.email AS resource1_email,
     r2.resource_name AS resource2_name,
     r2.email AS resource2_email
   FROM v_tasks_with_calculations t
   INNER JOIN projects p ON t.project_uuid = p.project_uuid
   INNER JOIN resources r1 ON t.resource1_uuid = r1.resource_uuid
   LEFT JOIN resources r2 ON t.resource2_uuid = r2.resource_uuid
   WHERE t.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
     AND t.status NOT IN ('Done', 'Cancelled')
   ORDER BY t.deadline ASC;
   ```

3. **Group by Resource**
   - Create map: `{ resource_email: [tasks] }`

4. **Loop Through Resources**
   - For each resource:

5. **Send Email (Sub-Workflow)**
   - Call `SW-008: Send Email`
   - Template: "Deadline Reminder"
   - Data:
     ```json
     {
       "resource_name": "Basel",
       "tasks": [
         {
           "task_id": "TSK-001",
           "task_name": "Mobile Testing",
           "project_name": "CST",
           "deadline": "2025-01-18",
           "days_remaining": 2
         }
       ]
     }
     ```

6. **Log Summary**
   - Store in workflow execution log
   - Count: X emails sent to Y resources

7. **Return Summary**
   ```json
   {
     "success": true,
     "emails_sent": 5,
     "resources_notified": 5,
     "tasks_count": 12
   }
   ```

**Output:** Summary of notifications sent

---

### WF-014: Weekly Project Status Report

**Purpose:** Generate and email weekly project status summary

**Trigger:** Schedule (Cron)
**Schedule:** Every Monday at 8:00 AM

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 8 * * 1` (8 AM every Monday)

2. **Query Project Summary**
   ```sql
   SELECT
     project_id,
     project_name,
     priority,
     status,
     completion_pct,
     tasks_total_count,
     tasks_done_count,
     tasks_in_progress_count,
     tasks_backlog_count,
     task_hrs_est,
     task_hrs_actual,
     days_until_target
   FROM v_projects_with_aggregations
   ORDER BY
     CASE priority
       WHEN 'High' THEN 1
       WHEN 'Medium' THEN 2
       WHEN 'Low' THEN 3
     END,
     completion_pct DESC;
   ```

3. **Calculate Week-over-Week Changes**
   - Query last week's completion percentages
   - Calculate delta for each project

4. **Generate HTML Report**
   - Use HTML template
   - Include:
     - Summary metrics (total projects, avg completion, etc.)
     - At-risk projects table (status = 'At Risk')
     - On-track projects table
     - Completed projects table
     - Week-over-week changes chart

5. **Query Stakeholder Email List**
   ```sql
   SELECT config_value FROM system_config
   WHERE config_key = 'weekly_report_recipients';
   ```
   - Value: JSON array of emails

6. **Send Email (Sub-Workflow)**
   - Call `SW-008: Send Email`
   - To: stakeholder list
   - Subject: "Weekly Project Status Report - Week of {{date}}"
   - Body: HTML report

7. **Store Report Archive**
   - Save HTML to file storage (optional)
   - Log report generation

8. **Return Summary**

**Output:** Report sent confirmation

---

### WF-015: Resource Overallocation Alert

**Purpose:** Detect and alert on overallocated resources

**Trigger:** Schedule (Cron)
**Schedule:** Every day at 10:00 AM

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 10 * * *`

2. **Query Overallocated Resources**
   ```sql
   SELECT
     resource_name,
     email,
     weekly_capacity_hrs,
     current_allocation_hrs,
     utilization_pct,
     active_tasks_count
   FROM v_resources_with_utilization
   WHERE utilization_pct > 100
   ORDER BY utilization_pct DESC;
   ```

3. **Check If Any Found**
   - If count = 0, exit workflow (success, no action)

4. **Query Resource Manager Email**
   ```sql
   SELECT config_value FROM system_config
   WHERE config_key = 'resource_manager_email';
   ```

5. **Fetch Task Details for Each Resource**
   ```sql
   SELECT
     task_id,
     task_name,
     project_name,
     r1_estimate_hrs,
     r2_estimate_hrs,
     deadline
   FROM v_tasks_with_calculations
   WHERE (resource1_name = $1 OR resource2_name = $1)
       AND status NOT IN ('Done', 'Cancelled')
   ORDER BY deadline ASC;
   ```

6. **Generate Alert Email**
   - Template: "Resource Overallocation Alert"
   - Data:
     ```json
     {
       "date": "2025-01-15",
       "overallocated_resources": [
         {
           "resource_name": "Basel",
           "capacity": 40,
           "allocation": 50,
           "utilization": 125,
           "tasks": [ /* task details */ ]
         }
       ]
     }
     ```

7. **Send Email**
   - To: Resource manager
   - CC: Project managers (optional)

8. **Log Alert**

**Output:** Alert sent confirmation

---

### WF-016: Auto-Complete Stale Tasks

**Purpose:** Automatically set long-overdue tasks to Cancelled

**Trigger:** Schedule (Cron)
**Schedule:** Every Sunday at 11:00 PM

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 23 * * 0` (11 PM Sunday)

2. **Query Configuration**
   ```sql
   SELECT config_value FROM system_config
   WHERE config_key = 'auto_cancel_overdue_days';
   ```
   - Default: 30 days

3. **Query Stale Tasks**
   ```sql
   SELECT
     task_uuid,
     task_id,
     task_name,
     project_name,
     deadline,
     days_until_deadline,
     resource1_name,
     resource2_name
   FROM v_tasks_with_calculations
   WHERE deadline < CURRENT_DATE - INTERVAL '{{days}} days'
     AND status IN ('Backlog', 'In Progress')
   ORDER BY deadline ASC;
   ```

4. **Check If Any Found**
   - If count = 0, exit

5. **Loop Through Stale Tasks**
   - For each task:

6. **Update Status to Cancelled**
   ```sql
   UPDATE tasks
   SET
     status = 'Cancelled',
     updated_at = CURRENT_TIMESTAMP,
     updated_by = 'system_auto_cancel'
   WHERE task_uuid = $1;
   ```

7. **Audit Logging**
   - Call `SW-002: Log Audit Record`
   - User: "system_auto_cancel"

8. **Generate Summary Report**
   - Count: X tasks auto-cancelled

9. **Send Notification**
   - Email to project managers
   - List of auto-cancelled tasks

10. **Return Summary**

**Output:** Count of tasks auto-cancelled

---

### WF-017: Calculate Project Health Score

**Purpose:** Calculate and update custom health score for projects

**Trigger:** Schedule (Cron)
**Schedule:** Every hour

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 * * * *` (every hour)

2. **Query All Active Projects**
   ```sql
   SELECT * FROM v_projects_with_aggregations;
   ```

3. **Loop Through Projects**
   - For each project:

4. **Calculate Health Score**
   - Formula:
     ```
     health_score = (
       completion_pct * 0.4 +                    // 40% weight
       (100 - variance_pct) * 0.3 +              // 30% weight
       on_time_factor * 0.2 +                    // 20% weight
       resource_availability * 0.1               // 10% weight
     )
     ```

5. **Determine Health Status**
   - Score >= 80: "Healthy"
   - Score >= 60: "Caution"
   - Score < 60: "Critical"

6. **Store Score (Optional Custom Field)**
   - If custom_fields table exists:
   ```sql
   INSERT INTO project_custom_fields (project_uuid, field_name, field_value)
   VALUES ($1, 'health_score', $2)
   ON CONFLICT (project_uuid, field_name)
   DO UPDATE SET field_value = $2, updated_at = CURRENT_TIMESTAMP;
   ```

7. **Trigger Alerts**
   - If health_status changed to "Critical":
     - Call `SW-007: Send Alert`

8. **Return Summary**

**Output:** Health scores calculated count

---

### WF-018: Backup Database

**Purpose:** Create automated database backup

**Trigger:** Schedule (Cron)
**Schedule:** Every day at 2:00 AM

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 2 * * *` (2 AM daily)

2. **Execute Backup Command**
   - Use Postgres node or Execute Command node
   - Command:
     ```bash
     pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
       -F c -f /backups/qc_planning_$(date +%Y%m%d_%H%M%S).dump
     ```

3. **Verify Backup File Created**
   - Check file exists
   - Check file size > 0

4. **Upload to Cloud Storage (Optional)**
   - AWS S3, Google Cloud Storage, etc.
   - Use AWS node or HTTP Request

5. **Delete Old Backups**
   - Keep last 30 days
   - Delete files older than 30 days

6. **Log Backup Success**
   - Store metadata: filename, size, timestamp

7. **Send Notification (If Failed)**
   - Email to admin
   - Alert: "Database backup failed"

8. **Return Summary**

**Output:** Backup confirmation

---

### WF-019: Sync Resource Availability

**Purpose:** Sync resource availability from external calendar (Google Calendar)

**Trigger:** Schedule (Cron)
**Schedule:** Every 4 hours

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 */4 * * *` (every 4 hours)

2. **Query Active Resources**
   ```sql
   SELECT resource_uuid, resource_name, email
   FROM resources
   WHERE deleted_at IS NULL AND is_active = TRUE;
   ```

3. **Loop Through Resources**
   - For each resource:

4. **Fetch Calendar Events (Google Calendar API)**
   - Use HTTP Request node
   - Endpoint: Google Calendar API
   - Query: Events for next 7 days
   - Filter: "Out of Office", "Vacation", "PTO"

5. **Calculate Available Hours**
   - Default: `weekly_capacity_hrs`
   - Subtract OOO hours
   - Formula: `available = capacity - ooo_hours`

6. **Update Custom Field (Optional)**
   - Store in custom_fields table
   - Field: `adjusted_capacity_hrs`

7. **Send Alert If Significant Change**
   - If adjusted capacity < 50% of normal:
     - Call `SW-007: Send Alert`

8. **Return Summary**

**Output:** Resources synced count

---

### WF-020: Generate Task ID

**Purpose:** Auto-generate next task ID in sequence

**Trigger:** Webhook (GET)
**Endpoint:** `GET /api/tasks/next-id`

**Input:**
- Query parameter: `project_id` (optional)

**Steps:**

1. **Webhook Trigger**

2. **Query Last Task ID**
   ```sql
   SELECT task_id FROM tasks
   WHERE task_id ~ '^TSK-[0-9]{3}$'
   ORDER BY task_id DESC
   LIMIT 1;
   ```

3. **Extract Number**
   - Parse: "TSK-042" → 42

4. **Increment**
   - New number: 43

5. **Format New ID**
   - Format: "TSK-043"
   - Zero-pad to 3 digits

6. **Return Response**
   ```json
   {
     "success": true,
     "data": {
       "next_task_id": "TSK-043"
     }
   }
   ```

**Output:** Next available task ID

---

## REPORTING WORKFLOWS

### WF-021: Generate Project Report (PDF)

**Purpose:** Generate detailed project report as PDF

**Trigger:** Webhook (POST) or Manual
**Endpoint:** `POST /api/reports/project/:project_id`

**Input:**
```json
{
  "project_id": "PRJ-001",
  "include_tasks": true,
  "include_charts": true,
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**

2. **Query Project Data**
   ```sql
   SELECT * FROM v_projects_with_aggregations
   WHERE project_id = $1;
   ```

3. **Query Tasks (If Requested)**
   ```sql
   SELECT * FROM v_tasks_with_calculations
   WHERE project_id = $1
   ORDER BY status, deadline;
   ```

4. **Query Audit Trail**
   ```sql
   SELECT * FROM v_audit_trail
   WHERE entity_type = 'projects'
     AND display_id = $1
   ORDER BY timestamp DESC
   LIMIT 50;
   ```

5. **Generate Chart Data (If Requested)**
   - Task status pie chart
   - Completion trend line chart
   - Resource allocation bar chart

6. **Generate HTML Report**
   - Use HTML template
   - Inject data
   - Include:
     - Project overview
     - Key metrics
     - Task list table
     - Charts
     - Change history

7. **Convert HTML to PDF**
   - Use Puppeteer or similar
   - Save to temporary storage

8. **Upload PDF to Storage**
   - AWS S3, Google Drive, etc.
   - Generate signed URL

9. **Send Email with Link**
   - To: user_email
   - Subject: "Project Report: {{project_name}}"
   - Body: "Your report is ready. Download: {{url}}"

10. **Return Response**
    ```json
    {
      "success": true,
      "data": {
        "report_url": "https://storage/reports/PRJ-001_20250115.pdf",
        "expires_at": "2025-01-22T10:00:00Z"
      }
    }
    ```

**Output:** PDF URL with expiration

---

### WF-022: Export Tasks to Excel

**Purpose:** Export filtered tasks to Excel spreadsheet

**Trigger:** Webhook (POST)
**Endpoint:** `POST /api/exports/tasks`

**Input:**
```json
{
  "filters": {
    "project_id": "PRJ-001",
    "status": ["Backlog", "In Progress"]
  },
  "columns": [
    "task_id",
    "task_name",
    "status",
    "resource1_name",
    "deadline",
    "total_est_hrs",
    "total_actual_hrs",
    "overall_completion_pct"
  ],
  "user_email": "user@example.com"
}
```

**Steps:**

1. **Webhook Trigger**

2. **Query Tasks with Filters**
   - Build dynamic SQL based on filters
   - Include only requested columns

3. **Convert to Excel**
   - Use n8n Spreadsheet node or library
   - Format:
     - Header row with column names
     - Data rows
     - Apply formatting (bold header, freeze panes)
     - Add filters to header row

4. **Save File**
   - Filename: `tasks_export_{{timestamp}}.xlsx`

5. **Upload to Storage**
   - Generate download link

6. **Send Email**
   - To: user_email
   - Attachment: Excel file OR download link

7. **Return Response**

**Output:** Excel file URL

---

### WF-023: Generate Resource Utilization Report

**Purpose:** Generate resource capacity and utilization report

**Trigger:** Webhook (POST) or Schedule
**Endpoint:** `POST /api/reports/resources`

**Input:**
```json
{
  "date_range": {
    "start": "2025-01-01",
    "end": "2025-01-31"
  },
  "format": "pdf",
  "user_email": "admin@example.com"
}
```

**Steps:**

1. **Webhook Trigger**

2. **Query Current Utilization**
   ```sql
   SELECT * FROM v_resources_with_utilization
   ORDER BY utilization_pct DESC;
   ```

3. **Query Historical Data (Optional)**
   - If date_range provided:
   - Aggregate historical task hours by resource

4. **Calculate Metrics**
   - Average utilization
   - Peak utilization per resource
   - Underutilized resources (< 50%)
   - Overutilized resources (> 100%)

5. **Generate Charts**
   - Utilization bar chart (per resource)
   - Capacity vs allocation stacked bar
   - Utilization trend over time

6. **Generate Report (HTML → PDF)**

7. **Return Response**

**Output:** Report URL

---

### WF-024: Generate Audit Trail Report

**Purpose:** Generate audit report for compliance

**Trigger:** Webhook (POST)
**Endpoint:** `POST /api/reports/audit`

**Input:**
```json
{
  "entity_type": "tasks",
  "entity_id": "TSK-001",
  "date_range": {
    "start": "2025-01-01",
    "end": "2025-01-31"
  },
  "actions": ["CREATE", "UPDATE", "DELETE"],
  "user_email": "admin@example.com"
}
```

**Steps:**

1. **Webhook Trigger**

2. **Query Audit Log**
   ```sql
   SELECT * FROM v_audit_trail
   WHERE entity_type = $1
     AND display_id = $2
     AND timestamp BETWEEN $3 AND $4
     AND action = ANY($5)
   ORDER BY timestamp DESC;
   ```

3. **Format Audit Records**
   - Pretty-print JSON states
   - Show before/after diffs
   - Highlight changed fields

4. **Generate Report**
   - HTML template
   - Include:
     - Audit trail table
     - Change summaries
     - User activity summary
     - Timeline visualization

5. **Convert to PDF**

6. **Return Response**

**Output:** Audit report URL

---

### WF-025: Daily Activity Summary

**Purpose:** Send daily summary email to stakeholders

**Trigger:** Schedule (Cron)
**Schedule:** Every day at 6:00 PM

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 18 * * *` (6 PM daily)

2. **Query Today's Activity**
   - **Projects created:**
   ```sql
   SELECT COUNT(*) FROM projects
   WHERE DATE(created_at) = CURRENT_DATE;
   ```

   - **Tasks created:**
   ```sql
   SELECT COUNT(*) FROM tasks
   WHERE DATE(created_at) = CURRENT_DATE;
   ```

   - **Tasks completed:**
   ```sql
   SELECT COUNT(*) FROM tasks
   WHERE status = 'Done'
     AND DATE(completed_date) = CURRENT_DATE;
   ```

   - **Tasks updated:**
   ```sql
   SELECT COUNT(*) FROM audit_log
   WHERE entity_type = 'tasks'
     AND action = 'UPDATE'
     AND DATE(timestamp) = CURRENT_DATE;
   ```

3. **Query Top Contributors**
   ```sql
   SELECT
     user_email,
     COUNT(*) AS activity_count
   FROM audit_log
   WHERE DATE(timestamp) = CURRENT_DATE
   GROUP BY user_email
   ORDER BY activity_count DESC
   LIMIT 5;
   ```

4. **Query Overdue Tasks Count**
   ```sql
   SELECT COUNT(*) FROM v_tasks_with_calculations
   WHERE deadline < CURRENT_DATE
     AND status NOT IN ('Done', 'Cancelled');
   ```

5. **Generate Email**
   - Template: Daily Summary
   - Data: All metrics

6. **Send Email**
   - To: Stakeholder list
   - Subject: "Daily Activity Summary - {{date}}"

7. **Return Summary**

**Output:** Email sent confirmation

---

## NOTIFICATION WORKFLOWS

### WF-026: Send Task Assignment Notification

**Purpose:** Notify resource when assigned to task

**Trigger:** Called by other workflows (sub-workflow)

**Input:**
```json
{
  "task_id": "TSK-010",
  "task_name": "API Testing",
  "project_name": "CST",
  "resource_name": "Basel",
  "resource_email": "basel@example.com",
  "estimate_hrs": 24,
  "deadline": "2025-02-15",
  "assigned_by": "admin@example.com"
}
```

**Steps:**

1. **Execute Workflow Node** (called from parent)

2. **Generate Email Content**
   - Template: "Task Assignment"
   - Data: task details

3. **Send Email**
   - To: resource_email
   - CC: assigned_by (optional)
   - Subject: "New Task Assigned: {{task_name}}"
   - Body:
     ```
     Hi {{resource_name}},

     You have been assigned to a new task:

     Task: {{task_id}} - {{task_name}}
     Project: {{project_name}}
     Estimated Hours: {{estimate_hrs}}
     Deadline: {{deadline}}

     View task: [Link to task]

     Thanks,
     QC Management System
     ```

4. **Log Notification**
   - Store in notifications table (optional)

5. **Return Success**

**Output:** Notification sent confirmation

---

### WF-027: Send Task Completion Notification

**Purpose:** Notify stakeholders when task completed

**Trigger:** Called by WF-006 (Update Task Status)

**Input:**
```json
{
  "task_id": "TSK-010",
  "task_name": "API Testing",
  "project_id": "PRJ-001",
  "project_name": "CST",
  "completed_by": "Basel",
  "completed_date": "2025-01-15",
  "total_actual_hrs": 28,
  "total_est_hrs": 24,
  "variance_pct": 16.67
}
```

**Steps:**

1. **Execute Workflow Node**

2. **Query Project Manager Email**
   ```sql
   SELECT created_by FROM projects WHERE project_id = $1;
   ```

3. **Generate Email**
   - Template: "Task Completed"
   - Include variance if significant (>20%)

4. **Send Email**
   - To: Project manager
   - CC: Task assignee

5. **Return Success**

**Output:** Notification sent

---

### WF-028: Send Over-Budget Alert

**Purpose:** Alert when task exceeds budget by threshold

**Trigger:** Called by WF-007 (Update Task Hours)

**Input:**
```json
{
  "task_id": "TSK-010",
  "task_name": "API Testing",
  "project_name": "CST",
  "variance_pct": 55,
  "total_actual_hrs": 50,
  "total_est_hrs": 32,
  "hours_variance": 18,
  "resource_name": "Basel"
}
```

**Steps:**

1. **Check Threshold**
   - If `variance_pct < 50`, exit (no alert)

2. **Query Alert Recipients**
   - Project manager
   - Resource manager

3. **Generate Alert Email**
   - Template: "Over Budget Alert"
   - Severity: Warning

4. **Send Email**

**Output:** Alert sent

---

### WF-029: Send Deadline Passed Alert

**Purpose:** Alert when task deadline passes without completion

**Trigger:** Schedule (Cron)
**Schedule:** Every day at 10:00 AM

**Input:** None

**Steps:**

1. **Schedule Trigger**

2. **Query Overdue Tasks**
   ```sql
   SELECT * FROM v_tasks_with_calculations
   WHERE deadline < CURRENT_DATE
     AND status NOT IN ('Done', 'Cancelled')
   ORDER BY deadline ASC;
   ```

3. **Group by Project Manager**

4. **Loop Through Project Managers**

5. **Generate Email**
   - Template: "Overdue Tasks Alert"
   - List tasks by project

6. **Send Email**

7. **Return Summary**

**Output:** Alerts sent count

---

### WF-030: Send Weekly Digest

**Purpose:** Send personalized weekly digest to each resource

**Trigger:** Schedule (Cron)
**Schedule:** Every Friday at 5:00 PM

**Input:** None

**Steps:**

1. **Schedule Trigger**
   - Cron: `0 17 * * 5` (5 PM Friday)

2. **Query Active Resources**
   ```sql
   SELECT * FROM resources
   WHERE deleted_at IS NULL AND is_active = TRUE;
   ```

3. **Loop Through Resources**

4. **Query Resource's Tasks**
   ```sql
   SELECT * FROM v_tasks_with_calculations
   WHERE (resource1_name = $1 OR resource2_name = $1)
     AND status NOT IN ('Done', 'Cancelled')
   ORDER BY deadline ASC;
   ```

5. **Calculate Resource's Metrics**
   - Tasks completed this week
   - Tasks in progress
   - Hours logged this week
   - Upcoming deadlines

6. **Generate Personalized Email**
   - Template: "Weekly Digest"
   - Data: resource metrics

7. **Send Email**
   - To: resource_email

8. **Return Summary**

**Output:** Digests sent count

---

### WF-031: Send Slack Notification

**Purpose:** Send notification to Slack channel

**Trigger:** Called by other workflows

**Input:**
```json
{
  "channel": "#qc-alerts",
  "message": "Task TSK-010 completed by Basel",
  "severity": "info",
  "link": "https://app/tasks/TSK-010"
}
```

**Steps:**

1. **Execute Workflow Node**

2. **Format Slack Message**
   - Use Slack blocks format
   - Include emoji based on severity
   - Add action buttons (optional)

3. **Send to Slack**
   - Use Slack node
   - API: `chat.postMessage`

4. **Return Success**

**Output:** Slack message sent

---

## REUSABLE SUB-WORKFLOWS

### SW-001: Validate Project Data

**Purpose:** Validate project input data against business rules

**Trigger:** Called by parent workflows

**Input:**
```json
{
  "project_id": "PRJ-003",
  "project_name": "Mobile App",
  "total_weight": 3,
  "priority": "High",
  "start_date": "2025-01-15",
  "target_date": "2025-03-15"
}
```

**Steps:**

1. **Check Required Fields**
   - `project_id` NOT NULL
   - `project_name` NOT NULL

2. **Validate Format**
   - `project_id` matches `^PRJ-[0-9]{3}$`
   - If not, return error: "Invalid project_id format (expected: PRJ-XXX)"

3. **Validate Ranges**
   - If `total_weight` provided:
     - Check: `total_weight BETWEEN 1 AND 5`
     - If not, return error: "total_weight must be between 1 and 5"

4. **Validate Enums**
   - If `priority` provided:
     - Check: `priority IN ('High', 'Medium', 'Low')`
     - If not, return error: "Invalid priority value"

5. **Validate Date Logic**
   - If both `start_date` and `target_date` provided:
     - Check: `target_date >= start_date`
     - If not, return error: "target_date must be >= start_date"

6. **Return Result**
   ```json
   {
     "valid": true,
     "errors": []
   }
   ```
   OR
   ```json
   {
     "valid": false,
     "errors": [
       "Invalid project_id format (expected: PRJ-XXX)",
       "total_weight must be between 1 and 5"
     ]
   }
   ```

**Output:** Validation result object

---

### SW-002: Log Audit Record

**Purpose:** Create audit log entry for any mutation

**Trigger:** Called by parent workflows

**Input:**
```json
{
  "action": "UPDATE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "user@example.com",
  "user_ip": "192.168.1.100",
  "before_state": { /* full record before */ },
  "after_state": { /* full record after */ },
  "changed_fields": ["status", "r1_actual_hrs"],
  "change_summary": "Updated task: TSK-001",
  "request_id": "req-uuid",
  "session_id": "session-uuid"
}
```

**Steps:**

1. **Generate Audit UUID**
   - `gen_random_uuid()`

2. **Insert Audit Record**
   ```sql
   INSERT INTO audit_log (
     audit_uuid,
     timestamp,
     action,
     entity_type,
     entity_uuid,
     user_email,
     user_ip,
     before_state,
     after_state,
     changed_fields,
     change_summary,
     request_id,
     session_id
   ) VALUES (
     $1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
   );
   ```

3. **Return Success**
   ```json
   {
     "success": true,
     "audit_uuid": "audit-uuid-here"
   }
   ```

**Output:** Audit record UUID

**Note:** This sub-workflow is called by almost every CRUD workflow after mutations.

---

### SW-003: Validate Task Data

**Purpose:** Validate task input data

**Trigger:** Called by parent workflows

**Input:**
```json
{
  "task_id": "TSK-010",
  "task_name": "API Testing",
  "status": "Backlog",
  "estimate_days": 3,
  "r1_estimate_hrs": 24,
  "r1_actual_hrs": 0,
  "r2_estimate_hrs": 0,
  "r2_actual_hrs": 0
}
```

**Steps:**

1. **Check Required Fields**
   - `task_id`, `task_name`, `status` NOT NULL

2. **Validate Format**
   - `task_id` matches `^TSK-[0-9]{3}$`

3. **Validate Enums**
   - `status IN ('Backlog', 'In Progress', 'Done', 'Cancelled')`

4. **Validate Ranges**
   - `estimate_days > 0`
   - `r1_estimate_hrs >= 0`
   - `r1_actual_hrs >= 0`
   - `r2_estimate_hrs >= 0`
   - `r2_actual_hrs >= 0`

5. **Validate Business Logic**
   - If `status = 'Done'`:
     - Check `completed_date` provided
     - Check `(r1_actual_hrs + r2_actual_hrs) > 0`

6. **Return Result**

**Output:** Validation result

---

### SW-004: Check Resource Capacity

**Purpose:** Check if resource has capacity for new task

**Trigger:** Called by WF-005 (Create Task)

**Input:**
```json
{
  "resource_name": "Basel",
  "additional_hrs": 24
}
```

**Steps:**

1. **Query Current Utilization**
   ```sql
   SELECT
     weekly_capacity_hrs,
     current_allocation_hrs,
     utilization_pct,
     available_hrs
   FROM v_resources_with_utilization
   WHERE resource_name = $1;
   ```

2. **Calculate New Utilization**
   - `new_allocation = current_allocation_hrs + additional_hrs`
   - `new_utilization_pct = (new_allocation / weekly_capacity_hrs) * 100`

3. **Determine Warning Level**
   - If `new_utilization_pct > 120`: "CRITICAL - Resource severely overallocated"
   - If `new_utilization_pct > 100`: "WARNING - Resource overallocated"
   - If `new_utilization_pct > 80`: "CAUTION - Resource near capacity"
   - Else: "OK"

4. **Return Result**
   ```json
   {
     "resource_name": "Basel",
     "current_utilization_pct": 85,
     "new_utilization_pct": 105,
     "warning_level": "WARNING",
     "message": "Resource will be overallocated by 5%",
     "recommended_action": "Consider assigning to a different resource"
   }
   ```

**Output:** Capacity check result with warnings

---

### SW-005: Send Task Assignment Email

**Purpose:** Send email when task assigned to resource

**Trigger:** Called by WF-005 (Create Task)

**Input:**
```json
{
  "task_id": "TSK-010",
  "task_name": "API Testing",
  "project_name": "CST",
  "resource_name": "Basel",
  "resource_email": "basel@example.com",
  "estimate_hrs": 24,
  "deadline": "2025-02-15"
}
```

**Steps:**

1. **Load Email Template**
   - Template: `task_assignment.html`

2. **Inject Data**
   - Replace placeholders with actual values

3. **Send Email**
   - Use Email node or SMTP
   - To: `resource_email`
   - Subject: "New Task Assigned: {{task_name}}"
   - Body: Rendered HTML

4. **Return Success**

**Output:** Email sent confirmation

---

### SW-006: Validate Status Transition

**Purpose:** Check if status transition is allowed

**Trigger:** Called by WF-006 (Update Task Status)

**Input:**
```json
{
  "from_status": "Backlog",
  "to_status": "Done"
}
```

**Steps:**

1. **Query Status Transitions Table**
   ```sql
   SELECT requires_fields
   FROM status_transitions
   WHERE from_status = $1 AND to_status = $2;
   ```

2. **Check If Transition Exists**
   - If no rows returned:
     ```json
     {
       "valid": false,
       "error": "Transition from 'Backlog' to 'Done' is not allowed"
     }
     ```

3. **Check Required Fields (If Any)**
   - If `requires_fields` is not null:
     - Return list of required fields
     ```json
     {
       "valid": true,
       "requires_fields": ["completed_date"]
     }
     ```

4. **Return Result**
   ```json
   {
     "valid": true,
     "requires_fields": []
   }
   ```

**Output:** Validation result

---

### SW-007: Send Alert Email

**Purpose:** Generic alert email sender

**Trigger:** Called by multiple workflows

**Input:**
```json
{
  "alert_type": "over_budget",
  "severity": "warning",
  "subject": "Task Over Budget Alert",
  "recipients": ["manager@example.com"],
  "data": {
    "task_id": "TSK-010",
    "variance_pct": 55
  }
}
```

**Steps:**

1. **Select Email Template**
   - Based on `alert_type`

2. **Load Template**

3. **Inject Data**

4. **Determine Priority**
   - If `severity = "critical"`: High priority
   - If `severity = "warning"`: Normal priority
   - If `severity = "info"`: Low priority

5. **Send Email**
   - To: recipients list
   - Subject: subject
   - Priority: based on severity

6. **Return Success**

**Output:** Alert sent confirmation

---

### SW-008: Send Email (Generic)

**Purpose:** Generic email sending utility

**Trigger:** Called by multiple workflows

**Input:**
```json
{
  "to": ["user1@example.com", "user2@example.com"],
  "cc": ["manager@example.com"],
  "subject": "Weekly Report",
  "body_html": "<html>...</html>",
  "body_text": "Plain text version",
  "attachments": [
    {
      "filename": "report.pdf",
      "content": "base64-encoded-content"
    }
  ]
}
```

**Steps:**

1. **Validate Input**
   - Check `to` array not empty
   - Check email format

2. **Send Email**
   - Use Email node
   - Configure SMTP settings
   - Set headers

3. **Handle Errors**
   - If send fails, retry up to 3 times
   - If still fails, log error

4. **Return Success**

**Output:** Email sent confirmation

---

## AUDIT LOGGING FLOW

### Centralized Audit Strategy

**Every CRUD workflow that mutates data MUST call SW-002: Log Audit Record**

### Audit Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   CRUD WORKFLOW                         │
│  (WF-001, WF-003, WF-005, WF-006, WF-007, etc.)        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 1. Fetch BEFORE state
                     ↓
┌─────────────────────────────────────────────────────────┐
│          Query Database (Current State)                 │
│  SELECT * FROM table WHERE uuid = $1;                   │
└────────────────────┬────────────────────────────────────┘
                     │ before_state
                     ↓
┌─────────────────────────────────────────────────────────┐
│               Perform Mutation                          │
│  INSERT / UPDATE / DELETE on table                      │
└────────────────────┬────────────────────────────────────┘
                     │ after_state
                     ↓
┌─────────────────────────────────────────────────────────┐
│          Calculate Changed Fields                       │
│  Compare before_state vs after_state                    │
│  Build array: ["field1", "field2"]                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│         Call SW-002: Log Audit Record                   │
│  Input:                                                 │
│  - action: CREATE/UPDATE/DELETE                         │
│  - entity_type: projects/tasks/resources                │
│  - entity_uuid: UUID of record                          │
│  - user_email: current user                             │
│  - before_state: JSONB                                  │
│  - after_state: JSONB                                   │
│  - changed_fields: array                                │
│  - change_summary: human-readable text                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│        INSERT INTO audit_log                            │
│  Store complete audit trail record                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│          Return to Parent Workflow                      │
│  Continue with response to user                         │
└─────────────────────────────────────────────────────────┘
```

### Audit Record Structure

**Every audit record contains:**

| Field | Source | Description |
|-------|--------|-------------|
| `audit_uuid` | Generated | Unique audit record ID |
| `timestamp` | Auto | When change occurred |
| `action` | Workflow | CREATE / UPDATE / DELETE / RESTORE |
| `entity_type` | Workflow | projects / tasks / resources |
| `entity_uuid` | Workflow | UUID of the record that changed |
| `user_email` | Request context | Who made the change |
| `user_ip` | Request context | IP address (from webhook headers) |
| `user_agent` | Request context | Browser info (from webhook headers) |
| `before_state` | Database query | Full record BEFORE mutation (JSONB) |
| `after_state` | Database result | Full record AFTER mutation (JSONB) |
| `changed_fields` | Calculated | Array of field names that changed |
| `change_summary` | Generated | Human-readable summary |
| `request_id` | Request context | Groups related changes (optional) |
| `session_id` | Request context | User session ID (optional) |

### Audit Capture Examples

#### Example 1: CREATE Task

```json
{
  "action": "CREATE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "user@example.com",
  "user_ip": "192.168.1.100",
  "before_state": null,
  "after_state": {
    "task_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "task_id": "TSK-010",
    "project_uuid": "123e4567-e89b-12d3-a456-426614174000",
    "task_name": "API Testing",
    "status": "Backlog",
    "estimate_days": 3,
    "r1_estimate_hrs": 24,
    "r1_actual_hrs": 0,
    "created_at": "2025-01-15T10:00:00Z",
    "created_by": "user@example.com"
  },
  "changed_fields": [],
  "change_summary": "Created task: TSK-010 (API Testing)"
}
```

#### Example 2: UPDATE Task Hours

```json
{
  "action": "UPDATE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "user@example.com",
  "before_state": {
    "r1_actual_hrs": 0,
    "r2_actual_hrs": 0,
    "updated_at": "2025-01-15T10:00:00Z"
  },
  "after_state": {
    "r1_actual_hrs": 10,
    "r2_actual_hrs": 5,
    "updated_at": "2025-01-15T15:30:00Z"
  },
  "changed_fields": ["r1_actual_hrs", "r2_actual_hrs", "updated_at"],
  "change_summary": "Updated task hours: TSK-010"
}
```

#### Example 3: DELETE (Soft Delete) Task

```json
{
  "action": "DELETE",
  "entity_type": "tasks",
  "entity_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "user_email": "admin@example.com",
  "before_state": {
    "status": "Backlog",
    "deleted_at": null
  },
  "after_state": {
    "status": "Cancelled",
    "deleted_at": "2025-01-15T16:00:00Z",
    "deleted_by": "admin@example.com"
  },
  "changed_fields": ["status", "deleted_at", "deleted_by"],
  "change_summary": "Soft deleted task: TSK-010"
}
```

### User Context Extraction

**In every webhook workflow, extract user context:**

```javascript
// In n8n webhook node, use expressions:
const userEmail = $('Webhook').item.json.user_email;
const userIp = $('Webhook').item.json.headers['x-forwarded-for'] ||
               $('Webhook').item.json.headers['x-real-ip'] ||
               $('Webhook').item.json.requestIP;
const userAgent = $('Webhook').item.json.headers['user-agent'];
const requestId = $('Webhook').item.json.headers['x-request-id'] ||
                  uuid.v4(); // Generate if not provided
const sessionId = $('Webhook').item.json.headers['x-session-id'];
```

**Pass to all child workflows and sub-workflows.**

---

## WORKFLOW IMPLEMENTATION GUIDE

### Workflow Naming Convention

| Prefix | Type | Example |
|--------|------|---------|
| `WF-` | Main workflow | `WF-001: Create Project` |
| `SW-` | Sub-workflow (reusable) | `SW-002: Log Audit Record` |

### Workflow Organization in n8n

**Folder Structure:**

```
QC_Scenario_Planning/
├── 01_CRUD/
│   ├── WF-001_Create_Project
│   ├── WF-002_Get_Project_by_ID
│   ├── WF-003_Update_Project
│   ├── WF-004_Soft_Delete_Project
│   ├── WF-005_Create_Task
│   ├── WF-006_Update_Task_Status
│   ├── WF-007_Update_Task_Hours
│   ├── WF-008_Get_All_Tasks
│   ├── WF-009_Create_Resource
│   ├── WF-010_Update_Resource_Capacity
│   ├── WF-011_Get_Dashboard_Metrics
│   └── WF-012_Soft_Delete_Task
│
├── 02_Automation/
│   ├── WF-013_Daily_Deadline_Reminder
│   ├── WF-014_Weekly_Project_Status_Report
│   ├── WF-015_Resource_Overallocation_Alert
│   ├── WF-016_Auto_Complete_Stale_Tasks
│   ├── WF-017_Calculate_Project_Health_Score
│   ├── WF-018_Backup_Database
│   ├── WF-019_Sync_Resource_Availability
│   └── WF-020_Generate_Task_ID
│
├── 03_Reporting/
│   ├── WF-021_Generate_Project_Report_PDF
│   ├── WF-022_Export_Tasks_to_Excel
│   ├── WF-023_Generate_Resource_Utilization_Report
│   ├── WF-024_Generate_Audit_Trail_Report
│   └── WF-025_Daily_Activity_Summary
│
├── 04_Notifications/
│   ├── WF-026_Send_Task_Assignment_Notification
│   ├── WF-027_Send_Task_Completion_Notification
│   ├── WF-028_Send_Over_Budget_Alert
│   ├── WF-029_Send_Deadline_Passed_Alert
│   ├── WF-030_Send_Weekly_Digest
│   └── WF-031_Send_Slack_Notification
│
└── 99_SubWorkflows/
    ├── SW-001_Validate_Project_Data
    ├── SW-002_Log_Audit_Record
    ├── SW-003_Validate_Task_Data
    ├── SW-004_Check_Resource_Capacity
    ├── SW-005_Send_Task_Assignment_Email
    ├── SW-006_Validate_Status_Transition
    ├── SW-007_Send_Alert_Email
    └── SW-008_Send_Email_Generic
```

### Common n8n Nodes Used

| Node Type | Usage | Example |
|-----------|-------|---------|
| **Webhook** | Trigger for API endpoints | All CRUD workflows |
| **Schedule Trigger** | Cron-based triggers | Daily/weekly reports |
| **Postgres** | Database queries | All data operations |
| **Execute Workflow** | Call sub-workflows | Validation, audit logging |
| **Function** | JavaScript logic | Data transformation |
| **IF** | Conditional branching | Validation checks |
| **Switch** | Multi-condition branching | Status-based routing |
| **Email** | Send emails | Notifications, reports |
| **HTTP Request** | External API calls | Slack, Google Calendar |
| **Set** | Variable assignment | Store intermediate data |
| **Code** | Complex JavaScript | Custom calculations |
| **Merge** | Combine data streams | Aggregate results |
| **Item Lists** | Loop through arrays | Process multiple items |

---

## ERROR HANDLING STRATEGY

### Error Handling Principles

1. **Validation Errors (400 Bad Request)**
   - Return immediately with clear error message
   - Include field name and validation rule violated
   - Example: `{ "error": "Invalid project_id format (expected: PRJ-XXX)" }`

2. **Not Found Errors (404 Not Found)**
   - Return when entity doesn't exist
   - Example: `{ "error": "Project not found: PRJ-999" }`

3. **Conflict Errors (409 Conflict)**
   - Return when uniqueness constraint violated
   - Example: `{ "error": "Project ID already exists: PRJ-001" }`

4. **Business Rule Errors (422 Unprocessable Entity)**
   - Return when business logic violated
   - Example: `{ "error": "Cannot delete project with active tasks" }`

5. **Server Errors (500 Internal Server Error)**
   - Catch unexpected errors
   - Log full error details
   - Return generic message to user
   - Example: `{ "error": "An unexpected error occurred. Please try again." }`

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "error_code": "VALIDATION_ERROR",
  "details": {
    "field": "project_id",
    "constraint": "format",
    "expected": "PRJ-XXX"
  },
  "timestamp": "2025-01-15T10:00:00Z",
  "request_id": "req-uuid-here"
}
```

### Retry Strategy

**For Scheduled Workflows:**

- If workflow fails, retry up to 3 times with exponential backoff
- Backoff: 1 min, 5 min, 15 min
- If still fails, send alert to admin

**For Webhook Workflows:**

- Do NOT retry (let client retry)
- Return error response immediately

### Error Logging

**All errors should be logged:**

1. **Workflow Execution Log** (n8n built-in)
2. **Application Log Table** (optional)
   ```sql
   CREATE TABLE workflow_errors (
     error_uuid UUID PRIMARY KEY,
     workflow_name VARCHAR(100),
     timestamp TIMESTAMPTZ,
     error_message TEXT,
     error_stack TEXT,
     input_data JSONB,
     user_email VARCHAR(255)
   );
   ```

3. **Alert on Critical Errors**
   - Send email/Slack notification for:
     - Database connection failures
     - Backup failures
     - Repeated validation errors (possible attack)

---

## SUMMARY

### Workflow Statistics

| Category | Count | Trigger Types |
|----------|-------|---------------|
| **CRUD Workflows** | 12 | Webhook (POST/GET/PUT/PATCH/DELETE) |
| **Automation Workflows** | 8 | Schedule (Cron) |
| **Reporting Workflows** | 5 | Webhook (POST) + Schedule |
| **Notification Workflows** | 6 | Called by other workflows |
| **Sub-Workflows** | 7 | Called by other workflows |
| **TOTAL** | **38** | - |

### Key Integration Points

1. **Frontend → n8n**
   - All CRUD operations via webhook endpoints
   - RESTful API design
   - JSON request/response

2. **n8n → PostgreSQL**
   - Direct SQL queries using Postgres node
   - Prepared statements for security
   - Use database views for derived data

3. **n8n → External Services**
   - Email (SMTP)
   - Slack (Webhook/API)
   - Google Calendar (API)
   - File Storage (AWS S3, Google Drive)

4. **n8n → n8n (Sub-Workflows)**
   - Execute Workflow node
   - Pass data via input parameters
   - Return results to parent

### Best Practices

1. ✅ **Always validate input** before database operations
2. ✅ **Always log audit records** for mutations
3. ✅ **Always check foreign keys** before creating relationships
4. ✅ **Always use sub-workflows** for reusable logic
5. ✅ **Always handle errors** gracefully with clear messages
6. ✅ **Always use database views** for calculated fields
7. ✅ **Always pass user context** through workflow chain
8. ✅ **Never expose database errors** to end users
9. ✅ **Never skip validation** for "internal" requests
10. ✅ **Never hard-code configuration** (use system_config table)

---

**This n8n workflow architecture provides a complete automation layer for the QC Scenario Planning system, handling API operations, scheduled tasks, reporting, notifications, and audit logging with a modular, maintainable design.**
