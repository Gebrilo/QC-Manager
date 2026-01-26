# QC App Implementation Tasks

- [x] **Project Initialization**
    - [x] Create project structure
    - [x] Create CLAUDE.md and README.md
    - [x] Define architecture rules

- [x] **Infrastructure**
    - [x] Docker Compose (Local & Prod)
    - [x] Nginx Config
    - [x] Environment Variables

- [x] **Database**
    - [x] Schema Migration (UUIDs, Audit Logs)
    - [x] Seed Data

- [x] **Backend API**
    - [x] Express Server Setup
    - [x] Database Connection
    - [x] CRUD Endpoints (Tasks, Projects, Resources)
    - [x] Audit Logging Impl
    - [x] n8n Trigger Service

- [x] **Frontend**
    - [x] Next.js Setup
    - [x] Tailwind Config
    - [x] Dashboard Page (Task List)
    - [x] Task Modal (Create/Edit)
    - [x] Report Generation Button

- [x] **Workflow Automation (n8n)**
    - [x] Create JSON Exports for Workflows
    - [x] Documentation for Import
    - [x] **API Hardening (Prerequisite)**
        - [x] Add `GET /tasks/:id` Endpoint
        - [x] Relax Validation Schema
    - [x] Implement n8n Webhook Triggers
    - [x] Create `task_automation` Workflow
    - [ ] Verify End-to-End Automation

- [x] **Phase 4: Verification & Handover**
    - [x] Create Report Workflow JSONs
    - [x] Import n8n Workflows (Manual Step)
    - [x] Verify Dashboard Access
    - [x] Verify Task Creation Flow (Full)
    - [x] Verify Report Generation
    - [x] Final Deployment Polish (.env, README)
