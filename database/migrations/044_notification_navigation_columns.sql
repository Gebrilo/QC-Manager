-- 044: navigation + provenance columns for the notification module (see issue #203)
ALTER TABLE notification ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE notification ADD COLUMN IF NOT EXISTS entity_id   UUID;
ALTER TABLE notification ADD COLUMN IF NOT EXISTS action      VARCHAR(30);
ALTER TABLE notification ADD COLUMN IF NOT EXISTS actor_id    UUID;
CREATE INDEX IF NOT EXISTS idx_notification_entity ON notification(entity_type, entity_id);
