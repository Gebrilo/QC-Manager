#!/bin/sh
# db-migrate.sh — Run pending migrations on an already-running postgres container
# Safe to run multiple times (idempotent SQL)
# Usage: ./scripts/db-migrate.sh

docker exec qc-postgres sh -c "psql -U \$POSTGRES_USER -d qc_app -c \"
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id
ON audit_logs(entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action);
\""
