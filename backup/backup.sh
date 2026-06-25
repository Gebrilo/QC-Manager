#!/bin/sh
set -eu

timestamp="$(date +%Y%m%d%H%M%S)"
file="/backups/qc-staging-${timestamp}.dump"

pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --no-acl \
  > "${file}"

find /backups -name 'qc-staging-*.dump' -type f -mtime +"${BACKUP_RETENTION_DAYS:-3}" -delete

echo "Wrote ${file}"
