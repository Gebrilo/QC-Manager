@echo off
echo ==========================================
echo   QC Management Tool - Dev Mode
echo ==========================================

echo Checking Docker status...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not running! Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo Starting Database and N8N containers...
docker-compose up -d postgres n8n

echo Starting API Server...
cd apps\api
if not exist node_modules (
    echo Installing API dependencies...
    call npm install
)
start "QC API" cmd /k "npm run dev"
cd ..\..

echo Starting Web Client...
cd apps\web
if not exist node_modules (
    echo Installing Web dependencies...
    call npm install
)
start "QC Web" cmd /k "npm run dev"
cd ..\..

echo ==========================================
echo   Dev environment started!
echo   API: http://localhost:3001/api/health
echo   Web: http://localhost:3000
echo ==========================================
pause
