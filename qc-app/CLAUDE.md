# CLAUDE.md — QC Management Tool

This file serves as the canonical context document for the QC (Quality Control / Quality Check) web application project. It is intended for both AI assistants (Claude) and human developers to understand the project's state, decisions, and direction.

Last updated: 2026-01-19

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `QC_Backend_API_Design.md` | Phase 3: Complete backend API specification with endpoints, Zod schemas, security, and code examples |
| `QC_Frontend_Design.md` | Phase 4: Frontend component plan, page specs, starter code (TaskTable, TaskForm, ReportGenerator) |
| `QC_PostgreSQL_DDL.sql` | Phase 1: Complete database schema with UUID, audit logging, soft delete, and referential integrity |
| `QC_N8N_Workflows_v2.md` | Phase 2: n8n workflow definitions for CRUD operations, reporting, and automation |
| `DEVELOPMENT_ROADMAP.md` | Implementation roadmap with 5 phases, task breakdown, and time estimates (4-5 weeks) |
| `QUICK_START.md` | Local development setup guide - get running in 15 minutes |
| `qc-app/README.md` | Docker-based implementation structure and deployment instructions |

---

## Current Implementation Status

### Documentation vs Implementation

**Completed Documentation** (Design Phase):
- ✅ Database Schema (QC_PostgreSQL_DDL.sql) - Complete DDL with all tables, constraints, and audit triggers
- ✅ Backend API Design (QC_Backend_API_Design.md) - Full REST API specification with 40+ endpoints
- ✅ Frontend Design (QC_Frontend_Design.md) - Component architecture, page specs, and starter code
- ✅ n8n Workflows (QC_N8N_Workflows_v2.md) - 26+ workflow definitions for automation
- ✅ Deployment Strategy (DEPLOYMENT_GUIDE.md) - VPS deployment guide for Hostinger

**Implementation Status** (Coding Phase):
- 🔨 qc-app directory - Docker-based monorepo structure (scaffolded)
- 🔨 Database - Schema ready, needs deployment and seeding
- ⬜ Backend API (apps/api) - Express.js backend (pending full implementation)
- ⬜ Frontend (apps/web) - Next.js application (pending full implementation)
- ⬜ n8n Workflows - Workflow imports and configuration (pending)
- ⬜ Production Deployment - VPS setup and deployment (pending)

### qc-app Implementation Structure

The implementation follows a Docker-based monorepo structure in `qc-app/`:

```
qc-app/
├── apps/
│   ├── api/          # Express.js REST API backend
│   └── web/          # Next.js frontend application
├── n8n/              # n8n workflow JSON definitions
├── db/               # Database initialization, migrations, and seeds
└── docker/           # Docker Compose configurations (local + production)
```

**Key Implementation Details:**
- **Architecture**: "Thin API, Fat Workflow" - API handles CRUD, n8n handles complex business logic
- **Stack**: Next.js 14 + TypeScript + Express + PostgreSQL + n8n
- **Deployment**: Docker Compose for both local development and production
- **Local Access**: Frontend (http://localhost:3000), API (http://localhost:3001), n8n (http://localhost:5678)

See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) for detailed implementation plan and [QUICK_START.md](QUICK_START.md) for local setup instructions.

---

## 1. Project Overview

### What This Project Does

This is a QC management application for tracking and managing quality control checks across operational workflows. It provides:

- Structured data entry for QC records
- Status tracking and workflow transitions
- Audit trails for all changes
- Reporting capabilities (PDF and Excel)
- Dashboard views for monitoring QC status

### Why It Exists

The project originated as a Google Spreadsheet-based QC tracking system. As operational complexity grew, the spreadsheet approach became unsustainable due to:

- Fragile row-index dependencies
- Lack of proper audit trails
- Limited validation capabilities
- No structured workflow enforcement
- Difficulty generating consistent reports

The web application replaces the spreadsheet as the source of truth.

### High-Level Scope

- CRUD operations for QC entities
- Status-based workflow management
- Role-appropriate dashboards
- Automated and on-demand reporting
- Full audit logging
- Business workflow automation via n8n

---

## 2. Non-Goals

This project is explicitly NOT:

- A general-purpose workflow engine
- A document management system
- A real-time collaboration tool
- A mobile-first application
- A multi-tenant SaaS platform
- An analytics or BI platform
- A replacement for enterprise QMS software

The scope is intentionally narrow to ensure successful delivery by a single developer.

---

## 3. Architecture Overview

### Textual Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js / React)               │
│                  - Config-driven forms and dashboards           │
│                  - Role-based views                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend API (Thin Layer)                    │
│                  - CRUD operations                              │
│                  - Input validation                             │
│                  - Authentication/Authorization                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   Database (Postgres)   │     │         n8n Workflows           │
│   - UUID-based records  │     │   - Business logic workflows    │
│   - Audit log tables    │     │   - Validation orchestration    │
│   - Soft delete support │     │   - Report generation triggers  │
└─────────────────────────┘     │   - Scheduled automation        │
                                └─────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| Frontend | User interface, form rendering, dashboard display, client-side validation |
| Backend API | CRUD operations, server-side validation, authentication, authorization |
| Database | Data persistence, referential integrity, audit log storage |
| n8n | Business workflows, complex validation chains, report generation, scheduled tasks |

### Why n8n Is Used

n8n handles business logic and workflow orchestration that does not belong in a thin API layer:

- Multi-step validation sequences
- Cross-entity business rules
- Report generation pipelines
- Scheduled batch operations
- Notification triggers

**Important:** n8n is NOT the primary CRUD backend. All entity creation, reading, updating, and deletion flows through the Backend API. n8n consumes and orchestrates, but does not replace the API.

---

## 4. Data and Identity Rules

### UUID Policy

- All entities MUST use UUIDs as primary identifiers
- UUIDs are generated at record creation time
- No row-index, auto-increment, or position-based logic is permitted
- UUIDs are immutable once assigned

### Soft Delete Rules

- Records are never physically deleted from the database
- Deletion is represented by a status change (e.g., `status = 'deleted'` or `deleted_at` timestamp)
- Soft-deleted records are excluded from standard queries but remain available for audit
- Restoration is possible by reversing the soft delete status

### Derived vs Editable Fields

- **Editable fields:** User-provided data that can be modified through the UI
- **Derived fields:** Calculated or system-generated values (timestamps, computed statuses, aggregates)
- Derived fields are NEVER directly editable by users
- The distinction must be clear in both schema and UI

### Status and State Handling

- Entities use explicit status fields to represent lifecycle state
- Status transitions follow defined business rules
- Invalid status transitions are rejected at the API level
- Status history is preserved in audit logs

---

## 5. Audit and Safety Principles

### What Is Audited

- All create operations
- All update operations (with before/after values)
- All delete operations (soft deletes)
- Status transitions
- User identity and timestamp for each action

### Why Audit Logging Exists

- Regulatory and compliance requirements
- Debugging and incident investigation
- Accountability and traceability
- Historical reporting accuracy

### Immutability Rules

- Audit log entries are append-only and immutable
- Once written, audit records cannot be modified or deleted
- Audit logs are stored separately from operational data
- Audit log schema is independent of entity schema changes

---

## 6. Development Phases and Workflow

### Phase Definitions

| Phase | Name | Description | Design Status | Implementation Status | Document |
|-------|------|-------------|---------------|----------------------|----------|
| 0 | Business and Data Model Analysis | Document entities, relationships, workflows, and business rules | ✅ DONE | N/A | - |
| 1 | Database Schema | Design and implement Postgres schema with UUID, audit, and soft delete support | ✅ DONE | 🔨 IN PROGRESS | `QC_PostgreSQL_DDL.sql` |
| 2 | n8n Workflows | Build business workflows, validation chains, and automation triggers | ✅ DONE | ⬜ PENDING | `QC_N8N_Workflows_v2.md` |
| 3 | Minimal Backend API | Implement thin CRUD API with validation and auth | ✅ DONE | 🔨 IN PROGRESS | `QC_Backend_API_Design.md` |
| 4 | Frontend UI | Build config-driven forms, dashboards, and role-based views | ✅ DONE | 🔨 IN PROGRESS | `QC_Frontend_Design.md` |
| 5 | Reporting and Automation | Implement PDF/Excel generation, scheduled reports, and batch operations | ⬜ PENDING | ⬜ PENDING | - |

**Status Legend:**
- ✅ DONE - Fully completed
- 🔨 IN PROGRESS - Currently being worked on
- ⬜ PENDING - Not yet started

**Note:** "Design Status" refers to architectural design, API specifications, and schema definitions. "Implementation Status" refers to actual working code deployed in the qc-app directory.

### Rules for Phase Discipline

- Phases are completed sequentially
- Do not skip phases or work ahead
- Each phase builds on the outputs of previous phases
- Phase completion requires explicit confirmation before proceeding

### How Claude Should Be Used Per Phase

- **Phase 0:** Analysis and documentation assistance
- **Phase 1:** Schema design review, SQL generation, migration scripts
- **Phase 2:** n8n workflow design, node configuration guidance
- **Phase 3:** API endpoint design, validation logic, auth patterns
- **Phase 4:** Component structure, form configuration, dashboard layout
- **Phase 5:** Report template design, scheduling logic, export formats

Claude assists with implementation within each phase. Claude does not drive architecture decisions or skip ahead.

---

## 7. Rules for Claude

### What Claude Is Allowed To Do

- Answer questions about the current phase
- Generate code, schemas, or configurations for the current phase
- Suggest improvements within established constraints
- Clarify ambiguities by asking questions
- Reference this document and previous decisions

### What Claude Must NOT Do

- Introduce new technologies not already decided
- Skip phases or work on future phase tasks
- Contradict decisions documented here
- Over-engineer solutions beyond stated requirements
- Assume features or requirements not explicitly discussed
- Generate code for phases not yet reached

### When Claude Is Unsure

- Ask clarifying questions before proceeding
- Reference this document for guidance
- Default to the simpler option when two approaches are valid
- Explicitly state assumptions if proceeding without clarification

### Respecting Existing Decisions

- Treat this document as authoritative
- Do not suggest alternatives to settled decisions unless asked
- If a decision seems problematic, raise it as a question, not a change
- Assume decisions were made with context Claude may not have

---

## 8. Naming and Style Conventions

### Entity Naming

- Singular nouns for entity names (e.g., `qc_record`, not `qc_records`)
- Snake_case for database tables and columns
- PascalCase for frontend component names
- Descriptive, unambiguous names

### API Naming

- RESTful resource naming: `/api/qc-records`, `/api/qc-records/{id}`
- Kebab-case for URL paths
- Standard HTTP verbs: GET, POST, PUT, DELETE
- Plural nouns for collection endpoints

### Workflow Naming (n8n)

- Prefix with domain: `qc_` for QC-related workflows
- Action-oriented names: `qc_validate_submission`, `qc_generate_report`
- Snake_case for workflow names

### Status Naming

- Lowercase, snake_case status values
- Verb-based where appropriate: `pending_review`, `approved`, `rejected`
- Consistent vocabulary across entities

---

## 9. Reporting Strategy

### Report Formats

- **PDF:** Formal reports, printable summaries, compliance documents
- **Excel:** Data exports, analysis-ready datasets, bulk review

### Generation Modes

- **On-demand:** User-triggered via UI action
- **Scheduled:** Time-based generation via n8n (daily, weekly, monthly)

### Role of n8n in Reporting

- n8n orchestrates report generation workflows
- n8n triggers report generation based on schedules or events
- Report templates and rendering may use external libraries or services
- Generated reports are stored or delivered as configured

### Report Content Principles

- Reports reflect data at generation time
- Historical reports remain accurate (audit log provides context)
- Report configurations are version-controlled

---

## 10. Future-Friendly Notes

### Where This Can Evolve

- Additional entity types as business needs grow
- Enhanced dashboard visualizations
- More sophisticated workflow rules
- Integration with external systems (ERP, email, etc.)
- Mobile-responsive UI improvements

### What Must Remain Stable

- UUID-based identity (non-negotiable)
- Audit logging on all mutations (non-negotiable)
- Soft delete pattern (non-negotiable)
- Phase discipline for new features
- n8n as workflow engine (not as CRUD backend)
- Relational database as source of truth

---

## Document Maintenance

This document should be updated when:

- A phase is completed
- A significant decision is made or changed
- New conventions are established
- Scope changes are agreed upon

All updates should include the date and a brief description of the change.

---

*End of CLAUDE.md*
