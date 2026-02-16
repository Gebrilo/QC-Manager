-- Migration 009: User lifecycle and personal tasks
-- Adds 'contributor' role, 'activated' column, and personal_tasks table

-- Add 'contributor' to valid roles
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE app_user ADD CONSTRAINT valid_role
    CHECK (role IN ('admin', 'manager', 'user', 'viewer', 'contributor'));

-- Add 'activated' column (existing users default to true)
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS activated BOOLEAN DEFAULT false;
UPDATE app_user SET activated = true WHERE activated IS NULL;

-- Personal tasks table (completely separate from project tasks)
CREATE TABLE IF NOT EXISTS personal_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_personal_status CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
    CONSTRAINT valid_personal_priority CHECK (priority IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_id ON personal_tasks(user_id);
