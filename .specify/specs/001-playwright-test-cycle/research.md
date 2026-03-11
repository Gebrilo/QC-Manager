# Research: Playwright Test Cycle Setup

## Feature Context
The feature requires a comprehensive Playwright test cycle covering the entire application (both frontend and backend). The tests should run locally using the default Chromium engine and do not require immediate CI/CD integration.

## Current System State
1.  **Frontend (`apps/web`)**: A Next.js application that already has Playwright configured (`@playwright/test` dependency is present, and `test:e2e` scripts exist in `package.json`).
2.  **Backend (`apps/api`)**: A Node.js/Express application currently using Jest for testing. It interacts with a PostgreSQL database.
3.  **Project Structure**: The repository uses a monorepo-style structure inside an `apps/` directory, containing both the Next.js `web` app and the Express `api` app.
4.  **Existing Configuration**: There is a `.playwright` configuration directory at the root, which indicates some existing root-level Playwright setup.

## Research Findings and Decisions

### 1. Test Suite Location and Architecture
- **Decision**: Centralize the end-to-end tests in a dedicated folder at the repository root (e.g., `tests/e2e/` or utilizing the existing `.playwright` structure if applicable) rather than isolating them only within the frontend app.
- **Rationale**: Since the goal is a "full test cycle over the whole app" encompassing both front and back features, a root-level test suite can coordinate starting both services or assume they are running, and interact with both the UI and the API directly if needed.
- **Alternatives considered**:
    - *Frontend-only tests*: Keeping tests purely in `apps/web`. Rejected because it makes it harder to logically separate tests that heavily focus on API integration or backend state verification independent of the Next.js app.

### 2. Service Orchestration for Local Testing
- **Decision**: The tests should assume the local environment is fully running (via the existing `docker-compose.yml` or manual startup scripts like `start_dev.bat`). We will add documentation on how to ensure the environment is ready before running the suite.
- **Rationale**: The user specified local execution without CI/CD. The existing `docker-compose.yml` provides a reliable way to spin up the database, API, and frontend. Playwright can simply connect to `localhost:3000` (web) and `localhost:3001` (api).
- **Alternatives considered**:
    - *Playwright `webServer` config*: Having Playwright start the Next.js and Express apps. Rejected because orchestrating a database, backend, and frontend via Playwright's `webServer` is fragile compared to using the established Docker Compose setup.

### 3. Backend State Verification
- **Decision**: Use Playwright's `request` context (API Testing capability) to verify backend state mutations directly alongside UI assertions.
- **Rationale**: The spec requires verifying backend state changes (FR-002). Playwright allows creating an APIRequestContext to make HTTP calls to the backend API directly within the same test that interacts with the UI, ensuring the database state matches the UI state.
- **Alternatives considered**:
    - *Querying the database directly from tests*: Rejected due to added complexity of managing DB connections in tests and tying tests to internal database structure rather than the public API contract.

### 4. Browser Configuration
- **Decision**: Configure `playwright.config.ts` to exclusively use the Chromium engine as specified by the user's clarification.
- **Rationale**: Directly answers the clarified requirement for faster, focused local testing without the overhead of WebKit and Firefox.

## Conclusion and Next Steps
The research phase confirms that the existing monorepo structure and Docker Compose setup form a solid foundation. The primary work will involve configuring a root-level or dedicated Playwright project, defining the unified configuration for Chromium, and writing the actual test scenarios that orchestrate UI actions and API validations. No further clarifications are needed.
