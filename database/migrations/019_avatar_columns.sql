-- Migration 019: Avatar storage columns on app_user
-- avatar_url: NULL = no custom avatar (use initials fallback)
-- avatar_type: 'initials' | 'preset' | 'upload'

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(10)
      CHECK (avatar_type IN ('initials', 'preset', 'upload'))
      DEFAULT 'initials';

COMMENT ON COLUMN app_user.avatar_url  IS 'URL path to avatar image; NULL means use initials';
COMMENT ON COLUMN app_user.avatar_type IS 'initials = generated, preset = built-in icon, upload = user file';
