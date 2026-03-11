# Quickstart: Running the Playwright Test Cycle

This document explains how to set up and run the comprehensive end-to-end test suite for the QC Management Tool.

## Prerequisites

1.  **Docker & Docker Compose**: Ensure the local environment is fully running. The tests run against the local instance.
2.  **Node.js**: Ensure Node.js is installed to run the Playwright CLI.

## Environment Setup

1.  Start the full local stack:
    ```bash
    # From the repository root
    docker-compose up -d
    ```
    *Wait for all services to be healthy (specifically `frontend` on port 3000 and `api` on port 3001).*

2.  Install Playwright browsers (first time only):
    ```bash
    # From the repository root
    npx playwright install chromium
    ```

## Running the Tests

The tests are configured to use the Chromium browser engine locally. 

### Run all tests
```bash
npx playwright test
```

### Run tests in UI mode (Interactive)
Excellent for debugging and visually seeing what the test is doing:
```bash
npx playwright test --ui
```

### Run a specific test file
```bash
npx playwright test tests/e2e/login.spec.ts
```

## Viewing the Report

If tests fail or you want a detailed breakdown of the execution:
```bash
npx playwright show-report
```
