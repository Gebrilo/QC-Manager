-- Migration 007: Create Report Jobs Table
-- Description: Create table for async report generation tracking
-- Date: 2025-01-27

BEGIN;

-- Create report_jobs table for tracking async report generation
CREATE TABLE IF NOT EXISTS report_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL CHECK (
        report_type IN ('project_status', 'resource_utilization', 'task_export', 'test_results', 'dashboard')
    ),
    format VARCHAR(10) NOT NULL CHECK (format IN ('xlsx', 'csv', 'json', 'pdf')),
    status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (
        status IN ('processing', 'completed', 'failed', 'cancelled')
    ),
    filters JSONB,
    download_url TEXT,
    filename VARCHAR(255),
    file_size VARCHAR(50),
    error_message TEXT,
    user_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for report_jobs
CREATE INDEX IF NOT EXISTS idx_report_jobs_status
    ON report_jobs(status) WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_report_jobs_user_email
    ON report_jobs(user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_jobs_created_at
    ON report_jobs(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE report_jobs IS 'Async report generation job tracking';
COMMENT ON COLUMN report_jobs.report_type IS 'Type of report: project_status, resource_utilization, task_export, test_results';
COMMENT ON COLUMN report_jobs.format IS 'Output format: xlsx, csv, json, pdf';
COMMENT ON COLUMN report_jobs.status IS 'Job status: processing, completed, failed, cancelled';
COMMENT ON COLUMN report_jobs.filters IS 'Report filters in JSON format (project_ids, date_range, etc.)';
COMMENT ON COLUMN report_jobs.download_url IS 'URL to download completed report file';
COMMENT ON COLUMN report_jobs.filename IS 'Generated filename';
COMMENT ON COLUMN report_jobs.file_size IS 'File size (e.g., "245 KB")';
COMMENT ON COLUMN report_jobs.error_message IS 'Error details if status is failed';
COMMENT ON COLUMN report_jobs.user_email IS 'Email of user who requested report';

COMMIT;

-- Rollback script (save separately as 007_rollback.sql):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_report_jobs_created_at;
-- DROP INDEX IF EXISTS idx_report_jobs_user_email;
-- DROP INDEX IF EXISTS idx_report_jobs_status;
-- DROP TABLE IF EXISTS report_jobs;
-- COMMIT;
