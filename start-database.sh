#!/bin/bash

# Start Database Helper Script
# This script waits for Docker to be ready and then starts the PostgreSQL database

echo "======================================"
echo "Starting PostgreSQL Database"
echo "======================================"
echo ""

# Check if Docker Desktop is running
echo "Checking Docker status..."
MAX_WAIT=60  # Maximum wait time in seconds
WAIT_TIME=0

while ! docker info > /dev/null 2>&1; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        echo "❌ Docker is not responding after ${MAX_WAIT} seconds"
        echo ""
        echo "Please start Docker Desktop manually:"
        echo "  1. Open Docker Desktop from Start Menu"
        echo "  2. Wait for it to fully start (whale icon should be steady)"
        echo "  3. Run this script again"
        exit 1
    fi

    echo "   Waiting for Docker to start... ($WAIT_TIME/${MAX_WAIT}s)"
    sleep 5
    WAIT_TIME=$((WAIT_TIME + 5))
done

echo "✅ Docker is running"
echo ""

# Navigate to docker directory
cd "d:\Claude\QC management tool\qc-app\docker" || exit 1

# Start PostgreSQL
echo "Starting PostgreSQL container..."
docker-compose -f docker-compose.local.yml up -d postgres

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ PostgreSQL container started successfully!"
    echo ""
    echo "Container details:"
    docker-compose -f docker-compose.local.yml ps postgres
    echo ""
    echo "Database connection:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: qc_management"
    echo "  User: qc_user"
    echo ""
    echo "Waiting for database to be ready..."
    sleep 5

    echo ""
    echo "Next steps:"
    echo "  1. Run migration: psql -U qc_user -d qc_management -f database/migrations/002_simplified_test_results.sql"
    echo "  2. Get project ID: psql -U qc_user -d qc_management -c 'SELECT id, name FROM project LIMIT 3;'"
    echo "  3. Upload results: node scripts/testsprite-upload.js <project-id> test-testsprite-sample.json"
else
    echo ""
    echo "❌ Failed to start PostgreSQL container"
    echo ""
    echo "Try running manually:"
    echo "  cd \"d:\\Claude\\QC management tool\\qc-app\\docker\""
    echo "  docker-compose -f docker-compose.local.yml up -d postgres"
    exit 1
fi
