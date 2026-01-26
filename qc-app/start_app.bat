@echo off
echo Starting QC Management Tool...
docker compose -f docker/docker-compose.local.yml up -d
echo.
echo Services started!
echo Frontend: http://localhost:3000
echo Backend: http://localhost:3001
echo n8n: http://localhost:5678
echo.
pause
