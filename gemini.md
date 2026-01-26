# Project Map & State Tracking

## Project Status
**Phase:** Phase 1: Blueprint
**Current Step:** Schema Design (PostgreSQL)

## Discovery (Updated)
1.  **North Star:** Build an enterprise-grade QC Scenario Planning system with a PostgreSQL backend and Next.js frontend.
2.  **Integrations:** PostgreSQL 14+, Node.js API (Express), Next.js Frontend, Docker.
3.  **Source of Truth:** PostgreSQL Database `qc_planning_db` (migrated from Excel).
4.  **Delivery Payload:** Full Stack Application (Db, API, Web).
5.  **Behavioral Rules:** Deterministic, UUID-based, Data-First, Audit Log for all mutations, Reliability over speed.

## Blueprint & Architecture
**Stack:** PostgreSQL 14+ (DB) + Node.js/Express (API) + Next.js (Web).
**Pattern:** 3-Layer Architecture (Web UI -> API Service -> Postgres Data Layer).
**Database Pattern:** Relational with JSONB Audit Log, Soft Deletes, and Views for Aggregation.

### Core Modules
1.  **Database:** `projects`, `tasks`, `resources`, `audit_log`, `system_config`.
2.  **API:** RESTful endpoints for CRUD.
3.  **Frontend:** Dashboard, Project/Task Management.

## Data Schema (PostgreSQL Model)

### 1. Projects (`projects`)
*Container for tasks. Metrics aggregated via views.*
```sql
CREATE TABLE projects (
  project_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(20) NOT NULL UNIQUE, -- PRJ-XXX
  project_name VARCHAR(100) NOT NULL,
  total_weight INTEGER CHECK (total_weight BETWEEN 1 AND 5),
  priority VARCHAR(20) CHECK (priority IN ('High', 'Medium', 'Low')),
  start_date DATE,
  target_date DATE,
  deleted_at TIMESTAMPTZ -- Soft Delete
);
```

### 2. Tasks (`tasks`)
*Atomic unit of work.*
```sql
CREATE TABLE tasks (
  task_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(20) NOT NULL UNIQUE, -- TSK-XXX
  project_uuid UUID NOT NULL REFERENCES projects(project_uuid),
  resource1_uuid UUID NOT NULL REFERENCES resources(resource_uuid),
  resource2_uuid UUID REFERENCES resources(resource_uuid),
  task_name VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Backlog', 'In Progress', 'Done', 'Cancelled')),
  estimate_days NUMERIC(10,2),
  r1_estimate_hrs NUMERIC(10,2) DEFAULT 0,
  r1_actual_hrs NUMERIC(10,2) DEFAULT 0,
  r2_estimate_hrs NUMERIC(10,2) DEFAULT 0,
  r2_actual_hrs NUMERIC(10,2) DEFAULT 0,
  deadline DATE,
  completed_date DATE,
  deleted_at TIMESTAMPTZ -- Soft Delete
);
```

### 3. Resources (`resources`)
*People and capacity.*
```sql
CREATE TABLE resources (
  resource_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_name VARCHAR(100) NOT NULL UNIQUE,
  weekly_capacity_hrs INTEGER NOT NULL DEFAULT 40,
  is_active BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMPTZ -- Soft Delete
);
```

### 4. Audit Log (`audit_log`)
*Append-only history.*
```sql
CREATE TABLE audit_log (
  audit_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(20) NOT NULL, -- CREATE, UPDATE, DELETE
  entity_type VARCHAR(50) NOT NULL,
  entity_uuid UUID NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  before_state JSONB,
  after_state JSONB,
  changed_fields TEXT[]
);
```

## Maintenance Log
| Date | Phase | Action | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 2026-01-19 | Phase 1 | Blueprint Definition | Complete | Defined PostreSQL schema, API layer, and Frontend architecture. |
| 2026-01-19 | Phase 3 | Schema Migration | Complete | Created `003_complete_schema_alignment.sql`, added audit logs, soft deletes, and views. |
| 2026-01-19 | Phase 3 | API Alignment | Complete | Updated `projects` and `tasks` routes to use database views (`v_projects_with_aggregations`, `v_tasks_with_calculations`) and implemented enhanced `auditLog` middleware. |
| 2026-01-19 | Phase 4 | Design System | Complete | Implemented Indigo/Violet theme, created UI components (`Card`, `Badge`, `ProgressBar`), and restyled Dashboard, Projects, and Tasks pages. |
| 2026-01-19 | Phase 5 | Deployment Prep | Ready | Verified Docker configuration and n8n workflow assets. |
