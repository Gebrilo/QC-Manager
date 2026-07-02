# AI Intake reuses the standalone-artifact stack instead of a parallel AI model

The **AI User Story Intake** feature (`docs/features/qc_manager_ai_user_story_intake_feature.md`) was specified as a parallel stack: a generic `artifact_links` table, `ai_intake_logs` + `ai_task_generation_batches` tables, a `source_channel` field, an `ai_intake.*` permission family, and new `Reviewing`/`Generated` statuses. We instead build it entirely on shipped infrastructure, because almost all of it already exists.

## Decision

AI Intake is an **orchestrator over existing paths**, not a new subsystem:

- **Creation** rides the standalone path (`POST /user-stories`, `POST /tasks` → `sync_status='standalone'`), which already sets ACLs, permissions, and audit.
- **Story → Task link** is the native `tasks.parent_user_story_id` FK — not a generic `artifact_links` table (that table is explicitly **not** built; the per-pair link tables + the native FK cover MVP).
- **Audit** is the existing `audit_log` + notification dispatcher (`req.audit`), not a new `audit_logs` table.
- **Intake + task-job record** is `ai_content_generation_logs` (extend `request_type`, add `project_id`/`user_story_id`/`content_hash`), not two new tables.
- **Origin** is the existing `source` enum (extend with `ai_intake`) + `generated_by_ai`, not `source_channel`/`source_type`.
- **Status** is existing `Review` (user story) / `Todo` (task); AI-ness is carried by `generated_by_ai` + `source`, never by a new status.
- **Permissions** are the existing `qc.user_stories.create` / `qc.tasks.create` (RBAC was just unified — ADR 0010/0011); no `ai_intake.*` family.

AI artifacts are **always standalone** — never auto-emitted to Tuleap while unreviewed, even in synced projects (requires a skip-emit flag on the create path). **Task synthesis is delegated to n8n** (QC-Manager runs no in-process LLM); tasks return via async callback, and the caller learns of completion by polling + the free audit→notification. Non-UI intake authenticates with the shared `QC_AGENT_WEBHOOK_SECRET`, acts as a fixed agent principal, and is gated per project by an `ai_intake_enabled` opt-in.

## Considered Options

The doc's parallel model was rejected because it duplicates shipped machinery (two audit vocabularies, two AI-log tables, a competing origin term), and because `Generated` would break the task-status enum (`Todo/In Progress/Blocked/Done/Canceled`) and every board filter that reads it.

## Consequences

- New surface is small: a markdown parser, a skip-emit flag on the create path, a per-project `ai_intake_enabled` gate, `generated_by_ai`/`source` columns on `user_stories`+`tasks`, and enum extensions on `source` and `ai_content_generation_logs.request_type`.
- MCP stays future; the generic `artifact_links` table is deliberately not built. If MCP/bug-linking later needs many-to-many typed links beyond the per-pair tables, that is a separate decision to revisit then.
- The agent principal has no team/user identity, so the create path's ACL/`owner_team_id` defaults and `enforcePmProjectScope` must be given an explicit actor/visibility for agent-created intake.
