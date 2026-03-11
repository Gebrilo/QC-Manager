# Data Model & State Transitions

While this feature does not introduce new persistent database entities to the application itself, it establishes the testing data models and fixtures required to validate the application's flows.

## Core Test Entities

### 1. User
Represents a user interacting with the system. Tests need reliable profiles to authenticate.

*   `id` (UUID)
*   `email` (String, unique)
*   `password` (String)
*   `role` (Enum: Admin, Manager, User)
*   `status` (Enum: Active, Inactive)

### 2. Task / Ticket (example entity based on Tuleap/QC logic)
Represents work items that the UI interacts with and the backend processes.

*   `id` (String/Integer)
*   `title` (String)
*   `description` (String)
*   `status` (Enum: Open, In Progress, Closed)
*   `assignee_id` (UUID, nullable)

## State Transitions Verified by Tests

The tests will specifically validate these state changes across the stack:

1.  **Authentication Flow**: `Anonymous` -> `Authenticated`
    *   *UI Action*: Fill login form, submit.
    *   *Backend Validation*: Verify session/token exists.
2.  **Resource Creation**: `Non-existent` -> `Created`
    *   *UI Action*: Submit a creation form (e.g., new task).
    *   *Backend Validation*: Verify the exact payload exists in the DB via API endpoint.
3.  **Resource Mutation**: `State A` -> `State B`
    *   *UI Action*: Drag and drop a Kanban card, or edit a field.
    *   *Backend Validation*: Fetch resource via API, assert updated state.

## Fixture Strategy
To ensure test reliability and reproducibility without polluting the production database:
- The tests will run against a dedicated local database instance or rely on robust teardown (`afterEach`/`afterAll`) hooks to clean up mutated state. 
- API context (`request`) provided by Playwright will be used to quickly seed database states before a UI test runs, bypassing slow UI setup where unnecessary.
