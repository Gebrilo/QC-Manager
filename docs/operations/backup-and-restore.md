# Backup and Restore

> [!WARNING]
> **Needs Validation:** No documented application-level backup strategy exists. Supabase provides built-in backups. Staging has a backup sidecar. Verify current procedures.

## Supabase Backups

Supabase provides automated daily backups for Pro plans. Backup retention and recovery procedures are managed through Supabase dashboard.

- **Recovery**: Contact Supabase support or use Point-in-Time Recovery (PITR) if enabled
- **Export**: Use Supabase dashboard or `pg_dump` with connection string

### Manual Export

```bash
pg_dump "$SUPABASE_DATABASE_URL" > qc-manager-backup-$(date +%Y%m%d).sql
```

## Staging Backups

Staging compose includes a backup sidecar with configurable:

- `BACKUP_PATH` — backup directory
- `BACKUP_RETENTION_DAYS` — how long to keep backups

## Application-Level Backup

### What to Back Up

| Data | Location | Method |
|------|----------|--------|
| Database | Supabase PostgreSQL | Supabase PITR or pg_dump |
| Uploaded files | `uploads/` Docker volume | File backup |
| n8n workflows | n8n internal DB | n8n export or n8n workflow JSON files in `n8n/` |
| Environment config | `.env` files | Git (without secrets) or secure vault |

### Restore Procedure

> [!CAUTION]
> Restore procedures are not validated. Test in staging first.

```bash
# 1. Restore database from backup
psql "$SUPABASE_DATABASE_URL" < backup.sql

# 2. Restore uploaded files
# Copy backup to uploads volume mount

# 3. Redeploy API to run migrations
docker compose -f docker-compose.prod.yml up -d --force-recreate api

# 4. Verify
curl -f https://api.gerbil.qc/health
```

## Recommended Improvements

- [ ] Document Supabase backup retention policy
- [ ] Test and document full restore procedure
- [ ] Automate application-level pg_dump on schedule
- [ ] Add backup verification step (restore to staging)
- [ ] Document disaster recovery RTO/RPO targets
