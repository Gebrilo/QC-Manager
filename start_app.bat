@echo off
echo ==========================================
echo   QC Management Tool - Local Setup
echo ==========================================

echo [1/3] Checking Docker configuration...
if not exist "qc-app\docker\docker-compose.local.yml" (
    echo Error: docker-compose.local.yml not found in qc-app\docker directory.
    echo Please make sure you are running this script from the root 'QC management tool!' folder.
    pause
    exit /b 1
)

echo [2/3] Building and starting containers...
cd qc-app
docker-compose -f docker/docker-compose.local.yml up --build -d
cd ..

echo [3/3] Verifying services...
echo Web App will be available at: http://localhost:3000
echo API will be available at: http://localhost:3001
echo n8n will be available at: http://localhost:5678

echo.
echo ==========================================
echo   Setup Initiated!
echo   Please wait a few minutes for containers to fully start.
echo ==========================================
pause
