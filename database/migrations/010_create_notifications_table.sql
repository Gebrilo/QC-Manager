-- Migration: Create notifications table
-- Description: In-app notifications for admin events (user registration, activation, etc.)

CREATE TABLE IF NOT EXISTS notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_notification_type CHECK (type IN ('info', 'user_registered', 'user_activated', 'warning', 'success'))
);

CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_read ON notification(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notification_created_at ON notification(created_at DESC);
