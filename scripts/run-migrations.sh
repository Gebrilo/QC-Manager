#!/bin/bash
# Database Migration Script for QC-Manager
# Run this script to initialize the database schema and apply all migrations

set -e

# Database connection details
DB_HOST="${DB_HOST:-72.61.157.168}"
DB_PORT="${DB_PORT:-32768}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-Postgres}"

# Prompt for password if not set
if [ -z "$DB_PASSWORD" ]; then
    echo "Enter PostgreSQL password for user '$DB_USER':"
    read -s DB_PASSWORD
fi

export PGPASSWORD="$DB_PASSWORD"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(dirname "$SCRIPT_DIR")/database"

echo "========================================"
echo "QC-Manager Database Migration"
echo "========================================"
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "========================================"

# Test connection
echo ""
echo "Testing database connection..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to database. Please check your credentials and network."
    exit 1
fi
echo "Connection successful!"

# Run base schema
echo ""
echo "Applying base schema..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$DB_DIR/schema.sql"
echo "Base schema applied."

# Run migrations in order
echo ""
echo "Applying migrations..."
for migration in "$DB_DIR/migrations"/*.sql; do
    if [ -f "$migration" ]; then
        echo "  - $(basename "$migration")"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" 2>&1 || true
    fi
done

echo ""
echo "========================================"
echo "Migration completed!"
echo "========================================"

# Verify tables were created
echo ""
echo "Verifying tables..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dt"

unset PGPASSWORD
