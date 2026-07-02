# QC-Manager Feature Design: AI Skill Markdown Intake to User Story, Tasks, and Future MCP Bug Creation

> Status note: this document is the original feature/PRD input. The implemented MVP deliberately reuses the existing standalone artifact, audit, permission, and AI content log stack rather than adding the parallel `ai_intake.*` permission family, `ai_intake_logs`, or `source_channel` model described in later sections. See `docs/adr/0012-ai-intake-reuses-standalone-artifact-stack.md` for the implementation decision record.

## 1. Feature Name

Recommended feature name:

**AI User Story Intake**

Alternative names:

- AI Story-to-Tasks Intake
- AI Skill Intake
- AI Markdown Intake
- AI Work Intake
- PRD-to-Tickets Intake

For the QC-Manager UI, the suggested menu name is:

```text
AI Intake
```

---

## 2. Purpose

QC-Manager currently acts mainly as a ticketing and tracking tool, not a full project management platform.

The purpose of this feature is to allow customers, developers, testers, or AI agents to generate a Markdown file using an AI skill such as:

- Superpower
- GSD
- Grill-me
- Claude custom skill
- Codex planning skill
- Any customer AI agent workflow

Then this Markdown file should be pushed, uploaded, or pasted into QC-Manager and automatically converted into:

```text
Project
  └── User Story
        └── One or more linked Tasks
```

The Markdown file will act as the PRD-like source document for the User Story.

Later, after development and testing, the same structure should support MCP-based agents that can create bugs and link them to the related task.

Future target structure:

```text
Project
  └── User Story
        └── Task
              └── Bug
```

This allows QC-Manager to become the tracking and governance layer for AI-assisted delivery.

---

## 3. High-Level Goal

The feature should allow an external AI-generated Markdown file to enter QC-Manager through an AI-friendly intake flow.

The system should:

1. Receive Markdown from an AI skill or customer agent.
2. Identify the project.
3. Capture the skill name that generated the Markdown.
4. Validate and sanitize the Markdown.
5. Create a User Story under the selected project.
6. Populate the User Story attributes from the Markdown.
7. Store the original Markdown inside the User Story.
8. Generate AI-readable structured JSON from the Markdown.
9. Use an internal task-generation agent or service to decide how many tasks are needed.
10. Create one or more linked tasks under the User Story.
11. Mark all generated artifacts as AI-generated.
12. Track the source, skill name, agent name, and intake method.
13. Prepare the artifact model for future MCP-based bug creation and linking.

---

## 4. What This Feature Is Not

This feature is not intended to turn QC-Manager into a full project management platform at this stage.

It is also not intended to implement full autonomous software delivery in the first version.

The MVP should not include:

- Full MCP server implementation
- User MCP connection from Preferences
- Agent-driven code implementation
- Automatic bug creation through MCP
- Automatic test case generation
- Full human approval workflow
- Full release management
- Full backlog/project planning module

Those are future phases.

The first version should focus on:

```text
AI Markdown in
↓
User Story created
↓
Tasks generated
↓
Tasks linked and tracked
```

---

## 5. Core Business Requirement

Customers may already use AI tools to generate plans, PRDs, implementation plans, bug plans, or feature specs as Markdown files.

QC-Manager should provide a way to automatically import those Markdown files into the existing tracking structure.

The desired structure is:

```text
Selected Project
  └── User Story created from Markdown
        ├── Raw Markdown source
        ├── Parsed attributes
        ├── AI-readable JSON
        └── Linked generated Tasks
```

The User Story is the PRD container.

The Tasks are the execution tickets.

---

## 6. End-to-End Workflow

### 6.1 Current MVP Workflow

```text
[AI Agent / Claude Skill / Codex / Customer Agent]
        │
        │ Generates Markdown file
        ▼
[QC-Manager AI Intake]
        │
        │ Receives Markdown through API, webhook, upload, or paste
        ▼
[Validation and Parsing]
        │
        │ Resolves project and skill name
        ▼
[User Story Creation]
        │
        │ Creates User Story under selected project
        ▼
[Task Generation]
        │
        │ Reads Markdown/User Story and determines needed tasks
        ▼
[Task Creation]
        │
        │ Creates one or more linked Tasks
        ▼
[QC-Manager Tracking]
        │
        │ Developers work on tasks
        ▼
[Later Testing Flow]
        │
        │ Testers test tasks and report bugs
```

### 6.2 Future MCP Workflow

```text
Developer completes Task
        ↓
Tester tests Task
        ↓
Tester uses MCP-connected agent
        ↓
MCP agent reads Task context
        ↓
MCP agent creates Bug
        ↓
Bug is linked to Task
        ↓
Task remains linked to User Story
```

Future traceability:

```text
User Story
  └── Task
        └── Bug
```

---

## 7. Required Intake Channels

The system should support three intake methods.

### 7.1 API Intake

For AI agents, customer tools, automation scripts, and advanced integrations.

Example endpoint:

```http
POST /api/ai-intake/user-story
```

### 7.2 Webhook Intake

For no-code or automation tools such as:

- n8n
- Make
- Zapier
- Customer internal automation
- AI agent workflow webhook

Example endpoint:

```http
POST /webhooks/ai-intake/user-story
```

### 7.3 Manual UI Intake

For users who want to:

- Upload `.md` file
- Paste Markdown directly
- Select project
- Select skill name
- Trigger User Story and task creation manually

Suggested UI page:

```text
AI Intake
```

All intake methods should use the same backend service.

Do not create different business logic for API, webhook, and UI.

---

## 8. AI-Friendly Input Contract

External AI agents should not need to know the internal QC-Manager database structure.

They should only need to send:

1. Project key or project ID
2. Skill name
3. Markdown content
4. Source agent name
5. Source type
6. Whether tasks should be created

### 8.1 Recommended JSON Payload

```json
{
  "project_key": "QC-MANAGER",
  "project_id": null,
  "skill_name": "GSD",
  "source_agent": "Claude",
  "source_type": "api",
  "source_conversation_id": "optional-conversation-id",
  "markdown": "# Feature: AI User Story Intake\n\n...",
  "create_tasks": true,
  "task_mode": "auto_create"
}
```

### 8.2 Field Notes

`project_key` should be supported because external agents may not know internal UUIDs.

`project_id` should also be supported for internal integrations.

If both are provided, `project_id` should take priority.

If neither is provided, the API request should fail with a clear error.

For manual upload, the user can select the project from the UI.

---

## 9. Recommended Markdown Format

AI skills should be encouraged to generate Markdown with a YAML frontmatter block.

Example:

```md
---
project_key: QC-MANAGER
skill_name: GSD
artifact_type: user_story
priority: high
risk_level: medium
create_tasks: true
---

# AI User Story Intake

## Overview
Explain the feature and why it is needed.

## Business Goal
Explain the value of the feature.

## Requirements
- Requirement 1
- Requirement 2
- Requirement 3

## Acceptance Criteria
- Given a valid Markdown file, when it is submitted, then QC-Manager creates a User Story.
- Given a User Story is created from Markdown, when task generation runs, then one or more linked tasks are created.

## Suggested Tasks
### Task 1: Build AI intake API
Description...

### Task 2: Create upload UI
Description...

## Risks
- Invalid Markdown structure
- Duplicate submissions
- Wrong project mapping
```

---

## 10. Do Not Depend Only on Frontmatter

The system should support fallback behavior.

### 10.1 If `project_key` is missing

API/webhook should reject the request unless project ID exists.

Manual UI should require the user to select a project.

### 10.2 If `skill_name` is missing

Set skill name to:

```text
unknown
```

Then use the default parser.

### 10.3 If title is missing

Use the first Markdown heading.

If no heading exists, generate a title from the first meaningful paragraph.

### 10.4 If acceptance criteria are missing

The task-generation agent may suggest acceptance criteria.

The User Story should still be created, but with a warning flag.

### 10.5 If the Markdown is invalid

Reject the request or save it as failed intake, depending on the intake channel.

---

## 11. Skill Name Handling

The Markdown file is generated by a named AI skill.

The skill name should be stored and used to influence parsing and task generation.

Examples:

```text
Superpower
GSD
Grill-me
Custom Claude Skill
Codex Planning Skill
Unknown
```

Different skills may produce different Markdown styles.

### 11.1 Suggested Skill Behavior

```text
Superpower
- Strategic PRD style
- Likely includes goals, context, risks, roadmap
- Task generation should split into business, frontend, backend, QA, and governance tasks

GSD
- Execution-focused style
- Likely includes direct action steps
- Task generation should produce practical implementation tasks

Grill-me
- Review/challenge style
- Likely includes risks, questions, gaps, and objections
- Task generation should include analysis, validation, risk resolution, and follow-up tasks
```

### 11.2 Optional Future Table: `ai_skills`

```text
ai_skills
- id
- name
- provider
- expected_markdown_format
- parsing_strategy
- task_generation_prompt
- is_active
- created_at
- updated_at
```

This table can be added later if the system needs skill-specific parsing.

For MVP, `skill_name` can be stored as plain text.

---

## 12. User Story Behavior

The imported Markdown should create a User Story under the selected project.

The User Story should contain:

```text
- Project
- Title
- Description
- Acceptance Criteria
- Priority
- Risk Level
- Raw Markdown
- Parsed AI JSON
- Source Skill Name
- Source Agent Name
- Source Type
- Source Channel
- Generated by AI flag
```

The raw Markdown should remain visible inside the User Story details page.

Recommended UI section inside User Story:

```text
AI Source
- Source Channel: AI Intake
- Source Agent: Claude
- Skill Name: GSD
- Source Conversation ID: optional
- Original Markdown: View
```

---

## 13. User Story Status

Recommended MVP status:

```text
Reviewing
```

When a User Story is created from AI Intake, set:

```text
status = Reviewing
```

Reason:

The User Story is created automatically, but it should be clear that it is AI-generated and still needs possible review.

Alternative MVP status:

```text
Draft
```

If the team does not want AI-created User Stories to immediately appear in active flow, use `Draft`.

Recommended:

```text
AI-created User Story = Reviewing
```

---

## 14. Task Generation Behavior

After the User Story is created, a task-generation service or internal agent should read:

```text
- Project context
- User Story title
- Raw Markdown
- Parsed attributes
- Acceptance criteria
- Risks
- Existing tasks under the same project
- Existing related User Stories
```

Then it should decide how many tasks are needed.

The number of tasks should not be fixed.

The agent should generate one or more tasks depending on complexity.

---

## 15. Task Generation Rules

The task-generation agent should follow these rules:

```text
1. Create only actionable tasks.
2. Do not create vague tasks.
3. Each task must be trackable.
4. Each task must be linked to the created User Story.
5. Each task should include a clear description.
6. Each task should include a suggested type.
7. Each task should include priority if possible.
8. Each task should include definition of done or acceptance criteria where possible.
9. Avoid duplicate tasks.
10. Do not create tasks outside the selected project.
11. Do not create tasks for unrelated scope.
12. Do not modify existing tasks unless explicitly requested.
13. Preserve the source link back to the User Story.
```

Suggested task types:

```text
- Analysis
- Backend
- Frontend
- QA
- DevOps
- Documentation
- Security
- Data
- Integration
```

---

## 16. Recommended Task Output Format

The task-generation service should return structured JSON.

Example:

```json
{
  "user_story_id": "uuid",
  "tasks": [
    {
      "title": "Build AI intake API endpoint",
      "description": "Create an endpoint that accepts Markdown, skill name, source agent, and project key.",
      "type": "Backend",
      "priority": "High",
      "definition_of_done": [
        "Endpoint accepts valid payloads",
        "Invalid project key returns clear error",
        "Request is saved in the audit log"
      ]
    },
    {
      "title": "Create AI Intake upload UI",
      "description": "Allow users to upload or paste Markdown, select a project, select a skill name, and submit the intake.",
      "type": "Frontend",
      "priority": "High",
      "definition_of_done": [
        "User can upload .md file",
        "User can paste Markdown",
        "User can select project and skill name"
      ]
    },
    {
      "title": "Validate generated task linking",
      "description": "Test that all generated tasks are linked to the created User Story.",
      "type": "QA",
      "priority": "Medium",
      "definition_of_done": [
        "All generated tasks show the correct User Story link",
        "User Story shows all generated tasks",
        "Audit log captures generation event"
      ]
    }
  ]
}
```

---

## 17. Task Status

Recommended MVP status for AI-created tasks:

```text
Generated
```

Alternative:

```text
To Do
```

Recommended:

```text
Generated
```

Reason:

Later, human approval can be added without changing the model.

Possible future flow:

```text
Generated
  ↓
Approved / Ready
  ↓
In Progress
  ↓
Done
```

For MVP, generated tasks can still be visible in the normal task list.

---

## 18. Task Metadata

Each generated task should store:

```text
- source_user_story_id
- generated_by_ai = true
- source_skill_name
- source_agent_name
- source_channel = ai_intake
- task_generation_batch_id
```

This gives traceability.

---

## 19. Artifact Linking

This is a critical requirement for future extensibility.

Do not hardcode only User Story to Task.

Use a generic artifact-linking structure.

### 19.1 Recommended Table: `artifact_links`

```text
artifact_links
- id
- project_id
- source_artifact_type
- source_artifact_id
- target_artifact_type
- target_artifact_id
- relationship_type
- created_by_type
- created_by_id
- source_channel
- created_at
```

### 19.2 Relationship Types

Initial relationship types:

```text
user_story_has_task
task_implements_user_story
artifact_created_from_ai_intake
```

Future relationship types:

```text
task_has_bug
bug_found_in_task
test_case_validates_task
test_run_executed_for_task
bug_created_by_mcp_agent
evidence_attached_to_bug
```

### 19.3 Initial Links

When tasks are generated from a User Story, create:

```text
User Story → Task
relationship_type = user_story_has_task
```

Optionally also create reverse relation logically in queries:

```text
Task → User Story
relationship_type = task_implements_user_story
```

---

## 20. Source Channel Model

Every artifact should know how it was created.

Recommended source channels:

```text
manual
ai_intake
api
webhook
mcp
system
```

For this feature:

```text
User Story source_channel = ai_intake
Task source_channel = ai_intake
```

Future MCP-created bugs:

```text
Bug source_channel = mcp
```

---

## 21. Actor Type Model

The system should distinguish who or what created an action.

Recommended actor types:

```text
user
agent
mcp_agent
system
```

For MVP:

```text
AI Intake created by external agent or user upload
```

For future MCP:

```text
Bug created by tester via MCP agent
```

Important future rule:

```text
MCP actions must run under the connected user's permission scope.
```

If the user cannot manually create bugs, their MCP-connected agent should not be able to create bugs either.

---

## 22. Audit Logging

Audit logging should be included from day one.

Recommended table:

```text
audit_logs
- id
- actor_type
- actor_id
- action
- entity_type
- entity_id
- project_id
- source_channel
- payload_summary
- created_at
```

Examples:

```text
AI intake received
AI intake created User Story
AI task generation started
AI generated 5 tasks
AI created linked task
AI intake failed validation
Future: MCP agent created bug
Future: MCP agent linked bug to task
Future: User connected MCP client
Future: User revoked MCP client
```

---

## 23. Duplicate Detection

The system should reduce duplicate imports.

### 23.1 Content Hash

Calculate a hash of the Markdown content.

Recommended field:

```text
source_content_hash
```

If the same project receives the same hash again, the system should either:

```text
- reject as duplicate
- or create a new version
- or warn the user
```

For MVP, recommended behavior:

```text
Reject duplicate import under the same project unless force_import = true.
```

### 23.2 Task Duplicate Detection

Before creating tasks, compare generated task titles under the same User Story/project.

For MVP:

```text
Avoid exact duplicate task titles under the same User Story.
```

Later:

```text
Use semantic similarity detection.
```

---

## 24. Validation Rules

### 24.1 Intake Validation

The system should validate:

```text
1. Markdown content exists.
2. Markdown size is within allowed limit.
3. Project exists.
4. User or agent has permission to create User Story in the project.
5. Skill name is valid or accepted as unknown.
6. Payload is sanitized.
7. Duplicate content hash is checked.
8. Required user story fields can be extracted or generated.
```

### 24.2 Task Generation Validation

The system should validate:

```text
1. Tasks array is not empty.
2. Each task has a title.
3. Each task has a description.
4. Each task belongs to the same project.
5. Each task is linked to the created User Story.
6. Task type is valid or defaults to General.
7. Priority is valid or defaults to Medium.
```

---

## 25. Security Requirements

### 25.1 API/Webhook Security

The AI Intake API/webhook should support:

```text
- API key or token authentication
- Webhook signature validation if possible
- Rate limiting
- Payload size limits
- Markdown sanitization
- HTML/script stripping
- Project-level authorization
- Audit logging
```

### 25.2 Agent Permissions

External agents should have restricted access.

Default external agent permissions:

```text
Can:
- submit Markdown intake
- create User Story through controlled intake
- request task generation if allowed

Cannot:
- delete artifacts
- approve stories
- close tasks
- bypass project permissions
- access unrelated projects
```

---

## 26. Project-Level Settings

Add project settings to control the feature.

Suggested settings:

```text
AI Intake Enabled: Yes/No
Allowed Intake Methods: API / Webhook / Upload / Paste
Allowed Skills: list
Auto-generate Tasks: Yes/No
Auto-create Tasks: Yes/No
Default User Story Status: Draft / Reviewing
Default Task Status: Generated / To Do
Require Human Review Before Task Creation: Yes/No
Allowed Agents: list
```

Recommended MVP defaults:

```text
AI Intake Enabled = Yes
Auto-generate Tasks = Yes
Auto-create Tasks = Yes
Default User Story Status = Reviewing
Default Task Status = Generated
Require Human Review Before Task Creation = No
```

---

## 27. Required UI

### 27.1 AI Intake List Page

Suggested columns:

```text
Title
Project
Skill Name
Source Agent
Status
Tasks Generated
Created At
Actions
```

Actions:

```text
View
Regenerate Tasks
Create Tasks
Archive
View User Story
```

### 27.2 AI Intake / Upload Page

Fields:

```text
Project
Skill Name
Source Agent
Markdown Upload
Markdown Paste Area
Create Tasks toggle
Submit button
```

### 27.3 User Story Details Page

Add section:

```text
AI Source
- Source Channel
- Source Agent
- Skill Name
- Intake Method
- Source Conversation ID
- Content Hash
- Original Markdown
```

Add another section:

```text
Generated Tasks
- Task title
- Task status
- Task type
- Priority
- Link to task
```

### 27.4 Task Details Page

Add section:

```text
Source
- Generated by AI
- Source User Story
- Source Skill
- Source Agent
- Source Channel
```

Future:

```text
Linked Bugs
- Bug title
- Severity
- Status
- Created via MCP
```

---

## 28. API Design

### 28.1 Create User Story from AI Markdown

```http
POST /api/ai-intake/user-story
```

Request:

```json
{
  "project_key": "QC-MANAGER",
  "skill_name": "GSD",
  "source_agent": "Claude",
  "source_type": "api",
  "source_conversation_id": "optional",
  "markdown": "# Feature Plan...",
  "create_tasks": true,
  "task_mode": "auto_create"
}
```

Response:

```json
{
  "status": "success",
  "user_story": {
    "id": "uuid",
    "title": "AI User Story Intake",
    "status": "reviewing"
  },
  "tasks": [
    {
      "id": "task-uuid-1",
      "title": "Build AI intake endpoint",
      "status": "generated"
    }
  ],
  "links": {
    "user_story_url": "/projects/qc-manager/user-stories/uuid"
  }
}
```

### 28.2 Generate Tasks for Existing AI User Story

```http
POST /api/user-stories/{userStoryId}/generate-tasks
```

Request:

```json
{
  "mode": "auto_create",
  "regenerate": false
}
```

Response:

```json
{
  "status": "success",
  "generated_tasks_count": 4,
  "created_tasks_count": 4
}
```

### 28.3 List Generated Tasks

```http
GET /api/user-stories/{userStoryId}/generated-tasks
```

### 28.4 Webhook Endpoint

```http
POST /webhooks/ai-intake/user-story
```

The webhook should use the same payload structure as the API where possible.

---

## 29. Backend Services

Recommended service structure:

```text
AIIntakeController
AIIntakeService
MarkdownSanitizationService
MarkdownParsingService
SkillDetectionService
ProjectResolutionService
UserStoryCreationService
TaskGenerationService
TaskCreationService
ArtifactLinkingService
AuditLogService
DuplicateDetectionService
```

### 29.1 Main Processing Flow

```text
AIIntakeService
  → validate request
  → resolve project
  → validate permissions
  → detect/validate skill
  → sanitize markdown
  → check duplicate hash
  → parse markdown
  → create user story
  → generate AI-readable JSON
  → generate tasks
  → create tasks
  → link tasks to user story
  → log audit events
  → return response
```

---

## 30. Data Model Changes

### 30.1 Extend `user_stories`

Add fields:

```text
raw_markdown
ai_readable_json
source_type
source_channel
source_skill_name
source_agent_name
source_conversation_id
source_content_hash
generated_by_ai
created_by_type
created_by_agent_id
```

### 30.2 Extend `tasks`

Add fields:

```text
source_user_story_id
generated_by_ai
source_channel
source_skill_name
source_agent_name
task_generation_batch_id
created_by_type
created_by_agent_id
```

### 30.3 Add `ai_intake_logs`

```text
ai_intake_logs
- id
- project_id
- user_story_id
- source_type
- source_channel
- source_skill_name
- source_agent_name
- source_conversation_id
- source_content_hash
- raw_payload
- status
- error_message
- created_at
```

### 30.4 Add `ai_task_generation_batches`

```text
ai_task_generation_batches
- id
- project_id
- user_story_id
- status
- generated_tasks_count
- created_tasks_count
- model_or_agent_used
- error_message
- created_at
```

### 30.5 Add or Extend `artifact_links`

```text
artifact_links
- id
- project_id
- source_artifact_type
- source_artifact_id
- target_artifact_type
- target_artifact_id
- relationship_type
- created_by_type
- created_by_id
- source_channel
- created_at
```

### 30.6 Optional Future: `external_agents`

```text
external_agents
- id
- name
- provider
- type
- status
- allowed_projects
- created_at
- updated_at
```

### 30.7 Future: `user_mcp_connections`

```text
user_mcp_connections
- id
- user_id
- provider
- connection_name
- status
- scopes
- created_at
- last_used_at
```

This is future only.

---

## 31. Permissions

### 31.1 MVP Permissions

Add permissions:

```text
ai_intake.view
ai_intake.create
ai_intake.generate_tasks
ai_intake.archive
user_stories.create_from_ai
tasks.create_from_ai
artifact_links.create
```

### 31.2 Future MCP Permissions

Prepare permission names now, even if they are not active yet:

```text
mcp.connect
mcp.disconnect
mcp.read_task_context
mcp.read_user_story_context
mcp.create_bug
mcp.link_artifact
mcp.create_test_case
mcp.update_task_status
mcp.add_evidence
```

### 31.3 Important MCP Permission Rule

Future MCP tools must run under the connected user's permission scope.

Example:

```text
If tester cannot create bugs manually,
then tester's MCP agent cannot create bugs either.
```

---

## 32. Future MCP Design Placeholder

MCP is not part of the MVP, but the structure must support it.

Future MCP tools may include:

```text
get_my_projects
get_user_story_context
get_task_context
create_bug
link_bug_to_task
create_test_case
update_test_result
add_evidence
update_task_status
```

Future bug creation via MCP:

```text
Tester uses MCP agent
        ↓
MCP agent reads task context
        ↓
Tester describes bug
        ↓
MCP calls create_bug
        ↓
QC-Manager creates bug
        ↓
QC-Manager links bug to task
        ↓
Audit log records source_channel = mcp
```

Future bug fields:

```text
title
description
severity
priority
steps_to_reproduce
expected_result
actual_result
environment
linked_task_id
source_channel = mcp
created_by_type = user_via_mcp
```

---

## 33. Future Testing Flow

After implementation:

```text
Task = Done by developer or agent
        ↓
Tester tests task
        ↓
Bug found
        ↓
Tester uses MCP agent
        ↓
Bug created in QC-Manager
        ↓
Bug linked to Task
        ↓
Task remains linked to User Story
```

Final traceability:

```text
Project
  └── User Story
        └── Task
              └── Bug
```

Later:

```text
Project
  └── User Story
        └── Task
              ├── Test Case
              ├── Test Run
              ├── Bug
              └── Evidence
```

---

## 34. Human-in-the-Loop Future

Human review can be added later.

Future flow:

```text
AI Intake received
        ↓
User Story created as Draft/Reviewing
        ↓
Tasks generated as Pending Review
        ↓
Human reviews generated tasks
        ↓
Human approves selected tasks
        ↓
Approved tasks become active
```

Future statuses:

```text
Generated
Pending Review
Approved
Rejected
Ready
In Progress
Done
```

---

## 35. Recommended MVP Scope

Implement now:

```text
1. API endpoint for AI User Story Intake.
2. Webhook endpoint for AI User Story Intake.
3. Manual upload/paste UI.
4. Skill name field.
5. Project selection/project key resolution.
6. Markdown validation and sanitization.
7. User Story creation from Markdown.
8. Store raw Markdown in User Story.
9. Generate parsed AI-readable JSON.
10. Generate one or more Tasks.
11. Create Tasks linked to User Story.
12. Mark User Story and Tasks as AI-generated.
13. Add source channel and source metadata.
14. Add generic artifact_links support.
15. Add audit logs.
16. Add duplicate detection by Markdown content hash.
17. Prepare permission names for future MCP.
```

Do not implement now:

```text
1. Full MCP server.
2. User MCP connection from Preferences.
3. MCP token generation.
4. MCP bug creation.
5. MCP test case creation.
6. Agent task implementation.
7. Full approval workflow.
8. GitHub PR/commit integration.
```

---

## 36. Acceptance Criteria

### 36.1 AI Intake Submission

```gherkin
Given I have a valid Markdown file generated by an AI skill
And I select a valid project
When I submit the Markdown through AI Intake
Then QC-Manager should create a User Story under the selected project
And the original Markdown should be stored in the User Story
And the skill name should be saved
And the source channel should be AI Intake
```

### 36.2 API Intake

```gherkin
Given an external AI agent sends a valid payload to the AI Intake API
When the payload includes project key, skill name, and Markdown
Then QC-Manager should resolve the project
And create a User Story
And return the User Story ID and URL
```

### 36.3 Task Generation

```gherkin
Given a User Story was created from AI Intake
When task generation runs
Then QC-Manager should create one or more tasks
And all tasks should be linked to the User Story
And all tasks should be marked as AI-generated
```

### 36.4 Duplicate Markdown

```gherkin
Given the same Markdown content was already imported into the same project
When the same Markdown is submitted again
Then QC-Manager should detect the duplicate by content hash
And should reject or warn based on system configuration
```

### 36.5 Audit Log

```gherkin
Given a Markdown file is imported through AI Intake
When the User Story and tasks are created
Then audit logs should be created for:
- intake received
- User Story created
- task generation started
- tasks created
- artifact links created
```

### 36.6 Future MCP Compatibility

```gherkin
Given a task was created from an AI-generated User Story
When a future MCP agent creates a bug for that task
Then the bug should be linked to the task using the generic artifact link model
And the bug should have source_channel = mcp
```

---

## 37. Risks

### 37.1 Bad Markdown Quality

AI-generated Markdown may be inconsistent.

Mitigation:

```text
- Encourage frontmatter
- Use fallback parsing
- Store raw Markdown
- Generate normalized JSON
```

### 37.2 Wrong Project Mapping

An agent may send the wrong project key.

Mitigation:

```text
- Validate project key
- Enforce agent/user access to project
- Show project clearly in the UI
```

### 37.3 Duplicate Tasks

AI may generate duplicate tasks.

Mitigation:

```text
- Check duplicate task titles under same User Story
- Add future semantic duplicate detection
```

### 37.4 Overgeneration

AI may generate too many tasks.

Mitigation:

```text
- Add max task limit per generation
- Add project setting
- Add future human review
```

### 37.5 Security

Markdown may contain unsafe HTML or scripts.

Mitigation:

```text
- Sanitize Markdown
- Strip scripts
- Limit payload size
- Use authentication
- Audit everything
```

### 37.6 MCP Future Complexity

If artifact links and source channels are not added now, MCP integration later will require rework.

Mitigation:

```text
- Add artifact_links now
- Add source_channel now
- Add created_by_type now
- Add future MCP permission names now
```

---

## 38. Recommended System Rule

The system should enforce this rule:

```text
Every AI-imported Markdown must become a User Story under a Project.
Every task generated from that Markdown must be linked to the User Story.
Every AI/MCP-created artifact must keep its source channel and audit history.
```

---

## 39. Final Target Structure

MVP:

```text
Project
  └── User Story
        ├── Raw Markdown
        ├── Parsed Attributes
        ├── AI-readable JSON
        └── Tasks
```

Future:

```text
Project
  └── User Story
        └── Task
              ├── Test Case
              ├── Test Run
              ├── Bug
              └── Evidence
```

---

## 40. Claude Research Prompt

Use the following prompt with Claude or another AI planning agent:

```text
Act as a senior software architect, product designer, backend developer, frontend developer, and QC lead.

I want to implement the feature described in this Markdown document for QC-Manager.

Please analyze the full requirement and create a separate implementation plan that includes:

1. Recommended architecture.
2. Database migration plan.
3. Backend API plan.
4. Frontend UI plan.
5. AI task-generation flow.
6. Security and permission plan.
7. Artifact linking design.
8. Audit logging design.
9. Future MCP compatibility plan.
10. Testing strategy.
11. Implementation phases.
12. Risks and mitigations.
13. Exact development tasks that should be created.

Important constraints:
- QC-Manager is currently a ticketing/tracking tool, not a full project management tool.
- The imported Markdown should become a User Story under a selected Project.
- The User Story should store the raw Markdown and parsed attributes.
- The system should generate one or more linked Tasks from the User Story.
- The skill name that generated the Markdown must be stored.
- The flow must be AI-friendly through API/webhook/upload.
- Future MCP-based bug creation must be supported by the structure, but MCP should not be implemented in MVP.
- The generic artifact linking model must support future User Story → Task → Bug traceability.
- The first implementation should be practical, safe, and not over-engineered.

Now create the implementation plan.
```

---

## 41. Final Recommendation

The feature should be implemented as:

```text
AI Skill Markdown
        ↓
AI-Friendly Intake
        ↓
Project User Story
        ↓
Generated Linked Tasks
        ↓
Future MCP Bug Linking
```

The best internal model is:

```text
User Story = PRD container
Markdown = original AI-generated source
Tasks = execution tickets
Artifact Links = traceability layer
Source Channel = future-proof integration marker
Audit Logs = governance layer
```

The MVP should be small enough to build now, but structured enough to support future MCP integration without redesigning the core artifact model.
