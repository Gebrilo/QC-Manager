-- Migration 033: Redesign status/severity values across all artifact types
-- Test cases: lifecycle statuses → execution statuses (None, Not Run, Review, Pass, Fail, Blocked)
-- Tasks:      Backlog→Todo, Cancelled→Canceled, add Blocked
-- Bugs:       Normalise status + severity to new labels
-- Views:      Update v_bug_summary / v_bug_summary_global for new values

-- =====================================================================
-- 1. TEST CASE STATUS: remap data + add CHECK constraint
--    (column is already VARCHAR from a prior migration)
-- =====================================================================
ALTER TABLE test_case DROP CONSTRAINT IF EXISTS test_case_status_check;

UPDATE test_case
SET status = CASE status
  WHEN 'draft'      THEN 'Not Run'
  WHEN 'active'     THEN 'Not Run'
  WHEN 'deprecated' THEN 'None'
  WHEN 'archived'   THEN 'None'
  ELSE 'Not Run'
END
WHERE status NOT IN ('None', 'Not Run', 'Review', 'Pass', 'Fail', 'Blocked');

ALTER TABLE test_case ALTER COLUMN status SET DEFAULT 'Not Run';

ALTER TABLE test_case ADD CONSTRAINT test_case_status_check
  CHECK (status IN ('None', 'Not Run', 'Review', 'Pass', 'Fail', 'Blocked'));

-- =====================================================================
-- 2. TASK STATUS: remap data, add constraint
--    (table is "tasks"; no existing status CHECK constraint found)
-- =====================================================================
UPDATE tasks
SET status = CASE status
  WHEN 'Backlog'   THEN 'Todo'
  WHEN 'Cancelled' THEN 'Canceled'
  ELSE status
END
WHERE status IN ('Backlog', 'Cancelled');

ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'Todo';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS valid_task_status;
ALTER TABLE tasks ADD CONSTRAINT valid_task_status
  CHECK (status IN ('Todo', 'In Progress', 'Blocked', 'Done', 'Canceled'));

-- =====================================================================
-- 3. BUG STATUS: normalise to new set
-- =====================================================================
ALTER TABLE bugs ALTER COLUMN status SET DEFAULT 'New';

UPDATE bugs
SET status = CASE LOWER(status)
  WHEN 'open'     THEN 'New'
  WHEN 'backlog'  THEN 'New'
  WHEN 'resolved' THEN 'Fixed'
  WHEN 'closed'   THEN 'Closed'
  ELSE status
END
WHERE LOWER(status) IN ('open', 'backlog', 'resolved', 'closed');

-- =====================================================================
-- 4. BUG SEVERITY: normalise to new labels (handle both old QC codes
--    and Tuleap label variants that landed in the DB)
-- =====================================================================
ALTER TABLE bugs ALTER COLUMN severity SET DEFAULT 'None';

UPDATE bugs
SET severity = CASE LOWER(severity)
  WHEN 'critical'        THEN 'Critical Impact'
  WHEN 'critical impact' THEN 'Critical Impact'
  WHEN 'high'            THEN 'Major impact'
  WHEN 'major impact'    THEN 'Major impact'
  WHEN 'medium'          THEN 'Minor Impact'
  WHEN 'minor impact'    THEN 'Minor Impact'
  WHEN 'low'             THEN 'Cosmetic impact'
  WHEN 'cosmetic impact' THEN 'Cosmetic impact'
  ELSE 'None'
END
WHERE severity NOT IN ('None', 'Cosmetic impact', 'Minor Impact', 'Major impact', 'Critical Impact');

-- =====================================================================
-- 5. RECREATE BUG SUMMARY VIEWS with new status / severity buckets
--    (Must DROP first — CREATE OR REPLACE cannot rename existing columns)
-- =====================================================================
DROP VIEW IF EXISTS v_bug_summary CASCADE;
DROP VIEW IF EXISTS v_bug_summary_global CASCADE;

CREATE VIEW v_bug_summary AS
SELECT
    b.project_id,
    p.project_name,
    COUNT(b.id) AS total_bugs,
    COUNT(b.id) FILTER (WHERE b.status IN ('New', 'In Progress', 'Assigned', 'Reopened', 'Blocked')) AS open_bugs,
    COUNT(b.id) FILTER (WHERE b.status IN ('Fixed', 'Verified', 'Duplicate', 'Closed'))              AS closed_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'Critical Impact')  AS critical_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'Major impact')     AS major_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'Minor Impact')     AS minor_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'Cosmetic impact')  AS cosmetic_bugs,
    COUNT(b.id) FILTER (WHERE b.source = 'TEST_CASE')          AS bugs_from_test_cases,
    COUNT(b.id) FILTER (WHERE b.source = 'EXPLORATORY')        AS bugs_from_exploratory,
    COUNT(b.id) FILTER (WHERE array_length(b.linked_test_execution_ids, 1) > 0) AS bugs_from_testing,
    COUNT(b.id) FILTER (WHERE b.linked_test_execution_ids IS NULL
        OR array_length(b.linked_test_execution_ids, 1) = 0)   AS standalone_bugs,
    MAX(b.reported_date) AS latest_bug_date
FROM bugs b
LEFT JOIN projects p ON b.project_id = p.id
WHERE b.deleted_at IS NULL
GROUP BY b.project_id, p.project_name;

CREATE VIEW v_bug_summary_global AS
SELECT
    COUNT(id) AS total_bugs,
    COUNT(id) FILTER (WHERE status IN ('New', 'In Progress', 'Assigned', 'Reopened', 'Blocked')) AS open_bugs,
    COUNT(id) FILTER (WHERE status IN ('Fixed', 'Verified', 'Duplicate', 'Closed'))              AS closed_bugs,
    COUNT(id) FILTER (WHERE severity = 'Critical Impact')  AS critical_bugs,
    COUNT(id) FILTER (WHERE severity = 'Major impact')     AS major_bugs,
    COUNT(id) FILTER (WHERE severity = 'Minor Impact')     AS minor_bugs,
    COUNT(id) FILTER (WHERE severity = 'Cosmetic impact')  AS cosmetic_bugs,
    COUNT(id) FILTER (WHERE source = 'TEST_CASE')          AS bugs_from_test_cases,
    COUNT(id) FILTER (WHERE source = 'EXPLORATORY')        AS bugs_from_exploratory,
    COUNT(id) FILTER (WHERE array_length(linked_test_execution_ids, 1) > 0) AS bugs_from_testing,
    COUNT(id) FILTER (WHERE linked_test_execution_ids IS NULL
        OR array_length(linked_test_execution_ids, 1) = 0)    AS standalone_bugs
FROM bugs
WHERE deleted_at IS NULL;
