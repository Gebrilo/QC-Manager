# Glossary

> [!NOTE]
> This glossary draws from the authoritative domain language defined in [CONTEXT.md](../../CONTEXT.md). For Tuleap-specific terminology and architectural decisions, see also the [ADR index](../internal/adr/README.md).

## Core Concepts

| Term | Definition |
|------|------------|
| **QC-Manager** | The quality-control and delivery-management system for managing testing and delivery lifecycle |
| **QC Project** | A QC-Manager-side workspace (`projects` table); one or more Tuleap Projects map to it |
| **Tuleap Project** | A top-level container in Tuleap that owns multiple trackers; distinct from QC Project |
| **Artifact** | A single Tuleap-tracked work item: Bug, Task, User Story, or Test Case |
| **Tracker** | A Tuleap container holding artifacts of a single subtype |
| **Tracker Config** | The QC-side mapping connecting one Tuleap Tracker to one QC Project (stored in `tuleap_sync_config`) |

## Artifact Types

| Type | QC Table | Description |
|------|----------|-------------|
| `bug` | `bugs` | Defect found through testing or exploration |
| `task` | `tasks` | Unit of work assigned to resources |
| `user_story` | `user_stories` | Feature or requirement from Tuleap |
| `test_case` | `test_cases` | Testable scenario linked to user stories |

## Sync Actions

| Action | Meaning |
|--------|---------|
| `sync` | Upsert artifact by `tuleap_artifact_id` (creates or updates) |
| `delete` | Soft-delete the QC row when Tuleap deletes |
| `reject` | Task only: Tuleap created for non-QC assignee; skip creation, log |
| `archive` | Task only: reassigned to non-QC person; archive to history |

## Task Assignment

| Term | Definition |
|------|------------|
| **Primary Resource** | The single owner of a task; maps to Tuleap's `assigned_to` |
| **Secondary Resource** | Supporting contributor on a task (QC-local only; any number allowed) |
| **Assignment** | One row in `task_resource_assignment` linking task→resource with per-person estimates |
| **Estimate Accuracy** | Post-close verdict: ratio of actual_hrs to estimate_hrs (±25% band) |

## Bug Classification

| Bug Source | Meaning |
|------------|---------|
| `TEST_CASE` | Bug discovered through executing a known test case |
| `EXPLORATORY` | Bug discovered ad-hoc, with no linked test case |

## Quality & Governance

| Term | Definition |
|------|------------|
| **Quality Gate** | A configurable threshold metric (pass rate, coverage, etc.) that must pass for release |
| **Release Approval** | Formal sign-off by PM/QA Lead after gates pass |
| **Release Readiness** | Aggregate status indicating whether a release can proceed |

## Identifiers

| ID Type | Format | Scope |
|---------|--------|-------|
| QC UUID | UUID v4 | Canonical for inter-artifact links stored on QC side |
| QC Business Key | `T-123`, `B-456` | Display and user-facing reference |
| Tuleap Artifact ID | Integer (e.g., `140`) | Boundary translation only |

## Roles (Active)

| Role | Short Description |
|------|-------------------|
| `admin` | Full system access, user/RBAC management |
| `pm` | Project oversight, governance, dashboards |
| `team_manager` | Resource management, IDPs, team views |
| `tester` | Test execution, bug reporting, personal tasks |
| `viewer` | Read-only access |
| `contributor` | Limited data entry within team/project scope |

## Directional Terms

| Term | Direction | Description |
|------|-----------|-------------|
| **Inbound** | Tuleap → QC | Webhook-driven sync, mediated by n8n |
| **Outbound** | QC → Tuleap | QC user creates/edits artifact in UI; emitted to Tuleap |

## Flagged Ambiguities

- **"project"** is overloaded between Tuleap Project and QC Project. Always qualify.
- **"sync"** is overloaded between the data flow direction and the `sync` action. Prefer "Inbound" for direction.
- **`tuleap_sync_config` table** is named for its original inbound-only role; today it drives outbound too. Use "Tracker Config" in design discussions.
- **Three identities per artifact**: QC UUID (canonical), QC business key (display), Tuleap integer ID (boundary).
