@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: QC Management Tool — Build and Push Docker Images to Docker Hub
:: =============================================================================
::
:: Usage:
::   build-and-push.bat                          (uses .env DOCKER_HUB_USERNAME, tags as "latest")
::   build-and-push.bat myuser                   (tags as "latest")
::   build-and-push.bat myuser v1.0.0            (tags as "v1.0.0" + "latest")
::   build-and-push.bat myuser v1.0.0 https://api.example.com  (custom API URL)
::
:: =============================================================================

:: --- Parse arguments ---
set "USERNAME=%~1"
set "VERSION=%~2"
set "API_URL=%~3"

:: --- Defaults ---
if "%USERNAME%"=="" (
    :: Try to read from .env file
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="DOCKER_HUB_USERNAME" set "USERNAME=%%b"
    )
)
if "%USERNAME%"=="" (
    echo [ERROR] Docker Hub username not provided.
    echo Usage: build-and-push.bat ^<username^> [version] [api_url]
    exit /b 1
)
if "%VERSION%"=="" set "VERSION=latest"
if "%API_URL%"=="" set "API_URL=http://localhost:3001"

:: --- Image names ---
set "API_IMAGE=%USERNAME%/qc-api"
set "WEB_IMAGE=%USERNAME%/qc-web"

echo.
echo ============================================================
echo   QC Management Tool — Docker Build ^& Push
echo ============================================================
echo   Username:    %USERNAME%
echo   Version:     %VERSION%
echo   API URL:     %API_URL%
echo   API Image:   %API_IMAGE%:%VERSION%
echo   Web Image:   %WEB_IMAGE%:%VERSION%
echo ============================================================
echo.

:: --- Step 1: Verify Docker is available ---
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    exit /b 1
)

:: --- Step 2: Build API image ---
echo [1/4] Building API image...
docker build -t %API_IMAGE%:%VERSION% -t %API_IMAGE%:latest ./apps/api
if %errorlevel% neq 0 (
    echo [ERROR] API image build failed.
    exit /b 1
)
echo [OK] API image built successfully.
echo.

:: --- Step 3: Build Web image ---
echo [2/4] Building Web image...
docker build --build-arg NEXT_PUBLIC_API_URL=%API_URL% -t %WEB_IMAGE%:%VERSION% -t %WEB_IMAGE%:latest ./apps/web
if %errorlevel% neq 0 (
    echo [ERROR] Web image build failed.
    exit /b 1
)
echo [OK] Web image built successfully.
echo.

:: --- Step 4: Push API image ---
echo [3/4] Pushing API image...
docker push %API_IMAGE%:%VERSION%
if "%VERSION%" neq "latest" (
    docker push %API_IMAGE%:latest
)
if %errorlevel% neq 0 (
    echo [ERROR] API image push failed. Run 'docker login' first.
    exit /b 1
)
echo [OK] API image pushed.
echo.

:: --- Step 5: Push Web image ---
echo [4/4] Pushing Web image...
docker push %WEB_IMAGE%:%VERSION%
if "%VERSION%" neq "latest" (
    docker push %WEB_IMAGE%:latest
)
if %errorlevel% neq 0 (
    echo [ERROR] Web image push failed.
    exit /b 1
)
echo [OK] Web image pushed.
echo.

:: --- Summary ---
echo ============================================================
echo   SUCCESS — All images built and pushed!
echo ============================================================
echo.
echo   Pull commands:
echo     docker pull %API_IMAGE%:%VERSION%
echo     docker pull %WEB_IMAGE%:%VERSION%
echo.
echo   Quick run (standalone):
echo     docker run -d -p 3001:3001 --env-file .env %API_IMAGE%:%VERSION%
echo     docker run -d -p 3000:3000 %WEB_IMAGE%:%VERSION%
echo.
echo   Production deploy:
echo     docker compose -f docker-compose.prod.yml up -d
echo ============================================================

endlocal
