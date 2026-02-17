-- Migration 011: Link app_user to resources
-- Description: Add user_id FK to resources table for user-to-resource provisioning
-- Date: 2026-02-16

BEGIN;

-- Add user_id FK to resources (nullable — legacy/manual resources keep working)
ALTER TABLE resources ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);

-- Unique partial index: one active resource per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_user_id_active
    ON resources(user_id) WHERE deleted_at IS NULL AND user_id IS NOT NULL;

-- Backfill: match existing resources to users by email (best-effort)
UPDATE resources r
SET user_id = u.id
FROM app_user u
WHERE LOWER(r.email) = LOWER(u.email)
    AND r.user_id IS NULL
    AND r.deleted_at IS NULL;

-- Update v_resources_with_utilization to expose user_id
CREATE OR REPLACE VIEW v_resources_with_utilization AS
SELECT
    r.id,
    r.resource_name,
    r.user_id,
    r.weekly_capacity_hrs,
    r.is_active,
    r.email,
    r.department,
    r.role,

    -- Calculate current allocation from active tasks
    COALESCE(
        (SELECT SUM(t.r1_estimate_hrs)
         FROM task t
         WHERE t.resource1_id = r.id
           AND t.deleted_at IS NULL
           AND t.status NOT IN ('Done', 'Cancelled')),
        0
    ) + COALESCE(
        (SELECT SUM(t.r2_estimate_hrs)
         FROM task t
         WHERE t.resource2_id = r.id
           AND t.deleted_at IS NULL
           AND t.status NOT IN ('Done', 'Cancelled')),
        0
    ) AS current_allocation_hrs,

    -- Utilization percentage
    CASE
        WHEN r.weekly_capacity_hrs > 0 THEN
            ROUND((
                (COALESCE(
                    (SELECT SUM(t.r1_estimate_hrs)
                     FROM task t
                     WHERE t.resource1_id = r.id
                       AND t.deleted_at IS NULL
                       AND t.status NOT IN ('Done', 'Cancelled')),
                    0
                ) + COALESCE(
                    (SELECT SUM(t.r2_estimate_hrs)
                     FROM task t
                     WHERE t.resource2_id = r.id
                       AND t.deleted_at IS NULL
                       AND t.status NOT IN ('Done', 'Cancelled')),
                    0
                )) / r.weekly_capacity_hrs * 100
            )::NUMERIC, 2)
        ELSE 0
    END AS utilization_pct,

    -- Available hours
    r.weekly_capacity_hrs - (
        COALESCE(
            (SELECT SUM(t.r1_estimate_hrs)
             FROM task t
             WHERE t.resource1_id = r.id
               AND t.deleted_at IS NULL
               AND t.status NOT IN ('Done', 'Cancelled')),
            0
        ) + COALESCE(
            (SELECT SUM(t.r2_estimate_hrs)
             FROM task t
             WHERE t.resource2_id = r.id
               AND t.deleted_at IS NULL
               AND t.status NOT IN ('Done', 'Cancelled')),
            0
        )
    ) AS available_hrs,

    -- Task counts
    (SELECT COUNT(*)
     FROM task t
     WHERE (t.resource1_id = r.id OR t.resource2_id = r.id)
       AND t.deleted_at IS NULL
       AND t.status = 'In Progress'
    ) AS active_tasks_count,

    (SELECT COUNT(*)
     FROM task t
     WHERE (t.resource1_id = r.id OR t.resource2_id = r.id)
       AND t.deleted_at IS NULL
       AND t.status = 'Backlog'
    ) AS backlog_tasks_count,

    -- Timestamps
    r.created_at,
    r.created_by,
    r.updated_at,
    r.updated_by,
    r.deleted_at,
    r.deleted_by

FROM resources r
WHERE r.deleted_at IS NULL;

COMMENT ON COLUMN resources.user_id IS 'FK to app_user — set when admin converts user to resource';

COMMIT;

-- Rollback:
-- BEGIN;
-- CREATE OR REPLACE VIEW v_resources_with_utilization AS ... (original without user_id);
-- DROP INDEX IF EXISTS idx_resources_user_id_active;
-- ALTER TABLE resources DROP COLUMN IF EXISTS user_id;
-- COMMIT;
