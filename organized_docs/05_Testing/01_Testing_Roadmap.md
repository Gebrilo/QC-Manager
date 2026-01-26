# QC Management Tool - Testing Roadmap

**Version:** 1.0  
**Date:** 2026-01-20  
**Purpose:** Comprehensive testing strategy for QC Management Tool  
**Stack:** Next.js 14 + TypeScript + Express.js + PostgreSQL + n8n

---

## 📋 Table of Contents

1. [Testing Overview](#testing-overview)
2. [Test Categories](#test-categories)
3. [API Testing](#api-testing)
4. [Frontend Testing](#frontend-testing)
5. [Integration Testing](#integration-testing)
6. [E2E Testing](#e2e-testing)
7. [Database Testing](#database-testing)
8. [Workflow Testing](#workflow-testing)
9. [Security Testing](#security-testing)
10. [Performance Testing](#performance-testing)
11. [Test Data](#test-data)
12. [Bug Reporting Template](#bug-reporting-template)

---

## 🎯 Testing Overview

### Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Frontend (Next.js 14)                       │
│   Dashboard | Projects | Tasks | Reports | Login            │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Express.js)                  │
│            /api/projects | /api/tasks | /api/resources       │
└─────────────────────────────┬───────────────────────────────┘
                              │
          ┌───────────────────┴───────────────┐
          ▼                                   ▼
┌──────────────────────┐        ┌──────────────────────────────┐
│  PostgreSQL Database │        │    n8n Workflows             │
│  - projects          │        │  - Audit logging             │
│  - tasks             │        │  - Report generation         │
│  - resources         │        │  - Notifications             │
│  - audit_log         │        │  - Scheduled jobs            │
└──────────────────────┘        └──────────────────────────────┘
```

### Testing Priorities

| Priority | Category | Coverage Target |
|----------|----------|-----------------|
| 🔴 High | API Endpoints | 100% |
| 🔴 High | Authentication | 100% |
| 🟡 Medium | UI Components | 80% |
| 🟡 Medium | E2E Flows | Critical paths |
| 🟢 Low | Performance | Baseline metrics |

---

## 📂 Test Categories

### 1. Unit Tests
- Individual functions and components
- Isolated from external dependencies
- Mock API calls and database

### 2. Integration Tests
- API endpoints with database
- Component interactions
- Service layer testing

### 3. End-to-End (E2E) Tests
- Full user journeys
- Browser automation
- Cross-browser testing

### 4. Security Tests
- Authentication flows
- Authorization checks
- Input validation

---

## 🔌 API Testing

### Base URL
- **Local:** `http://localhost:3001/api`
- **Production:** `https://your-domain.com/api`

### Authentication
All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

### Projects API

#### TC-API-001: GET /api/projects
| Field | Value |
|-------|-------|
| **Description** | Retrieve all projects with metrics |
| **Method** | GET |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Returns array of projects with pagination
- [ ] Filters by status (At Risk, On Track, Complete, No Tasks)
- [ ] Filters by priority (High, Medium, Low)
- [ ] Returns empty array when no projects exist
- [ ] Returns 401 when unauthorized

**Expected Response Fields:**
```json
{
  "success": true,
  "data": [{
    "id": "uuid",
    "project_id": "PRJ-XXX",
    "project_name": "string",
    "priority": "High|Medium|Low",
    "status": "At Risk|On Track|Complete|No Tasks",
    "completion_pct": "number",
    "tasks_done_count": "number",
    "tasks_total_count": "number"
  }]
}
```

---

#### TC-API-002: POST /api/projects
| Field | Value |
|-------|-------|
| **Description** | Create new project |
| **Method** | POST |
| **Auth Required** | Yes |
| **Expected Status** | 201 Created |

**Test Cases:**
- [ ] Creates project with valid data
- [ ] Returns 400 for invalid project_id format (must be PRJ-XXX)
- [ ] Returns 400 for missing required fields
- [ ] Returns 400 for duplicate project_id
- [ ] Returns 401 when unauthorized
- [ ] Validates priority enum values
- [ ] Validates date formats (ISO 8601)

**Request Body:**
```json
{
  "project_id": "PRJ-001",
  "project_name": "Test Project",
  "total_weight": 3,
  "priority": "High",
  "start_date": "2026-01-01",
  "target_date": "2026-03-31"
}
```

---

#### TC-API-003: GET /api/projects/:id
| Field | Value |
|-------|-------|
| **Description** | Get single project by ID |
| **Method** | GET |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Returns project with all fields populated
- [ ] Returns 404 for non-existent project
- [ ] Returns 401 when unauthorized
- [ ] Works with both UUID and project_id

---

#### TC-API-004: PATCH /api/projects/:id
| Field | Value |
|-------|-------|
| **Description** | Update project |
| **Method** | PATCH |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Updates project name
- [ ] Updates priority
- [ ] Updates dates
- [ ] Returns 404 for non-existent project
- [ ] Returns 400 for invalid data
- [ ] Partial updates work correctly

---

### Tasks API

#### TC-API-005: GET /api/tasks
| Field | Value |
|-------|-------|
| **Description** | Retrieve all tasks with metrics |
| **Method** | GET |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Returns array of tasks with pagination
- [ ] Filters by status (Backlog, In Progress, Done, Cancelled)
- [ ] Filters by project_id
- [ ] Filters by assignee (resource)
- [ ] Returns soft-deleted tasks when ?include_deleted=true
- [ ] Returns 401 when unauthorized

---

#### TC-API-006: POST /api/tasks
| Field | Value |
|-------|-------|
| **Description** | Create new task |
| **Method** | POST |
| **Auth Required** | Yes |
| **Expected Status** | 201 Created |

**Test Cases:**
- [ ] Creates task with valid data
- [ ] Returns 400 for invalid task_id format (must be TSK-XXX)
- [ ] Returns 400 for missing required fields
- [ ] Returns 400 for non-existent project_id
- [ ] Returns 400 for non-existent resource name
- [ ] Validates status enum values
- [ ] Validates completed_date required when status=Done
- [ ] Validates R2 hours cannot be set without resource2_name

**Request Body:**
```json
{
  "task_id": "TSK-001",
  "project_id": "PRJ-001",
  "task_name": "Test Task",
  "status": "Backlog",
  "estimate_days": 3,
  "resource1_name": "Basel",
  "r1_estimate_hrs": 24,
  "r1_actual_hrs": 0,
  "deadline": "2026-02-15",
  "tags": ["backend", "testing"],
  "notes": "Test notes"
}
```

---

#### TC-API-007: PATCH /api/tasks/:id
| Field | Value |
|-------|-------|
| **Description** | Update task |
| **Method** | PATCH |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Updates task status
- [ ] Updates actual hours (r1_actual_hrs, r2_actual_hrs)
- [ ] Updates notes
- [ ] Updates tags
- [ ] Validates status transitions
- [ ] Returns 400 for invalid status transition
- [ ] Returns 404 for non-existent task
- [ ] Returns change summary in response

**Status Transition Rules:**
| From | Allowed To |
|------|------------|
| Backlog | In Progress, Cancelled |
| In Progress | Done, Backlog, Cancelled |
| Done | In Progress (re-open) |
| Cancelled | Backlog (restore) |

---

#### TC-API-008: DELETE /api/tasks/:id
| Field | Value |
|-------|-------|
| **Description** | Soft delete task |
| **Method** | DELETE |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Soft deletes task (sets is_deleted=true)
- [ ] Sets status to Cancelled
- [ ] Records deleted_at timestamp
- [ ] Records deleted_by user
- [ ] Returns 404 for non-existent task
- [ ] Returns 400 for already deleted task

---

#### TC-API-009: POST /api/tasks/:id/restore
| Field | Value |
|-------|-------|
| **Description** | Restore deleted task |
| **Method** | POST |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Restores soft-deleted task
- [ ] Sets is_deleted=false
- [ ] Resets status to Backlog
- [ ] Clears deleted_at and deleted_by
- [ ] Returns 400 for non-deleted task
- [ ] Returns 404 for non-existent task

---

### Resources API

#### TC-API-010: GET /api/resources
| Field | Value |
|-------|-------|
| **Description** | Retrieve all resources |
| **Method** | GET |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Returns array of resources
- [ ] Includes utilization metrics
- [ ] Returns 401 when unauthorized

---

#### TC-API-011: POST /api/resources
| Field | Value |
|-------|-------|
| **Description** | Create new resource |
| **Method** | POST |
| **Auth Required** | Yes |
| **Expected Status** | 201 Created |

**Test Cases:**
- [ ] Creates resource with valid data
- [ ] Returns 400 for duplicate resource name
- [ ] Validates email format
- [ ] Validates capacity hours

---

### Reports API

#### TC-API-012: POST /api/reports
| Field | Value |
|-------|-------|
| **Description** | Generate report (async) |
| **Method** | POST |
| **Auth Required** | Yes |
| **Expected Status** | 202 Accepted |

**Test Cases:**
- [ ] Returns job_id and processing status
- [ ] Accepts project_status report type
- [ ] Accepts resource_utilization report type
- [ ] Accepts task_export report type
- [ ] Validates format (xlsx, pdf, csv)
- [ ] Validates date range filters
- [ ] Validates delivery method (download, email)

**Request Body:**
```json
{
  "report_type": "project_status",
  "format": "xlsx",
  "filters": {
    "project_ids": ["PRJ-001"],
    "date_range": {
      "start": "2026-01-01",
      "end": "2026-01-31"
    }
  },
  "delivery": "download"
}
```

---

#### TC-API-013: GET /api/reports/:job_id
| Field | Value |
|-------|-------|
| **Description** | Get report generation status |
| **Method** | GET |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Returns processing status with progress
- [ ] Returns completed status with download_url
- [ ] Returns failed status with error message
- [ ] Returns 404 for non-existent job_id

---

### Dashboard API

#### TC-API-014: GET /api/dashboard
| Field | Value |
|-------|-------|
| **Description** | Get dashboard metrics |
| **Method** | GET |
| **Auth Required** | Yes |
| **Expected Status** | 200 OK |

**Test Cases:**
- [ ] Returns project statistics
- [ ] Returns task distribution by status
- [ ] Returns resource utilization summary
- [ ] Returns recent activity

---

## 🖥️ Frontend Testing

### Pages

#### TC-UI-001: Login Page
**URL:** `/login`

**Test Cases:**
- [ ] Displays login form with email and password fields
- [ ] Shows validation errors for empty fields
- [ ] Shows validation error for invalid email format
- [ ] Shows error message for invalid credentials
- [ ] Redirects to dashboard on successful login
- [ ] Remembers user session across page refreshes

---

#### TC-UI-002: Dashboard Page
**URL:** `/` or `/dashboard`

**Test Cases:**
- [ ] Displays project count statistics
- [ ] Displays task completion metrics
- [ ] Displays resource utilization charts
- [ ] Shows task distribution pie chart
- [ ] Shows recent tasks table
- [ ] Filters update chart data dynamically
- [ ] Responsive layout on mobile

---

#### TC-UI-003: Projects Page
**URL:** `/projects`

**Test Cases:**
- [ ] Displays all projects as cards
- [ ] Shows project status indicators (color-coded)
- [ ] Shows completion percentage progress bars
- [ ] Click on project navigates to detail view
- [ ] Create project button opens modal/form
- [ ] Edit project updates in real-time
- [ ] Delete project shows confirmation
- [ ] Filters by status work correctly
- [ ] Filters by priority work correctly
- [ ] Search by project name works

---

#### TC-UI-004: Tasks Page
**URL:** `/tasks`

**Test Cases:**
- [ ] Displays all tasks in table format
- [ ] Column visibility toggle works
- [ ] Status column shows colored badges
- [ ] Sorting by columns works
- [ ] Pagination works correctly
- [ ] Click on task opens detail/edit modal
- [ ] Create task button opens form
- [ ] Edit task inline works
- [ ] Delete task shows confirmation
- [ ] Bulk status update works
- [ ] Filter by project works
- [ ] Filter by status works
- [ ] Filter by assignee works

---

#### TC-UI-005: Reports Page
**URL:** `/reports`

**Test Cases:**
- [ ] Report type selector works
- [ ] Format selector (XLSX, PDF, CSV) works
- [ ] Date range picker works
- [ ] Project filter works
- [ ] Generate button triggers API call
- [ ] Progress indicator shows during generation
- [ ] Download link appears on completion
- [ ] Error message shows on failure

---

#### TC-UI-006: Preferences Page
**URL:** `/preferences`

**Test Cases:**
- [ ] User profile information displays
- [ ] Update profile saves changes
- [ ] Theme toggle works
- [ ] Notification preferences save

---

### Components

#### TC-COMP-001: TaskTable Component
- [ ] Renders task data correctly
- [ ] Handles empty state gracefully
- [ ] Column toggle shows/hides columns
- [ ] Row click triggers callback
- [ ] Status badge colors match status
- [ ] Estimated vs actual hours display

#### TC-COMP-002: ProjectCard Component
- [ ] Displays project information
- [ ] Progress bar shows completion percentage
- [ ] Status indicator color-coded
- [ ] Click navigates or opens modal
- [ ] Hover effects work

#### TC-COMP-003: Dashboard Charts
- [ ] Pie chart renders with correct data
- [ ] Bar chart shows utilization
- [ ] Animations play on load
- [ ] Tooltips show on hover
- [ ] Legend is clickable

---

## 🔄 Integration Testing

### TC-INT-001: Project → Tasks Cascade
**Scenario:** Creating tasks should update project metrics

**Steps:**
1. Create a new project
2. Verify project has 0 tasks, 0% completion
3. Create a task linked to this project
4. Verify project now has 1 task
5. Mark task as Done
6. Verify project completion percentage updates

---

### TC-INT-002: Resource Allocation
**Scenario:** Task assignment should update resource utilization

**Steps:**
1. Create a resource with 40hrs/week capacity
2. Create tasks assigned to this resource (totaling 60hrs)
3. Verify resource utilization shows overallocation warning
4. Complete one task
5. Verify utilization updates

---

### TC-INT-003: Audit Log Integration
**Scenario:** All mutations should create audit entries

**Steps:**
1. Create a project
2. Verify audit log entry created
3. Update the project
4. Verify audit log entry with before/after values
5. Delete (soft) the project
6. Verify audit log entry

---

## 🌐 E2E Testing

### TC-E2E-001: Complete Project Lifecycle
**Scenario:** Create project, add tasks, complete tasks, generate report

**Steps:**
1. Login as manager
2. Navigate to Projects page
3. Click "Create Project"
4. Fill in project details and submit
5. Verify project appears in list
6. Navigate to Tasks page
7. Click "Create Task"
8. Link task to created project
9. Submit and verify task appears
10. Edit task status to "In Progress"
11. Verify status badge updates
12. Edit task status to "Done"
13. Set completion date
14. Navigate back to Projects
15. Verify project completion percentage increased
16. Navigate to Reports
17. Generate project status report
18. Verify report downloads

---

### TC-E2E-002: Authentication Flow
**Scenario:** Login, session persistence, logout

**Steps:**
1. Navigate to /dashboard (unauthenticated)
2. Verify redirect to /login
3. Enter valid credentials
4. Verify redirect to /dashboard
5. Refresh page
6. Verify still on dashboard (session persisted)
7. Click logout
8. Verify redirect to /login
9. Try navigating to /dashboard
10. Verify redirect to /login

---

### TC-E2E-003: Error Handling Flow
**Scenario:** Handle various error conditions gracefully

**Steps:**
1. Submit form with invalid data
2. Verify validation errors display
3. Simulate network error
4. Verify error message shows
5. Retry operation
6. Verify success after retry

---

## 🗄️ Database Testing

### TC-DB-001: Data Integrity
- [ ] UUID primary keys are generated correctly
- [ ] Foreign key constraints prevent orphan records
- [ ] Unique constraints prevent duplicates
- [ ] Soft delete doesn't remove data
- [ ] Audit triggers fire on mutations

### TC-DB-002: Views Testing
- [ ] v_projects_with_metrics returns correct aggregates
- [ ] v_tasks_with_metrics calculates completion correctly
- [ ] v_resource_utilization shows accurate hours

### TC-DB-003: Concurrency
- [ ] Concurrent task updates don't cause race conditions
- [ ] Updated_at timestamps reflect last modification

---

## ⚙️ Workflow Testing (n8n)

### TC-WF-001: Audit Logging Workflow
**Trigger:** After any CRUD operation

**Verify:**
- [ ] Audit entry created with correct action type
- [ ] User email captured
- [ ] Before/after JSON stored
- [ ] Timestamp accurate

---

### TC-WF-002: Report Generation Workflow
**Trigger:** POST /api/reports

**Verify:**
- [ ] Report job status updates correctly
- [ ] Excel/PDF generated with correct data
- [ ] File uploaded to storage
- [ ] Download URL returned
- [ ] Email sent if delivery=email

---

### TC-WF-003: Notification Workflow
**Trigger:** Task status change to Done

**Verify:**
- [ ] Notification sent to project manager
- [ ] Email contains task details
- [ ] Slack message (if configured)

---

## 🔒 Security Testing

### TC-SEC-001: Authentication
- [ ] Invalid credentials rejected
- [ ] Brute force protection (rate limiting)
- [ ] JWT tokens expire correctly
- [ ] Refresh tokens work
- [ ] Logout invalidates session

### TC-SEC-002: Authorization
- [ ] Unauthenticated requests return 401
- [ ] Users can only access their own data
- [ ] Admin endpoints protected
- [ ] API keys validated

### TC-SEC-003: Input Validation
- [ ] SQL injection attempts blocked
- [ ] XSS attempts sanitized
- [ ] Path traversal prevented
- [ ] Large payloads rejected

### TC-SEC-004: Data Protection
- [ ] Passwords hashed (not plaintext)
- [ ] Sensitive data masked in logs
- [ ] HTTPS enforced
- [ ] CORS configured correctly

---

## 🚀 Performance Testing

### TC-PERF-001: API Response Times
| Endpoint | Target | Acceptable |
|----------|--------|------------|
| GET /api/projects | <200ms | <500ms |
| POST /api/projects | <300ms | <700ms |
| GET /api/tasks | <200ms | <500ms |
| GET /api/dashboard | <300ms | <800ms |
| POST /api/reports | <500ms | <1s |

### TC-PERF-002: Concurrent Users
- [ ] 10 concurrent users - no degradation
- [ ] 50 concurrent users - <20% slowdown
- [ ] 100 concurrent users - stable

### TC-PERF-003: Database Query Performance
- [ ] Project list query <100ms with 1000 records
- [ ] Task list query <100ms with 5000 records
- [ ] Dashboard aggregation <200ms

---

## 📝 Test Data

### Sample Projects
```json
[
  {
    "project_id": "PRJ-001",
    "project_name": "CST Implementation",
    "priority": "High",
    "status": "In Progress"
  },
  {
    "project_id": "PRJ-002",
    "project_name": "Quality Dashboard",
    "priority": "Medium",
    "status": "On Track"
  },
  {
    "project_id": "PRJ-003",
    "project_name": "API Migration",
    "priority": "Low",
    "status": "Complete"
  }
]
```

### Sample Tasks
```json
[
  {
    "task_id": "TSK-001",
    "project_id": "PRJ-001",
    "task_name": "Database schema design",
    "status": "Done",
    "r1_estimate_hrs": 16,
    "r1_actual_hrs": 18
  },
  {
    "task_id": "TSK-002",
    "project_id": "PRJ-001",
    "task_name": "API implementation",
    "status": "In Progress",
    "r1_estimate_hrs": 24,
    "r1_actual_hrs": 12
  },
  {
    "task_id": "TSK-003",
    "project_id": "PRJ-002",
    "task_name": "Frontend components",
    "status": "Backlog",
    "r1_estimate_hrs": 32,
    "r1_actual_hrs": 0
  }
]
```

### Sample Resources
```json
[
  {
    "name": "Basel",
    "email": "basel@company.com",
    "role": "Developer",
    "capacity_hrs": 40
  },
  {
    "name": "Ahmed",
    "email": "ahmed@company.com",
    "role": "QA Engineer",
    "capacity_hrs": 40
  }
]
```

---

## 🐛 Bug Reporting Template

### Bug Report Format
```markdown
## Bug Title
[Brief description]

### Environment
- Browser: [Chrome 120, Firefox 121, Safari 17]
- OS: [Windows 11, macOS 14]
- API Version: [1.0.0]

### Steps to Reproduce
1. Step one
2. Step two
3. Step three

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Screenshots/Logs
[Attach relevant screenshots or console logs]

### Severity
- [ ] Critical (app unusable)
- [ ] High (major feature broken)
- [ ] Medium (workaround exists)
- [ ] Low (cosmetic issue)

### Additional Context
[Any other relevant information]
```

---

## 📊 Test Execution Tracking

### Test Summary Template
| Category | Total | Passed | Failed | Blocked | Not Run |
|----------|-------|--------|--------|---------|---------|
| API Tests | 14 | - | - | - | - |
| UI Tests | 6 | - | - | - | - |
| Component Tests | 3 | - | - | - | - |
| Integration Tests | 3 | - | - | - | - |
| E2E Tests | 3 | - | - | - | - |
| Security Tests | 4 | - | - | - | - |
| Performance Tests | 3 | - | - | - | - |
| **TOTAL** | **36** | - | - | - | - |

---

## ✅ Pre-Release Checklist

- [ ] All critical bugs resolved
- [ ] All high-priority tests passed
- [ ] Performance targets met
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Release notes prepared

---

*End of Testing Roadmap*
