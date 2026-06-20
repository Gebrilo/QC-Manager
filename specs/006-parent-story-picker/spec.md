# Feature Specification: Searchable Parent User Story Picker for Tasks

**Feature Branch**: `006-parent-story-picker`
**Created**: 2026-06-20
**Status**: Draft
**Input**: User description: "Enhance the Links section in the Task Creation and Task Edit pages so the Parent User Story field becomes a searchable dropdown instead of a manual UUID input field, scoped to the task's project, respecting permissions, with readable display and audit tracking."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find and link a parent user story while creating a task (Priority: P1)

When creating a task, a user opens the **Links** section and clicks the **Parent User Story** field. Instead of an empty box demanding a UUID, a dropdown opens listing the user stories that belong to the task's project. The user types part of a title, an ID, a status, or a priority to narrow the list, recognizes the correct user story from its readable details, and selects it. The field then shows a human-readable summary (ID and title) rather than a raw identifier, and saving the task records the link.

**Why this priority**: This is the core problem being solved. Today a user cannot link a task to its parent without first knowing or copying an exact UUID, which is the single biggest friction point. Delivering only this story already removes the need to handle UUIDs by hand and makes linking usable on its own.

**Independent Test**: Create a new task in a project that contains at least one user story, open the Links section, search for and select a user story, save, and confirm the task is linked to the chosen user story and the field displayed a readable value (not a UUID) before saving.

**Acceptance Scenarios**:

1. **Given** a task being created in a project that has user stories, **When** the user clicks the Parent User Story field, **Then** a dropdown opens showing user stories from that project only.
2. **Given** the dropdown is open, **When** the user types text matching a user story's title, ID, Tuleap artifact ID, status, or priority, **Then** the list narrows to matching user stories.
3. **Given** matching user stories are shown, **When** the user selects one, **Then** the field displays the user story's ID and title in readable form and the selection is held for saving.
4. **Given** a user story has been selected, **When** the user saves the task, **Then** the task is persisted with a link to that user story.
5. **Given** the user does not select any user story, **When** the user saves the task, **Then** the task is created with no parent user story link and no error is shown.

---

### User Story 2 - Change the parent user story while editing a task (Priority: P2)

When editing a task that already has a parent user story, the user opens the Links section and sees the currently linked user story shown in readable form. The user opens the dropdown, searches for a different user story in the same project, selects it, and saves. The task's parent relationship is updated to the new user story.

**Why this priority**: Re-parenting is a common correction but is secondary to being able to set a parent at all. It depends on the same searchable picker as P1 and extends it to the edit flow with a pre-populated current value.

**Independent Test**: Open an existing task that has a parent user story, confirm the current parent is shown readably, search for and select a different user story, save, and confirm the parent relationship now points to the newly selected user story.

**Acceptance Scenarios**:

1. **Given** a task with an existing parent user story is opened for editing, **When** the Links section loads, **Then** the Parent User Story field shows the current parent in readable form (ID and title).
2. **Given** the current parent is displayed, **When** the user searches for and selects a different user story in the same project and saves, **Then** the task's parent relationship is updated to the new user story.
3. **Given** the linked parent user story can no longer be resolved (e.g., it was deleted or is no longer accessible), **When** the edit page loads, **Then** the field communicates that the current value cannot be displayed and allows the user to pick a new one or clear it without blocking the rest of the form.

---

### User Story 3 - Remove the parent user story link (Priority: P3)

When editing a task that has a parent user story, the user clears the Parent User Story field and saves. The task no longer has a parent relationship.

**Why this priority**: Clearing a link is the least frequent action and is only meaningful once setting and changing links exist. It rounds out full lifecycle management of the relationship.

**Independent Test**: Open an existing task that has a parent user story, clear the Parent User Story field, save, and confirm the task no longer has a parent user story link.

**Acceptance Scenarios**:

1. **Given** a task with a parent user story is being edited, **When** the user clears the field and saves, **Then** the task is saved with no parent user story link.
2. **Given** the user clears the field, **When** the dropdown is reopened, **Then** no user story is shown as selected and the user may pick a new one.

---

### Edge Cases

- **Project has no user stories**: The dropdown opens with an empty-state message indicating there are no user stories to link in this project, rather than appearing broken.
- **No matches for search text**: The dropdown shows a clear "no results" state instead of an empty area.
- **Project not yet chosen**: If the task's project has not been selected, the Parent User Story field communicates that a project must be chosen first (since the candidate list is project-scoped) rather than showing an unscoped or empty list.
- **Large project (many user stories)**: Searching and scrolling remain responsive; results are presented in a way that does not require loading and rendering an unbounded list at once.
- **User lacks permission to view a candidate**: User stories the user is not allowed to see never appear in the dropdown, even if they exist in the project.
- **Currently linked parent is now inaccessible or deleted**: The field does not crash; it indicates the value is unresolved and lets the user keep, change, or clear it. Saving without changing it should not silently break the existing stored link.
- **Tuleap-synced task or user story**: Selecting, changing, or clearing the parent does not disrupt Tuleap synchronization or existing artifact mappings.
- **Duplicate or near-identical titles**: Additional details (ID, status, priority, Tuleap artifact ID) let the user distinguish between user stories with similar titles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Parent User Story field in the Links section of both the Task Creation and Task Edit pages MUST present a searchable dropdown for choosing a user story, replacing the manual identifier text entry.
- **FR-002**: The dropdown MUST list only user stories that belong to the same project as the task being created or edited; user stories from other projects MUST NOT appear.
- **FR-003**: The user MUST be able to search within the dropdown by user story title, user story ID, Tuleap artifact ID (when present), status, and priority. Searching by a keyword from the description SHOULD be supported when description content is available.
- **FR-004**: Each option in the dropdown MUST present enough information to identify the user story unambiguously, including its title, ID, Tuleap artifact ID (when present), status, priority, and project name.
- **FR-005**: The user MUST be able to select exactly one user story as the parent; the relationship is single-valued.
- **FR-006**: After a selection, the field MUST display a human-readable summary of the chosen user story (at minimum its ID and title) rather than a raw identifier.
- **FR-007**: Upon saving, the system MUST persist the correct backend identifier for the selected user story so the existing stored parent relationship remains valid.
- **FR-008**: When editing a task that already has a parent user story, the field MUST show the currently linked user story in readable form when the page loads.
- **FR-009**: The user MUST be able to change the parent to a different user story (from the same project) while editing, and saving MUST update the relationship accordingly.
- **FR-010**: The user MUST be able to clear/remove the parent user story link while editing, and saving MUST remove the parent relationship from the task.
- **FR-011**: Creating or saving a task with no parent user story selected MUST be allowed and MUST NOT produce an error (the relationship is optional).
- **FR-012**: The dropdown MUST exclude any user story the current user is not permitted to view based on project access, team access, role permissions, and user story visibility rules.
- **FR-013**: The feature MUST NOT change the existing task creation and edit behavior beyond the Parent User Story field; all other fields and the overall save flow MUST continue to work as before.
- **FR-014**: Setting, changing, or removing the parent user story MUST NOT break Tuleap synchronization or existing artifact mappings for the task or the user story.
- **FR-015**: Any change to the parent user story relationship (set, change, or remove) MUST be recorded in the task's history/audit trail in a way consistent with how other task changes are tracked.
- **FR-016**: The candidate list and the resolution of the currently linked parent MUST behave gracefully when the project has no user stories, when a search returns no matches, or when the stored parent can no longer be resolved.
- **FR-017**: The parent user story relationship change SHOULD flow through the existing notification and artifact linking mechanisms in the same way the relationship is handled today, so downstream consumers (notifications, linked-artifact views) stay consistent.

### Key Entities *(include if data involved)*

- **Task**: The work item being created or edited. Has an optional single parent relationship to a User Story. Other attributes (status, dates, resources, project) are unchanged by this feature.
- **User Story**: A candidate parent for a task. Relevant attributes for display and search are its title, internal ID, optional Tuleap artifact ID, status, priority, description, and owning project. Belongs to exactly one project.
- **Project**: The scope that bounds which user stories are eligible parents for a task. A task and its eligible parent user stories share the same project.
- **Parent relationship**: The single-valued link from a Task to a User Story. Stored via the existing backend identifier; created, updated, or removed when the task is saved; and recorded in the task's history when changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can link a task to its parent user story without ever typing, pasting, or knowing a UUID.
- **SC-002**: From opening the Links section, a user can find and select a known parent user story in under 15 seconds in a project with a typical number of user stories.
- **SC-003**: 100% of user stories shown in the dropdown belong to the task's project and are ones the current user is permitted to view; user stories from other projects or beyond the user's access never appear.
- **SC-004**: Every set, change, or removal of a task's parent user story is reflected in the task's history/audit trail.
- **SC-005**: Existing tasks with a parent user story continue to display and save correctly after the change, with no regression in the create/edit save flow and no disruption to Tuleap sync.
- **SC-006**: Support questions or manual workarounds related to copying user story UUIDs to link tasks drop to zero after rollout.

## Assumptions

- The parent relationship is **single-valued** (a task has at most one parent user story), matching the current single identifier field.
- Linking a parent remains **optional**; tasks can be created and saved with no parent.
- The backend **storage format is unchanged** — the system continues to store the user story's existing identifier (UUID / artifact relationship ID). This feature changes only how that value is selected and displayed, not what is stored.
- Eligible parents are scoped to the **task's project**; cross-project parents are out of scope.
- The candidate list and currently linked value are subject to the **existing permission model** (project, team, role, and user story visibility). No new permission rules are introduced.
- "Status" and "priority" used for display and search refer to the **user story's** status and priority as already modeled in the system.
- Description-keyword search is **best-effort**: supported where user story description content is available, and not a blocker if it is not.
- Audit/history and notification behavior **reuse the existing task change-tracking and relationship mechanisms** rather than introducing a parallel system.

## Out of Scope

- Allowing a task to have more than one parent user story.
- Linking a task's parent to artifact types other than user stories.
- Creating a new user story from within the picker.
- Cross-project parent relationships.
- Changes to how user story status, priority, or descriptions themselves are defined or edited.
- Bulk re-parenting of multiple tasks at once.
