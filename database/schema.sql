-- QC Management Tool Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Project Table
CREATE TABLE project (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255),
    start_date DATE,
    target_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled', 'deleted'))
);

-- Task Table
CREATE TABLE task (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    assignee VARCHAR(255),
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_task_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked', 'deleted')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

-- Audit Log Table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    user_id VARCHAR(255),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_action CHECK (action IN ('create', 'update', 'delete', 'status_change', 'report_generation', 'report_cleanup'))
);

-- User Table (optional - for authentication)
CREATE TABLE app_user (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'user', 'viewer'))
);

-- Indexes for Performance
CREATE INDEX idx_task_project_id ON task(project_id);
CREATE INDEX idx_task_status ON task(status);
CREATE INDEX idx_task_assignee ON task(assignee);
CREATE INDEX idx_task_due_date ON task(due_date);
CREATE INDEX idx_project_status ON project(status);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_updated_at BEFORE UPDATE ON project
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_updated_at BEFORE UPDATE ON task
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample Data (for testing)
INSERT INTO project (name, owner, start_date, target_date, status, description)
VALUES
    ('Q1 Quality Audit', 'john.doe@company.com', '2026-01-01', '2026-03-31', 'active', 'Quarterly quality audit for manufacturing'),
    ('Production Line QC', 'jane.smith@company.com', '2026-01-15', '2026-06-30', 'active', 'Ongoing production quality checks');

INSERT INTO task (project_id, name, status, assignee, priority, due_date)
SELECT
    p.id,
    'Initial Setup',
    'completed',
    'john.doe@company.com',
    'high',
    '2026-01-10'
FROM project p WHERE p.name = 'Q1 Quality Audit';

INSERT INTO task (project_id, name, status, assignee, priority, due_date)
SELECT
    p.id,
    'Review Documentation',
    'in_progress',
    'jane.smith@company.com',
    'medium',
    '2026-01-25'
FROM project p WHERE p.name = 'Q1 Quality Audit';

-- Grant permissions (adjust username as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qc_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qc_user;

-- Verification queries
-- SELECT * FROM project;
-- SELECT * FROM task;
