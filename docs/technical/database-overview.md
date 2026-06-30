# Database Overview

## Database: PostgreSQL (Supabase Cloud for Production)

> [!NOTE]
> The full database design document is at `docs/02-architecture/database-design.md` (2000+ lines). This is a summary.

## Key Principles

- **UUID primary keys** for all entities (immutable, non-sequential)
- **Soft deletes** via `deleted_at` timestamp (never hard-delete)
- **Audit logging** captures before/after state for every mutation
- **Database views** provide real-time aggregated metrics
- **Idempotent migrations** run on every API startup via `db.js`

## Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | QC project workspaces | `id`, `name`, `status`, `deleted_at` |
| `tasks` | Units of work | `id`, `project_id`, `status`, `deleted_at` |
| `task_resource_assignment` | Resource-task junction (ADR 0009) | `task_id`, `resource_id`, `assignment_type`, `estimate_hrs`, `actual_hrs` |
| `resources` | People/resources | `id`, `name`, `email`, `team_id` |
| `app_user` | User accounts | `id`, `email`, `role`, `status`, `supabase_uid` |
| `teams` | Organizational teams | `id`, `name` |
| `project_teams` | Project-team membership | `project_id`, `team_id` |
| `user_stories` | Feature requirements | `id`, `project_id`, `status` |
| `bugs` | Defect tracking | `id`, `project_id`, `severity`, `bug_source` |

## Test Management Tables

| Table | Purpose |
|-------|---------|
| `test_cases` | Test case registry |
| `test_suites` | Test suite containers |
| `test_run` | Test execution runs |
| `test_execution` | Individual test case executions within a run |
| `test_results` | Uploaded test result records |

## Governance Tables

| Table | Purpose |
|-------|---------|
| `quality_gates` | Configurable quality thresholds |
| `release_approvals` | Release sign-off records |
| `report_jobs` | Scheduled/on-demand report tracking |

## Integration Tables

| Table | Purpose |
|-------|---------|
| `tuleap_sync_config` | Tracker Config: maps Tuleap trackers to QC projects |
| `tuleap_webhook_log` | Inbound webhook event log |
| `tuleap_task_history` | Archived/rejected task history |
| `notifications` | In-app notification records |

## Database Views (Real-Time Aggregation)

| View | Purpose |
|------|---------|
| `v_dashboard_metrics` | Global dashboard aggregates |
| `v_projects_with_metrics` | Project-level metrics with computed fields |
| `v_resources_with_utilization` | Resource utilization calculations |
| `v_tasks_with_metrics` | Task-level computed metrics |
| `v_bug_summary` | Project-scoped bug aggregations |
| `v_bug_summary_global` | Cross-project bug summary |

## Migration Model

1. `apps/api/src/config/db.js` `runMigrations()` function is **authoritative**
2. Migrations execute **idempotently** on every API container startup
3. `database/migrations/` directory contains **reference SQL copies** — not directly executed
4. To add a migration: modify `runMigrations()` in `db.js`

> [!IMPORTANT]
> Production data lives in **Supabase PostgreSQL**. The local `qc-postgres` container in the Docker stack is for **n8n internal storage only**, not application data.
