$containerName = "qc-app-postgres-1"
$dbName = "qcdb"
$user = "postgres"
$outputFile = "qc_production_backup.sql"

Write-Host "Backing up database '$dbName' from container '$containerName'..."

# Check if container is running
$running = docker ps -q -f name=$containerName
if (-not $running) {
    Write-Error "Container '$containerName' is not running!"
    exit 1
}

# Execute pg_dump
docker exec $containerName pg_dump -U $user $dbName > $outputFile

if ($?) {
    Write-Host "Backup successful! File saved to: $PWD\$outputFile"
} else {
    Write-Error "Backup failed."
}
