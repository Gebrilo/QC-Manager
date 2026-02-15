-- Migration 008: Add phone column to app_user and create permissions table
-- Run this after the base schema has been applied

-- Add phone column to app_user
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Create index on app_user email for auth lookups
CREATE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email);

-- Create user_permissions table for granular access control
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL,
    granted BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- Insert default permissions for existing users based on their role
-- Permission keys follow the pattern: page:<page_name> or action:<module>:<action>
-- This will be done dynamically by the API when users are created/updated

-- Add trigger for updated_at on app_user
CREATE TRIGGER update_app_user_updated_at BEFORE UPDATE ON app_user
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for updated_at on user_permissions
CREATE TRIGGER update_user_permissions_updated_at BEFORE UPDATE ON user_permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
