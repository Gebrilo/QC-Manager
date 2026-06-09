-- Repair task IDs generated as TSK-NaN and keep future generated IDs numeric.
WITH numeric_max AS (
    SELECT COALESCE(MAX((substring(task_id from 5))::int), 0) AS max_id
    FROM tasks
    WHERE task_id ~ '^TSK-[0-9]+$'
),
corrupt_tasks AS (
    SELECT
        id,
        row_number() OVER (ORDER BY created_at NULLS LAST, id) AS offset_id
    FROM tasks
    WHERE task_id = 'TSK-NaN'
       OR task_id ILIKE 'TSK-%NaN%'
)
UPDATE tasks t
SET task_id = 'TSK-' || lpad((numeric_max.max_id + corrupt_tasks.offset_id)::text, 3, '0')
FROM numeric_max, corrupt_tasks
WHERE t.id = corrupt_tasks.id;
