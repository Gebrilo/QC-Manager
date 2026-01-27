#!/bin/bash
# QC Management Tool - Database Backup Script
# Should be placed at: /usr/local/bin/backup-qc-db.sh

BACKUP_DIR="/opt/backups/qc-manager"
DATE=$(date +%Y%m%d_%H%M%S)
DEPLOY_DIR="/opt/QC-Manager"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Change to deployment directory
cd $DEPLOY_DIR

# Perform backup
echo "Starting backup at $(date)"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U qc_user qc_app | gzip > $BACKUP_DIR/qc_backup_$DATE.sql.gz

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: qc_backup_$DATE.sql.gz"
    
    # Keep only last 7 days of backups
    find $BACKUP_DIR -name "qc_backup_*.sql.gz" -mtime +7 -delete
    echo "Old backups cleaned up"
else
    echo "Backup failed!"
    exit 1
fi

# Show backup file size
ls -lh $BACKUP_DIR/qc_backup_$DATE.sql.gz
