-- Enable Supabase Realtime for task and notification tables
-- These policies allow the anon role to receive change notifications.
-- Actual data access is still gated by the Express API + JWT auth.
-- The frontend uses these events only as a trigger to refetch from the API.

-- Enable row-level security (required for Realtime to filter)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

-- Permissive SELECT policies (anon key can subscribe to changes)
CREATE POLICY IF NOT EXISTS "realtime_task_select"
  ON tasks FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "realtime_notification_select"
  ON notification FOR SELECT USING (true);

-- Add tables to Supabase realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notification;
