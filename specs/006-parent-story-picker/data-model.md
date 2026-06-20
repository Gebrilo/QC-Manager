# Phase 1 Data Model: Parent User Story Picker

No schema migration. This feature changes how an existing relationship is selected/displayed and corrects two persistence gaps. Entities below describe the touched surface only.

## Entities

### Task
- **Identity**: `id` (uuid), human id `task_id` (`TSK-###`).
- **Relevant field**: `parent_user_story_id uuid NULL` → FK-style reference to `user_stories.id`. Optional, single-valued.
- **Behavior change**:
  - **Create**: persist `parent_user_story_id` (currently dropped — must be added to INSERT).
  - **Update**: already persisted; must additionally accept an explicit `NULL` to clear.
  - **Audit**: every create/update already diffed by `auditLog(after, before)`; a parent change is captured automatically.

### User Story (candidate parent)
- **Identity**: `id` (uuid); display id `US-<tuleap_artifact_id>` (or uuid fallback).
- **Attributes used for display/search**: `title`, `tuleap_artifact_id` (nullable), `status`, `priority`, `description`, `project_id`, project name (via join).
- **Scope**: belongs to exactly one project; only same-project stories are eligible parents.
- **Read-only** in this feature — never created or modified here.

### Project
- **Role**: scoping boundary. A task and its eligible parent user stories share `project_id`.

## Relationship

```
Task.parent_user_story_id  ──(0..1)──▶  UserStory.id
        (same project_id; optional; cleared by setting NULL)
```

- Cardinality: a Task has **at most one** parent User Story; a User Story may be parent of many Tasks.
- Lifecycle: set/changed/cleared at task save time. Recorded in `task_audit` via existing `auditLog`.

## Validation rules

| Rule | Where enforced |
|------|----------------|
| Value is a valid user-story UUID or empty/null | zod `updateTaskSchema` / `baseTaskSchema` (`.uuid()`, add `.nullable()` on update) |
| Candidate belongs to the task's project | client (project-scoped query) + server (`/search`/`/user-stories` `project_id` filter) |
| Candidate visible to the current user | server permission gates (`page:projects` / `qc.projects.view`); never trusted client-side |
| Relationship is optional | create/update both allow absent/empty/null |

## State transitions (relationship)

| From | Action | To | Persistence |
|------|--------|----|-------------|
| none | select on create | linked | INSERT includes `parent_user_story_id` |
| none | select on edit | linked | PATCH sets field |
| linked | pick different | re-linked | PATCH sets new uuid |
| linked | clear on edit | none | PATCH sets `NULL` (requires nullable schema) |
| linked (parent inaccessible) | leave untouched | unchanged | key omitted → no write |
