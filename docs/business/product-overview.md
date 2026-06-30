# Product Overview

## Product Name

QC-Manager — Quality Operations and Governance Platform

## Purpose

QC-Manager is a quality-control and delivery-management system that mirrors Tuleap artifacts into a QC-owned database, then adds governance, test management, dashboards, resource planning, access control, notifications, and reporting.

## Problem Statement

| Problem | Impact |
|---------|--------|
| Quality data scattered across Excel, Jira, and emails | Manual aggregation, slow release decisions |
| Lack of consistent quality thresholds and governance | Subjective decisions, poor auditability |
| Reactive quality management | Increased risk of defect escape |
| High dependency on individuals | Knowledge silos, inconsistent standards |

## Target Users

| Role | Responsibility |
|------|---------------|
| Admin | System configuration, user management, RBAC administration |
| PM (Project Manager) | Project oversight, dashboards, governance, release readiness |
| Team Manager | Resource management, IDPs, team dashboards, resource planning |
| Tester | Test execution, bug reporting, personal tasks, test case authoring |
| Viewer | Read-only access to dashboards, reports, artifacts |
| Contributor | Limited data entry and view within team/project scope |

## Core Capabilities

### Work Tracking
- Projects, user stories, tasks, bugs
- Task assignments (primary/secondary resources)
- Soft deletes with `deleted_at` timestamp
- Task status flow: Backlog → In Progress → Done/Cancelled

### Test Management
- Test case registry with categorization (Smoke, Regression, E2E, etc.)
- Test suites, runs, and execution tracking
- Result upload with quality metrics
- Artifact traceability (bug → test case → user story)

### Dashboards
- Global dashboard (admin overview)
- PM dashboard (project metrics, quality gates)
- Team Manager dashboard (team workload, resource utilization)
- Member dashboard (personal tasks, test assignments)

### Governance
- Quality gates with configurable thresholds
- Release approvals and readiness evaluation
- Trend views and quality reports
- Audit logging with before/after state capture

### People Management
- User profiles and Supabase auth integration
- Teams with project membership
- Resource tracking with capacity planning
- Journeys (onboarding/probation) and Individual Development Plans (IDPs)

### Access Control
- 6 built-in roles: admin, pm, team_manager, tester, viewer, contributor
- Legacy alias canonicalization: manager→team_manager, user→tester, member→tester
- Shared RBAC catalog in `apps/shared/rbac/catalog.ts`
- Access Engine with scoped (own/team/any) visibility
- Per-user permission overrides

### Integrations
- **Tuleap**: Bidirectional artifact sync (bugs, tasks, user stories, test cases)
- **n8n**: Workflow automation for reports and webhooks
- **Supabase**: Cloud PostgreSQL, authentication, storage
- **TestSprite**: Webhook integration for test results

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Radix UI |
| Backend | Node.js 18, Express 4, Zod, JWT, pg |
| Shared | RBAC catalog under `apps/shared/` |
| Database | PostgreSQL (Supabase cloud for production) |
| Auth | Supabase Auth sessions synced to `app_user` |
| Automation | n8n workflow engine |
| Deployment | Docker, Compose, Traefik, Docker Hub, GitHub Actions |
