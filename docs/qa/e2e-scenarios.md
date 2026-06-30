# E2E Scenarios

Key end-to-end test scenarios covering critical user journeys.

## Scenario 1: Admin Full Access

```mermaid
flowchart TD
    A[Login as admin] --> B[View global dashboard]
    B --> C[Manage users: create, edit role, suspend]
    C --> D[Configure RBAC permissions]
    D --> E[Create project]
    E --> F[Configure Tracker Config]
    F --> G[View audit log]
```

## Scenario 2: PM Release Readiness

```mermaid
flowchart TD
    A[Login as PM] --> B[View PM dashboard]
    B --> C[Check quality gate status]
    C --> D[Review test coverage and pass rates]
    D --> E[Review open bugs by severity]
    E --> F[Approve or block release]
```

## Scenario 3: Tester Test Execution

```mermaid
flowchart TD
    A[Login as tester] --> B[View assigned test cases]
    B --> C[Execute test case]
    C --> D[Record result: Pass]
    C --> E[Record result: Fail → create bug]
    D --> F[Upload results batch]
    E --> F
    F --> G[Verify metrics update on dashboard]
```

## Scenario 4: Team Manager Resource Management

```mermaid
flowchart TD
    A[Login as team manager] --> B[View team dashboard]
    B --> C[Check resource utilization]
    C --> D[Assign primary resource to task]
    D --> E[Add secondary resources]
    E --> F[View estimate accuracy per person]
```

## Scenario 5: Viewer Read-Only Access

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as viewer | Redirect to dashboard |
| 2 | Navigate to /projects | See project list |
| 3 | Click on a project | View project details |
| 4 | Attempt to create project | Button hidden or disabled |
| 5 | Attempt to edit task | Form is read-only |

## Scenario 6: Tuleap Sync

```mermaid
flowchart TD
    A[Create bug in Tuleap] --> B[Wait for n8n webhook processing]
    B --> C[Verify bug appears in QC-Manager]
    C --> D[Create task in QC-Manager for Tuleap]
    D --> E[Verify task appears in Tuleap tracker]
```

## Scenario 7: Authentication Flow

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to app without session | Redirect to login |
| 2 | Enter invalid credentials | Error message shown |
| 3 | Enter valid credentials | Redirect to dashboard |
| 4 | Wait for session expiry | Redirect to login on next action |
| 5 | Refresh token | Session extended |

## Scenario 8: Landing Page

| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit / without login | See public landing page |
| 2 | View changelog section | Recent releases shown |
| 3 | View roadmap section | Upcoming items shown |
| 4 | Login as admin | Access /admin/landing-config |
| 5 | Edit landing features | Changes reflect on public page |

> [!NOTE]
> E2E test automation uses Playwright. See `apps/web/` for Playwright configuration.
