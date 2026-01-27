# Database Migrations

This directory contains SQL migration files to enhance the QC Management Tool database schema from its current simple state to the production-ready target design.

## Migration Files

| File | Description | Dependencies |
|------|-------------|--------------|
| `001_enhance_projects_table.sql` | Add display IDs, priority, metrics fields to projects | None |
| `002_enhance_tasks_table.sql` | Add resource assignments, hours tracking, tags to tasks | None |
| `003_create_resources_table.sql` | Create resources table and link to tasks | Migrations 001, 002 |
| `004_create_test_tables.sql` | Create test_cases and test_results tables | Migration 002 |
| `005_create_database_views.sql` | Create calculated metric views | Migrations 001-004 |
| `006_enhance_audit_log.sql` | Add JSONB state capture to audit_log | None |

## Running Migrations

### Option 1: Manual Execution (Development)

Execute migrations in order using `psql`:

```bash
# Connect to database
psql -U qc_user -d qc_db

# Run migrations in sequence
\i database/migrations/001_enhance_projects_table.sql
\i database/migrations/002_enhance_tasks_table.sql
\i database/migrations/003_create_resources_table.sql
\i database/migrations/004_create_test_tables.sql
\i database/migrations/005_create_database_views.sql
\i database/migrations/006_enhance_audit_log.sql

# Verify views exist
\dv

# Test a view
SELECT * FROM v_dashboard_metrics;
```

### Option 2: All-at-Once Script

```bash
# Create a combined migration file
cat database/migrations/*.sql > database/migrations/combined_migration.sql

# Run it
psql -U qc_user -d qc_db -f database/migrations/combined_migration.sql
```

### Option 3: Node.js Migration Script (Automated)

Create `database/run-migrations.js`:

```javascript
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const migrationFiles = [
  '001_enhance_projects_table.sql',
  '002_enhance_tasks_table.sql',
  '003_create_resources_table.sql',
  '004_create_test_tables.sql',
  '005_create_database_views.sql',
  '006_enhance_audit_log.sql',
];

async function runMigrations() {
  for (const file of migrationFiles) {
    console.log(`Running migration: ${file}`);
    const filePath = path.join(__dirname, 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await pool.query(sql);
      console.log(`✅ ${file} completed successfully`);
    } catch (error) {
      console.error(`❌ ${file} failed:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('All migrations completed!');
  await pool.end();
}

runMigrations().catch(console.error);
```

Run it:

```bash
node database/run-migrations.js
```

## Rollback

Each migration file includes a commented rollback script at the bottom. To rollback:

1. Extract the rollback section from the migration file
2. Save it as `XXX_rollback.sql`
3. Run in **reverse order**:

```bash
psql -U qc_user -d qc_db -f 006_rollback.sql
psql -U qc_user -d qc_db -f 005_rollback.sql
psql -U qc_user -d qc_db -f 004_rollback.sql
psql -U qc_user -d qc_db -f 003_rollback.sql
psql -U qc_user -d qc_db -f 002_rollback.sql
psql -U qc_user -d qc_db -f 001_rollback.sql
```

## Verification

After running migrations, verify the schema:

```sql
-- Check tables exist
\dt

-- Check views exist
\dv

-- Check a view works
SELECT * FROM v_projects_with_metrics;

-- Check resources table
SELECT * FROM resources;

-- Check audit log columns
\d audit_log

-- Check test tables
\dt test_*
```

## Migration Strategy

### For Development

- Run all migrations fresh on local database
- Test thoroughly before production

### For Production

- **Backup database first!**
  ```bash
  pg_dump -U qc_user -d qc_db > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- Run migrations during maintenance window
- Test critical queries after migration
- Have rollback scripts ready

## Common Issues

### Issue: Foreign key violations

**Cause:** Existing tasks reference non-existent resources

**Solution:**
```sql
-- Check orphaned tasks
SELECT t.id, t.task_id, t.resource1_id 
FROM task t 
LEFT JOIN resources r ON t.resource1_id = r.id 
WHERE t.resource1_id IS NOT NULL AND r.id IS NULL;

-- Fix: Set resource1_id to NULL for orphaned tasks
UPDATE task SET resource1_id = NULL WHERE resource1_id NOT IN (SELECT id FROM resources);
```

### Issue: View creation fails

**Cause:** Dependent tables not yet created

**Solution:** Run migrations in correct order (001 -> 006)

### Issue: JSONB columns too large

**Cause:** Very large records being captured in audit_log

**Solution:** Truncate before/after state for large fields:
```sql
-- Limit JSONB size in audit trigger
-- Modify audit_trigger_function() to exclude large columns
```

## Best Practices

1. ✅ **Always backup before migrating production**
2. ✅ **Test migrations on copy of production data first**
3. ✅ **Run migrations during low-traffic periods**
4. ✅ **Monitor query performance after migration**
5. ✅ **Keep rollback scripts ready**
6. ✅ **Document any manual data fixes needed**

## What Changed

### Before (Current Schema)
- Simple `project` and `task` tables
- Basic `audit_log` with limited info
- No resource management
- No testing framework integration
- No calculated metrics (all in Excel)

### After (Target Schema)
- Enhanced `project` table with display IDs, priority, soft delete
- Enhanced `task` table with resource assignments, hours tracking, tags
- New `resources` table for team management
- New `test_cases` and `test_results` tables
- Enhanced `audit_log` with JSONB state capture
- **5 database views** for real-time calculated metrics:
  - `v_tasks_with_calculations`
  - `v_projects_with_metrics`
  - `v_resources_with_utilization`
  - `v_dashboard_metrics`
  - `v_audit_trail`

## Performance Notes

- All views use LEFT JOINs for safety
- Views include `WHERE deleted_at IS NULL` filters
- Indexes created on foreign keys and frequently queried columns
- GIN indexes for JSONB and array columns
- Zero-division protection in all percentage calculations

---

**Questions?** Check the [Database Design documentation](../docs/02-architecture/database-design.md) for detailed schema specifications.
