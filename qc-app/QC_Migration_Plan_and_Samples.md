# QC Scenario Planning - Migration Plan & Sample Queries

**Version:** 2.0 (Refined)
**Date:** 2025-01-15
**Purpose:** Provide step-by-step migration from Excel to PostgreSQL with example queries

---

## 📋 TABLE OF CONTENTS

1. [Migration Strategy](#migration-strategy)
2. [Step-by-Step Migration Plan](#step-by-step-migration-plan)
3. [Sample INSERT Statements](#sample-insert-statements)
4. [Sample Query Examples](#sample-query-examples)
5. [Dashboard Aggregation Queries](#dashboard-aggregation-queries)
6. [Design Decisions Explained](#design-decisions-explained)

---

## 🎯 MIGRATION STRATEGY

### Overview

The migration from Excel to PostgreSQL follows these principles:

1. **UUID Addition Without Column Shifting**: Add UUID columns at the beginning without disrupting existing user columns
2. **Formula Preservation**: Convert Excel formulas to database views for real-time calculation
3. **Data Integrity**: Enforce constraints at database level (foreign keys, CHECK constraints)
4. **Audit Trail**: Capture initial import as CREATE actions in audit_log
5. **Soft Delete Initialization**: All imported records start with `is_deleted = FALSE`

### Migration Phases

```
Phase 1: Database Setup
    ↓
Phase 2: Reference Data Import (Assumptions, Resources)
    ↓
Phase 3: Core Data Import (Projects, Tasks)
    ↓
Phase 4: Validation & Testing
    ↓
Phase 5: Formula Verification (Compare Views to Excel)
    ↓
Phase 6: Production Cutover
```

---

## 📝 STEP-BY-STEP MIGRATION PLAN

### **PHASE 1: Database Setup**

#### Step 1.1: Create PostgreSQL Database

```bash
# Create database
createdb qc_scenario_planning

# Connect to database
psql -d qc_scenario_planning
```

#### Step 1.2: Execute DDL Script

```bash
# Run the DDL script
psql -d qc_scenario_planning -f QC_PostgreSQL_DDL.sql
```

**Expected Output:**
- 4 core tables created (projects, resources, tasks, assumptions)
- 3 configuration tables created (status_options, status_transitions, system_config)
- 1 audit_log table created
- 4 views created (v_tasks_with_metrics, v_projects_with_metrics, v_resources_utilization, v_dashboard_metrics)
- Seed data inserted (4 status options, 12 status transitions, 4 system config entries)

#### Step 1.3: Verify Database Objects

```sql
-- Check tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

---

### **PHASE 2: Reference Data Import**

#### Step 2.1: Import Resources

**Excel Data:**
```
Assumptions Sheet, Column A-B:
Basel, 40
Belal, 40
Mahmoud, 40
Hany, 40
```

**Migration Approach:**

1. **Manual UUID Assignment**: Generate UUIDs for each resource
2. **Email Inference**: If not in Excel, leave NULL or infer from name
3. **Set Active Status**: All resources start with `is_active = TRUE`

**SQL Script:**

```sql
-- Insert resources with explicit UUIDs for reference
INSERT INTO resources (id, resource_name, weekly_capacity_hrs, email, is_active, created_by, updated_by)
VALUES
    (gen_random_uuid(), 'Basel', 40.00, 'basel@company.com', TRUE, 'migration_script', 'migration_script'),
    (gen_random_uuid(), 'Belal', 40.00, 'belal@company.com', TRUE, 'migration_script', 'migration_script'),
    (gen_random_uuid(), 'Mahmoud', 40.00, 'mahmoud@company.com', TRUE, 'migration_script', 'migration_script'),
    (gen_random_uuid(), 'Hany', 40.00, 'hany@company.com', TRUE, 'migration_script', 'migration_script');

-- Verify import
SELECT id, resource_name, weekly_capacity_hrs FROM resources;
```

**Save Resource UUIDs:**
```sql
-- Create temporary mapping table for migration
CREATE TEMP TABLE resource_mapping (
    excel_name VARCHAR(100),
    db_uuid UUID
);

INSERT INTO resource_mapping (excel_name, db_uuid)
SELECT resource_name, id FROM resources;
```

#### Step 2.2: Import Assumptions (Optional)

**Excel Data:**
```
Assumptions Sheet, Column C:
Backlog
In Progress
Done
Cancelled
```

**Note:** Status options are already seeded during DDL execution. Only import if custom assumptions exist.

---

### **PHASE 3: Core Data Import**

#### Step 3.1: Import Projects

**Excel Data:**
```
Projects Sheet (2 rows):
PRJ-001, CST, 1, Medium, 2025-01-01, 2025-03-31
PRJ-002, FRA, 3, High, 2025-02-01, 2025-04-30
```

**Migration SQL:**

```sql
-- Insert projects
INSERT INTO projects (id, project_id, project_name, total_weight, priority, start_date, target_date, created_by, updated_by)
VALUES
    (gen_random_uuid(), 'PRJ-001', 'CST', 1, 'Medium', '2025-01-01', '2025-03-31', 'migration_script', 'migration_script'),
    (gen_random_uuid(), 'PRJ-002', 'FRA', 3, 'High', '2025-02-01', '2025-04-30', 'migration_script', 'migration_script');

-- Save project UUIDs for task import
CREATE TEMP TABLE project_mapping (
    excel_project_id VARCHAR(20),
    db_uuid UUID
);

INSERT INTO project_mapping (excel_project_id, db_uuid)
SELECT project_id, id FROM projects;

-- Verify import
SELECT * FROM v_projects_with_metrics;
```

#### Step 3.2: Import Tasks (Critical Step)

**Excel Data Sample:**
```
TSK-001, PRJ-001, Mobile View Testing, In Progress, 5, Mahmoud, 40, 0, , 0, 0, 2025-01-31,
TSK-002, PRJ-001, حذف اسم المفوض, Done, 1.5, Belal, 12, 8, , 0, 0, 2025-01-20, 2025-01-18
TSK-003, PRJ-001, missing punch updates, Backlog, 0.25, Basel, 2, 0, , 0, 0, 2025-01-25,
```

**Column Mapping:**
```
Excel Column → PostgreSQL Column
A (Task ID) → task_id
B (Project ID) → project_id (lookup UUID from projects)
C (Task Name) → task_name
D (Status) → status
E (Estimate days) → estimate_days
F (Estimate hours) → AUTO-CALCULATED via GENERATED column
G (Resource 1) → resource1_id (lookup UUID from resources)
H (R1 Estimate) → r1_estimate_hrs
I (R1 Actual) → r1_actual_hrs
J (Resource 2) → resource2_id (lookup UUID from resources, NULL if empty)
K (R2 Estimate) → r2_estimate_hrs
L (R2 Actual) → r2_actual_hrs
M (Total Est) → AUTO-CALCULATED via GENERATED column
N (Total Actual) → AUTO-CALCULATED via GENERATED column
O-S (Percentages) → Calculated via v_tasks_with_metrics view
T (Deadline) → deadline
U (Completed Date) → completed_date
```

**Migration SQL:**

```sql
-- Insert tasks with foreign key lookups
INSERT INTO tasks (
    id,
    task_id,
    project_id,
    task_name,
    status,
    estimate_days,
    resource1_id,
    r1_estimate_hrs,
    r1_actual_hrs,
    resource2_id,
    r2_estimate_hrs,
    r2_actual_hrs,
    deadline,
    completed_date,
    created_by,
    updated_by
)
VALUES
    -- TSK-001: Mobile View Testing
    (
        gen_random_uuid(),
        'TSK-001',
        (SELECT db_uuid FROM project_mapping WHERE excel_project_id = 'PRJ-001'),
        'Mobile View Testing',
        'In Progress',
        5.0,
        (SELECT db_uuid FROM resource_mapping WHERE excel_name = 'Mahmoud'),
        40.0,
        0.0,
        NULL,  -- No Resource 2
        0.0,
        0.0,
        '2025-01-31',
        NULL,  -- Not completed yet
        'migration_script',
        'migration_script'
    ),
    -- TSK-002: حذف اسم المفوض
    (
        gen_random_uuid(),
        'TSK-002',
        (SELECT db_uuid FROM project_mapping WHERE excel_project_id = 'PRJ-001'),
        'حذف اسم المفوض',
        'Done',
        1.5,
        (SELECT db_uuid FROM resource_mapping WHERE excel_name = 'Belal'),
        12.0,
        8.0,
        NULL,
        0.0,
        0.0,
        '2025-01-20',
        '2025-01-18',
        'migration_script',
        'migration_script'
    ),
    -- TSK-003: missing punch updates
    (
        gen_random_uuid(),
        'TSK-003',
        (SELECT db_uuid FROM project_mapping WHERE excel_project_id = 'PRJ-001'),
        'missing punch updates',
        'Backlog',
        0.25,
        (SELECT db_uuid FROM resource_mapping WHERE excel_name = 'Basel'),
        2.0,
        0.0,
        NULL,
        0.0,
        0.0,
        '2025-01-25',
        NULL,
        'migration_script',
        'migration_script'
    ),
    -- TSK-004: מחיקת משמרות של משאבים בעלי הרשאות
    (
        gen_random_uuid(),
        'TSK-004',
        (SELECT db_uuid FROM project_mapping WHERE excel_project_id = 'PRJ-001'),
        'מחיקת משמרות של משאבים בעלי הרשאות',
        'Backlog',
        1.0,
        (SELECT db_uuid FROM resource_mapping WHERE excel_name = 'Basel'),
        8.0,
        0.0,
        NULL,
        0.0,
        0.0,
        '2025-01-28',
        NULL,
        'migration_script',
        'migration_script'
    ),
    -- TSK-005: CST Execution test for Elal
    (
        gen_random_uuid(),
        'TSK-005',
        (SELECT db_uuid FROM project_mapping WHERE excel_project_id = 'PRJ-001'),
        'CST Execution test for Elal',
        'Done',
        0.5,
        (SELECT db_uuid FROM resource_mapping WHERE excel_name = 'Hany'),
        4.0,
        4.0,
        NULL,
        0.0,
        0.0,
        '2025-01-22',
        '2025-01-22',
        'migration_script',
        'migration_script'
    ),
    -- TSK-006: testing for a week ERP-001
    (
        gen_random_uuid(),
        'TSK-006',
        (SELECT db_uuid FROM project_mapping WHERE excel_project_id = 'PRJ-001'),
        'testing for a week ERP-001',
        'Backlog',
        1.0,
        (SELECT db_uuid FROM resource_mapping WHERE excel_name = 'Hany'),
        8.0,
        0.0,
        NULL,
        0.0,
        0.0,
        '2025-02-05',
        NULL,
        'migration_script',
        'migration_script'
    );

-- Verify import
SELECT * FROM v_tasks_with_metrics;
```

---

### **PHASE 4: Validation & Testing**

#### Step 4.1: Verify Record Counts

```sql
-- Compare counts with Excel
SELECT 'Projects' AS entity, COUNT(*) AS count FROM projects WHERE is_deleted = FALSE
UNION ALL
SELECT 'Tasks', COUNT(*) FROM tasks WHERE is_deleted = FALSE
UNION ALL
SELECT 'Resources', COUNT(*) FROM resources WHERE is_deleted = FALSE;

-- Expected Output:
-- Projects: 2
-- Tasks: 6
-- Resources: 4
```

#### Step 4.2: Verify Formulas vs Excel

**Test Project Aggregations:**

```sql
-- Compare with Excel Projects sheet columns D-J
SELECT
    project_id,
    project_name,
    task_hrs_estimate,  -- Should match Excel column D
    task_hrs_actual,    -- Should match Excel column E
    task_hrs_done,      -- Should match Excel column F
    completion_pct,     -- Should match Excel column G
    tasks_done_count,   -- Should match Excel column H
    tasks_total_count,  -- Should match Excel column I
    status              -- Should match Excel column J
FROM v_projects_with_metrics
WHERE is_deleted = FALSE
ORDER BY project_id;

-- Expected for PRJ-001:
-- task_hrs_estimate: 74
-- task_hrs_actual: 12
-- task_hrs_done: 12
-- completion_pct: 16.22%
-- tasks_done_count: 2
-- tasks_total_count: 6
-- status: At Risk
```

**Test Task Calculations:**

```sql
-- Compare with Excel Tasks sheet columns F, M-S
SELECT
    task_id,
    task_name,
    estimate_hrs,           -- Should match Excel column F (estimate_days * 8)
    total_estimate_hrs,     -- Should match Excel column M
    total_actual_hrs,       -- Should match Excel column N
    r1_completion_pct,      -- Should match Excel column O
    r2_completion_pct,      -- Should match Excel column P
    hours_variance,         -- Should match Excel column Q
    variance_pct,           -- Should match Excel column R
    overall_completion_pct  -- Should match Excel column S
FROM v_tasks_with_metrics
WHERE is_deleted = FALSE
ORDER BY task_id;
```

#### Step 4.3: Test Constraints

```sql
-- Test 1: Invalid status (should fail)
INSERT INTO tasks (task_id, project_id, task_name, status, resource1_id, created_by, updated_by)
VALUES ('TSK-999', (SELECT id FROM projects WHERE project_id = 'PRJ-001'), 'Test', 'Invalid Status',
        (SELECT id FROM resources WHERE resource_name = 'Basel'), 'test', 'test');
-- Expected: ERROR: new row violates check constraint "chk_tasks_status"

-- Test 2: Invalid project ID format (should fail)
INSERT INTO projects (project_id, project_name, created_by, updated_by)
VALUES ('PROJECT-1', 'Test Project', 'test', 'test');
-- Expected: ERROR: new row violates check constraint "chk_project_id_format"

-- Test 3: Done task without completed_date (should fail)
INSERT INTO tasks (task_id, project_id, task_name, status, resource1_id, created_by, updated_by)
VALUES ('TSK-999', (SELECT id FROM projects WHERE project_id = 'PRJ-001'), 'Test', 'Done',
        (SELECT id FROM resources WHERE resource_name = 'Basel'), 'test', 'test');
-- Expected: ERROR: new row violates check constraint "chk_done_task_requirements"
```

#### Step 4.4: Test Foreign Keys

```sql
-- Test: Delete project with tasks (should fail due to RESTRICT)
DELETE FROM projects WHERE project_id = 'PRJ-001';
-- Expected: ERROR: update or delete on table "projects" violates foreign key constraint

-- Test: Delete resource assigned to tasks (should fail)
DELETE FROM resources WHERE resource_name = 'Basel';
-- Expected: ERROR: update or delete on table "resources" violates foreign key constraint
```

---

### **PHASE 5: Formula Verification**

Create a comparison report to validate that PostgreSQL views match Excel formulas:

```sql
-- Create verification report
SELECT
    'PRJ-001' AS excel_project_id,
    74 AS excel_task_hrs_estimate,
    12 AS excel_task_hrs_actual,
    12 AS excel_task_hrs_done,
    16.22 AS excel_completion_pct,
    2 AS excel_tasks_done,
    6 AS excel_tasks_total,
    'At Risk' AS excel_status,
    -- PostgreSQL values
    pm.task_hrs_estimate AS pg_task_hrs_estimate,
    pm.task_hrs_actual AS pg_task_hrs_actual,
    pm.task_hrs_done AS pg_task_hrs_done,
    pm.completion_pct AS pg_completion_pct,
    pm.tasks_done_count AS pg_tasks_done,
    pm.tasks_total_count AS pg_tasks_total,
    pm.status AS pg_status,
    -- Validation
    CASE WHEN pm.task_hrs_estimate = 74 THEN '✅' ELSE '❌' END AS estimate_match,
    CASE WHEN pm.task_hrs_actual = 12 THEN '✅' ELSE '❌' END AS actual_match,
    CASE WHEN pm.tasks_total_count = 6 THEN '✅' ELSE '❌' END AS count_match
FROM v_projects_with_metrics pm
WHERE pm.project_id = 'PRJ-001';
```

---

### **PHASE 6: Production Cutover**

#### Cutover Checklist

- [ ] Database DDL executed successfully
- [ ] All reference data imported (resources, assumptions)
- [ ] All core data imported (projects, tasks)
- [ ] Record counts match Excel
- [ ] Formula calculations match Excel (< 1% variance acceptable for rounding)
- [ ] Foreign key constraints validated
- [ ] CHECK constraints validated
- [ ] Soft delete flags initialized correctly (all `is_deleted = FALSE`)
- [ ] Views return data without errors
- [ ] n8n workflows tested against database
- [ ] Backup of Excel file created
- [ ] Rollback plan documented

#### Rollback Plan

If migration issues are discovered:

1. **Database Rollback:**
   ```sql
   DROP DATABASE qc_scenario_planning;
   -- Re-run DDL and migration scripts after fixes
   ```

2. **Excel Fallback:**
   - Continue using Excel file until issues resolved
   - Re-execute migration after fixes

---

## 💾 SAMPLE INSERT STATEMENTS

### Insert a New Project

```sql
INSERT INTO projects (
    project_id,
    project_name,
    total_weight,
    priority,
    start_date,
    target_date,
    created_by,
    updated_by
)
VALUES (
    'PRJ-003',
    'Quality Dashboard Enhancement',
    4,
    'High',
    '2025-02-15',
    '2025-05-15',
    'user@company.com',
    'user@company.com'
)
RETURNING id, project_id, project_name;
```

### Insert a New Task

```sql
-- Insert a task with Resource 1 only
INSERT INTO tasks (
    task_id,
    project_id,
    task_name,
    status,
    estimate_days,
    resource1_id,
    r1_estimate_hrs,
    r1_actual_hrs,
    deadline,
    tags,
    notes,
    created_by,
    updated_by
)
VALUES (
    'TSK-007',
    (SELECT id FROM projects WHERE project_id = 'PRJ-001'),
    'Implement dark mode UI',
    'Backlog',
    3.0,  -- 3 days = 24 hours (auto-calculated in estimate_hrs)
    (SELECT id FROM resources WHERE resource_name = 'Basel'),
    24.0,
    0.0,
    '2025-02-15',
    ARRAY['ui', 'enhancement', 'frontend'],
    'Implement dark mode theme across all pages',
    'user@company.com',
    'user@company.com'
)
RETURNING id, task_id, task_name, estimate_hrs, total_estimate_hrs;
```

### Insert a Task with Two Resources

```sql
INSERT INTO tasks (
    task_id,
    project_id,
    task_name,
    status,
    estimate_days,
    resource1_id,
    r1_estimate_hrs,
    r1_actual_hrs,
    resource2_id,
    r2_estimate_hrs,
    r2_actual_hrs,
    deadline,
    created_by,
    updated_by
)
VALUES (
    'TSK-008',
    (SELECT id FROM projects WHERE project_id = 'PRJ-001'),
    'Performance optimization and code review',
    'In Progress',
    2.0,
    (SELECT id FROM resources WHERE resource_name = 'Mahmoud'),
    12.0,  -- Mahmoud: 12 hours
    5.0,   -- Mahmoud: 5 hours actual
    (SELECT id FROM resources WHERE resource_name = 'Belal'),
    4.0,   -- Belal: 4 hours
    2.0,   -- Belal: 2 hours actual
    '2025-02-10',
    'user@company.com',
    'user@company.com'
)
RETURNING id, task_id, total_estimate_hrs, total_actual_hrs;
-- Returns: total_estimate_hrs = 16.0, total_actual_hrs = 7.0
```

### Update Task Status to Done

```sql
UPDATE tasks
SET
    status = 'Done',
    completed_date = CURRENT_DATE,
    r1_actual_hrs = 25.0,  -- Update actual hours
    updated_by = 'user@company.com',
    updated_at = CURRENT_TIMESTAMP
WHERE task_id = 'TSK-007'
RETURNING id, task_id, status, completed_date;
```

### Soft Delete a Task

```sql
-- Soft delete: Set status to Cancelled and is_deleted to TRUE
UPDATE tasks
SET
    status = 'Cancelled',
    is_deleted = TRUE,
    deleted_at = CURRENT_TIMESTAMP,
    deleted_by = 'user@company.com',
    updated_by = 'user@company.com',
    updated_at = CURRENT_TIMESTAMP
WHERE task_id = 'TSK-008'
RETURNING id, task_id, status, is_deleted, deleted_at;
```

### Restore a Soft Deleted Task

```sql
-- Restore: Set is_deleted to FALSE and clear deleted fields
UPDATE tasks
SET
    status = 'Backlog',  -- Reset to initial status
    is_deleted = FALSE,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_by = 'user@company.com',
    updated_at = CURRENT_TIMESTAMP
WHERE task_id = 'TSK-008'
RETURNING id, task_id, status, is_deleted;
```

---

## 🔍 SAMPLE QUERY EXAMPLES

### Query 1: Get All Active Projects with Metrics

```sql
SELECT
    project_id,
    project_name,
    priority,
    status,
    task_hrs_estimate,
    task_hrs_actual,
    completion_pct,
    tasks_done_count,
    tasks_total_count,
    start_date,
    target_date
FROM v_projects_with_metrics
WHERE is_deleted = FALSE
ORDER BY priority DESC, completion_pct DESC;
```

**Expected Output:**
```
project_id | project_name | priority | status  | task_hrs_estimate | task_hrs_actual | completion_pct | tasks_done_count | tasks_total_count
-----------|--------------|----------|---------|-------------------|-----------------|----------------|------------------|------------------
PRJ-002    | FRA          | High     | No Tasks| 0                 | 0               | 0.00           | 0                | 0
PRJ-001    | CST          | Medium   | At Risk | 74                | 12              | 16.22          | 2                | 6
```

### Query 2: Get All Tasks for a Specific Project

```sql
SELECT
    t.task_id,
    t.task_name,
    t.status,
    r1.resource_name AS resource_1,
    r2.resource_name AS resource_2,
    tm.total_estimate_hrs,
    tm.total_actual_hrs,
    tm.overall_completion_pct,
    tm.hours_variance,
    t.deadline,
    t.completed_date
FROM tasks t
JOIN resources r1 ON r1.id = t.resource1_id
LEFT JOIN resources r2 ON r2.id = t.resource2_id
LEFT JOIN v_tasks_with_metrics tm ON tm.id = t.id
WHERE t.project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-001')
  AND t.is_deleted = FALSE
ORDER BY t.deadline ASC;
```

### Query 3: Get Resource Utilization Report

```sql
SELECT
    resource_name,
    weekly_capacity_hrs,
    current_allocation_hrs,
    utilization_pct,
    available_hrs,
    CASE
        WHEN utilization_pct > 100 THEN '⚠️ Overallocated'
        WHEN utilization_pct >= 80 THEN '🟡 Near Capacity'
        WHEN utilization_pct >= 50 THEN '🟢 Well Utilized'
        ELSE '⚪ Underutilized'
    END AS status
FROM v_resources_utilization
WHERE is_deleted = FALSE
  AND is_active = TRUE
ORDER BY utilization_pct DESC;
```

**Expected Output:**
```
resource_name | weekly_capacity_hrs | current_allocation_hrs | utilization_pct | available_hrs | status
--------------|---------------------|------------------------|-----------------|---------------|------------------
Mahmoud       | 40.00               | 40.00                  | 100.00          | 0.00          | ⚠️ Overallocated
Basel         | 40.00               | 10.00                  | 25.00           | 30.00         | ⚪ Underutilized
Hany          | 40.00               | 8.00                   | 20.00           | 32.00         | ⚪ Underutilized
Belal         | 40.00               | 0.00                   | 0.00            | 40.00         | ⚪ Underutilized
```

### Query 4: Find Tasks Approaching Deadline (Next 7 Days)

```sql
SELECT
    t.task_id,
    t.task_name,
    t.status,
    r.resource_name AS assigned_to,
    tm.overall_completion_pct,
    t.deadline,
    (t.deadline - CURRENT_DATE) AS days_remaining
FROM tasks t
JOIN resources r ON r.id = t.resource1_id
LEFT JOIN v_tasks_with_metrics tm ON tm.id = t.id
WHERE t.is_deleted = FALSE
  AND t.status NOT IN ('Done', 'Cancelled')
  AND t.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
ORDER BY t.deadline ASC;
```

### Query 5: Get Task History (Audit Trail)

```sql
SELECT
    al.timestamp,
    al.action,
    al.user_email,
    al.before_json->>'status' AS old_status,
    al.after_json->>'status' AS new_status,
    al.before_json->>'r1_actual_hrs' AS old_actual_hrs,
    al.after_json->>'r1_actual_hrs' AS new_actual_hrs,
    al.changed_fields,
    al.change_summary
FROM audit_log al
WHERE al.entity_name = 'tasks'
  AND al.entity_id = (SELECT id FROM tasks WHERE task_id = 'TSK-001')
ORDER BY al.timestamp DESC;
```

### Query 6: Get Tasks by Status Count

```sql
SELECT
    status,
    COUNT(*) AS task_count,
    SUM(total_estimate_hrs) AS total_estimate_hrs,
    SUM(total_actual_hrs) AS total_actual_hrs
FROM v_tasks_with_metrics
WHERE is_deleted = FALSE
GROUP BY status
ORDER BY
    CASE status
        WHEN 'In Progress' THEN 1
        WHEN 'Backlog' THEN 2
        WHEN 'Done' THEN 3
        WHEN 'Cancelled' THEN 4
    END;
```

### Query 7: Get Project Health Dashboard

```sql
SELECT
    p.project_id,
    p.project_name,
    p.priority,
    pm.status AS project_status,
    pm.completion_pct,
    pm.tasks_done_count || ' / ' || pm.tasks_total_count AS tasks_progress,
    ROUND(pm.task_hrs_actual::NUMERIC / NULLIF(pm.task_hrs_estimate, 0) * 100, 2) AS hours_consumed_pct,
    CASE
        WHEN p.target_date < CURRENT_DATE AND pm.status != 'Complete' THEN '🔴 Overdue'
        WHEN p.target_date < CURRENT_DATE + INTERVAL '7 days' AND pm.status != 'Complete' THEN '🟠 Due Soon'
        WHEN pm.status = 'At Risk' THEN '🟡 At Risk'
        WHEN pm.status = 'Complete' THEN '🟢 Complete'
        ELSE '🔵 On Track'
    END AS health_indicator,
    p.target_date,
    (p.target_date - CURRENT_DATE) AS days_until_target
FROM projects p
LEFT JOIN v_projects_with_metrics pm ON pm.id = p.id
WHERE p.is_deleted = FALSE
ORDER BY
    CASE
        WHEN p.target_date < CURRENT_DATE THEN 1
        WHEN p.target_date < CURRENT_DATE + INTERVAL '7 days' THEN 2
        ELSE 3
    END,
    p.priority DESC;
```

---

## 📊 DASHBOARD AGGREGATION QUERIES

### Dashboard Query 1: Overall System Metrics

```sql
SELECT
    total_projects,
    completed_projects,
    on_track_projects,
    at_risk_projects,
    total_tasks,
    completed_tasks,
    in_progress_tasks,
    backlog_tasks,
    total_estimated_hours,
    total_actual_hours,
    total_variance_hours,
    overall_completion_pct AS system_completion_pct,
    active_resources,
    avg_resource_utilization
FROM v_dashboard_metrics;
```

**Expected Output (based on 6 tasks in PRJ-001):**
```json
{
  "total_projects": 2,
  "completed_projects": 0,
  "on_track_projects": 0,
  "at_risk_projects": 1,
  "total_tasks": 6,
  "completed_tasks": 2,
  "in_progress_tasks": 1,
  "backlog_tasks": 3,
  "total_estimated_hours": 74,
  "total_actual_hours": 12,
  "total_variance_hours": -62,
  "system_completion_pct": 16.22,
  "active_resources": 4,
  "avg_resource_utilization": 29.50
}
```

### Dashboard Query 2: Project Completion by Priority

```sql
SELECT
    p.priority,
    COUNT(*) AS project_count,
    ROUND(AVG(pm.completion_pct), 2) AS avg_completion_pct,
    SUM(pm.task_hrs_estimate) AS total_estimate_hrs,
    SUM(pm.task_hrs_actual) AS total_actual_hrs
FROM projects p
LEFT JOIN v_projects_with_metrics pm ON pm.id = p.id
WHERE p.is_deleted = FALSE
GROUP BY p.priority
ORDER BY
    CASE p.priority
        WHEN 'High' THEN 1
        WHEN 'Medium' THEN 2
        WHEN 'Low' THEN 3
    END;
```

### Dashboard Query 3: Resource Workload Chart Data

```sql
SELECT
    resource_name,
    weekly_capacity_hrs,
    current_allocation_hrs,
    utilization_pct
FROM v_resources_utilization
WHERE is_deleted = FALSE
  AND is_active = TRUE
ORDER BY utilization_pct DESC;
```

### Dashboard Query 4: Tasks Due This Week

```sql
SELECT
    DATE_TRUNC('day', t.deadline) AS due_date,
    COUNT(*) AS task_count,
    SUM(tm.total_estimate_hrs) AS total_hours,
    ARRAY_AGG(t.task_id ORDER BY t.deadline) AS task_ids
FROM tasks t
LEFT JOIN v_tasks_with_metrics tm ON tm.id = t.id
WHERE t.is_deleted = FALSE
  AND t.status NOT IN ('Done', 'Cancelled')
  AND t.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', t.deadline)
ORDER BY due_date ASC;
```

---

## 🎯 DESIGN DECISIONS EXPLAINED

### Decision 1: GENERATED Columns vs Views for Derived Fields

**Decision:** Use **GENERATED columns** for simple arithmetic (totals) and **VIEWS** for complex logic (percentages, aggregations).

**Rationale:**

- **GENERATED Columns (estimate_hrs, total_estimate_hrs, total_actual_hrs):**
  - ✅ **Performance:** Stored on disk, no calculation overhead during SELECT
  - ✅ **Simplicity:** Simple arithmetic (estimate_days * 8, r1 + r2)
  - ✅ **Indexable:** Can create indexes on GENERATED columns for fast queries
  - ❌ **Limited Logic:** Cannot use CASE statements or complex expressions
  - ❌ **Single Table:** Cannot reference other tables

- **Views (r1_completion_pct, project aggregations):**
  - ✅ **Complex Logic:** Supports CASE, division-by-zero checks, NULLIF
  - ✅ **Cross-Table:** Can join multiple tables for aggregations
  - ✅ **Real-Time:** Always reflects current data state
  - ✅ **No Storage:** Doesn't consume disk space
  - ❌ **Calculation Overhead:** Computed during every SELECT query
  - ❌ **Not Indexable:** Cannot index view columns directly

**When to Use Each:**

| Scenario | Use GENERATED | Use VIEW | Use Materialized VIEW |
|----------|---------------|----------|----------------------|
| Simple arithmetic (A + B, A * 8) | ✅ | ❌ | ❌ |
| Division with zero checks | ❌ | ✅ | ✅ |
| Aggregations (SUM, COUNT) | ❌ | ✅ | ✅ |
| Cross-table joins | ❌ | ✅ | ✅ |
| Frequently queried, rarely changed | ❌ | ❌ | ✅ |
| Must be real-time accurate | ✅ | ✅ | ❌ |

### Decision 2: Regular Views vs Materialized Views

**Decision:** Use **regular views** for all derived calculations initially. Consider **materialized views** only for dashboard if performance becomes an issue.

**Rationale:**

- **Regular Views:**
  - ✅ **Always Current:** No staleness, no refresh complexity
  - ✅ **Simple:** No maintenance, no refresh schedules
  - ✅ **Matches Excel Behavior:** Excel formulas recalculate immediately
  - ❌ **Query Performance:** Slower for complex aggregations

- **Materialized Views:**
  - ✅ **Fast Queries:** Pre-computed results stored on disk
  - ✅ **Good for Dashboards:** Read-heavy, infrequent updates acceptable
  - ❌ **Staleness:** Data can be outdated between refreshes
  - ❌ **Maintenance Overhead:** Requires REFRESH MATERIALIZED VIEW calls
  - ❌ **Complexity:** Need refresh triggers or cron jobs

**Recommendation:**
- Start with regular views for all derived fields
- Monitor query performance with `EXPLAIN ANALYZE`
- If dashboard queries exceed 500ms, materialize `v_dashboard_metrics` only
- Refresh materialized view every 5 minutes via cron or n8n workflow

### Decision 3: Dual Soft Delete Strategy (status='Cancelled' + is_deleted)

**Decision:** Use **both** `status = 'Cancelled'` (business logic) and `is_deleted = TRUE` (system flag).

**Rationale:**

**status='Cancelled':**
- ✅ **Business Meaning:** Clear to users that task is cancelled
- ✅ **Reporting:** Appears in status reports and metrics
- ✅ **Audit Trail:** Status transitions logged
- ✅ **Partial Completion:** Can have actual hours even when cancelled

**is_deleted boolean:**
- ✅ **System Flag:** Clean filtering in queries (WHERE is_deleted = FALSE)
- ✅ **Consistent Pattern:** All tables use same soft delete mechanism
- ✅ **Separate Concerns:** Business status vs system deletion
- ✅ **Restore Support:** Easy to restore by flipping flag

**Constraint Enforcement:**
```sql
CONSTRAINT chk_cancelled_vs_deleted CHECK (
    (status = 'Cancelled' AND is_deleted = TRUE) OR
    (status != 'Cancelled')
)
```

This ensures:
- If status is 'Cancelled', then is_deleted MUST be TRUE
- If is_deleted is FALSE, then status CANNOT be 'Cancelled'

### Decision 4: UUID Primary Keys Named "id"

**Decision:** Use **UUID** type with column name **"id"** (not "entity_uuid").

**Rationale:**

- ✅ **Immutability:** UUIDs never change, perfect for audit trails
- ✅ **Distributed Systems:** Can generate offline, no central coordinator
- ✅ **Security:** Non-guessable, prevents enumeration attacks
- ✅ **Foreign Keys:** Clean references (project_id, resource1_id, resource2_id)
- ✅ **Convention:** "id" is standard in most ORMs and frameworks
- ❌ **Storage:** 16 bytes vs 4 bytes for INT (acceptable tradeoff)
- ❌ **Human Readability:** Not user-friendly (solved by display IDs: PRJ-001, TSK-001)

**Why "id" instead of "project_uuid"?**
- **Consistency:** All tables use same column name
- **Framework Support:** ORMs expect "id" as primary key
- **Cleaner SQL:** `SELECT * FROM projects WHERE id = ?`
- **Foreign Keys:** `project_id` clearly indicates it's a foreign key to `projects.id`

### Decision 5: Separate Display IDs (project_id, task_id) from UUIDs

**Decision:** Maintain **two ID systems**: UUID for system use, display ID for humans.

**Rationale:**

- ✅ **User Experience:** "PRJ-001" more readable than "550e8400-e29b-41d4-a716-..."
- ✅ **Backwards Compatible:** Matches Excel format
- ✅ **Reporting:** User-friendly in exports and dashboards
- ✅ **System Integrity:** UUID remains immutable for foreign keys
- ✅ **Search:** Users can search by "TSK-001" easily

**Implementation:**
```sql
-- UUID: Immutable, used in foreign keys
id UUID PRIMARY KEY

-- Display ID: User-facing, unique constraint, formatted
project_id VARCHAR(20) NOT NULL
CONSTRAINT chk_project_id_format CHECK (project_id ~ '^PRJ-[0-9]{3}$')
```

### Decision 6: Audit Log with JSONB (not EAV)

**Decision:** Store complete record states as **JSONB** in `before_json` and `after_json`.

**Rationale:**

**JSONB Approach:**
- ✅ **Complete Context:** Full record state preserved
- ✅ **Flexible Schema:** No schema changes when adding fields
- ✅ **Queryable:** PostgreSQL JSONB operators support JSON queries
- ✅ **Simple:** Single row per change
- ✅ **Time Travel:** Can reconstruct record state at any point

**Alternative (EAV - Entity-Attribute-Value):**
- ❌ **Complex:** Each field change is separate row
- ❌ **Reconstruction:** Difficult to rebuild full record state
- ❌ **Query Performance:** Requires complex JOINs
- ❌ **Storage:** Often uses more space than JSONB

**Example JSONB Storage:**
```json
{
  "before_json": {
    "task_id": "TSK-001",
    "status": "Backlog",
    "r1_actual_hrs": 0
  },
  "after_json": {
    "task_id": "TSK-001",
    "status": "In Progress",
    "r1_actual_hrs": 5
  },
  "changed_fields": ["status", "r1_actual_hrs"]
}
```

### Decision 7: Foreign Keys with RESTRICT (not CASCADE)

**Decision:** Use **ON DELETE RESTRICT** for all foreign keys.

**Rationale:**

- ✅ **Safety:** Prevents accidental data loss
- ✅ **Explicit Deletes:** Forces user to handle child records
- ✅ **Soft Delete Support:** Works with soft delete pattern
- ✅ **Referential Integrity:** Database enforces relationships

**Example:**
```sql
CONSTRAINT fk_tasks_project FOREIGN KEY (project_id)
    REFERENCES projects(id) ON DELETE RESTRICT
```

**Behavior:**
- ❌ Cannot DELETE project if tasks exist
- ✅ Must soft delete tasks first, then soft delete project
- ✅ Prevents orphaned tasks

**Alternative (CASCADE):**
- ❌ **Dangerous:** Deleting project deletes all tasks (data loss)
- ❌ **Hidden Side Effects:** User may not realize cascade occurs
- ❌ **Incompatible with Soft Delete:** Hard deletes when we want soft deletes

---

## 📌 SUMMARY

This migration plan provides:

1. ✅ **Step-by-step migration** from Excel to PostgreSQL
2. ✅ **Formula preservation** via database views
3. ✅ **Sample INSERT statements** with realistic data
4. ✅ **Query examples** for common use cases
5. ✅ **Dashboard queries** for metrics and reporting
6. ✅ **Design decision explanations** for architecture choices

**Key Takeaways:**

- **UUID + Display ID**: Best of both worlds (system integrity + user experience)
- **GENERATED columns for simple math**: Performance boost for totals
- **Views for complex logic**: Real-time accuracy, matches Excel behavior
- **Dual soft delete**: Business status + system flag for clean queries
- **JSONB audit log**: Complete history, flexible schema, queryable
- **Foreign key RESTRICT**: Safety first, explicit deletions

**Next Steps:**

1. Execute DDL script: `psql -d qc_scenario_planning -f QC_PostgreSQL_DDL.sql`
2. Run migration scripts from Phase 2 and Phase 3
3. Validate formulas match Excel (Phase 4 and 5)
4. Configure n8n workflows to use database
5. Cutover to production (Phase 6)
