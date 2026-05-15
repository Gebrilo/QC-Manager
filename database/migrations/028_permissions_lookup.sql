-- Migration 028: Create permissions lookup table populated from catalog
CREATE TABLE IF NOT EXISTS permissions (
    permission_key VARCHAR(100) PRIMARY KEY,
    domain VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Population is done dynamically from the RBAC catalog at API startup.
-- See apps/api/src/config/db.js runMigrations() for the INSERT loop.
