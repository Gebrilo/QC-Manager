-- Migration 013: User preferences and display name
-- Adds display_name and a preferences JSONB column to app_user

ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS preferences  JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app_user.display_name IS 'User-chosen display name shown in the app UI';
COMMENT ON COLUMN app_user.preferences  IS 'JSON blob of UI preferences: theme, quick_nav_visible, default_page, etc.';
