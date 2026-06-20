# Phase 1 Contracts: Endpoints Used

No new endpoints. This feature reuses three existing endpoints and makes one backward-compatible contract change (accepting `null` to clear the parent).

## Reused — read

### `GET /search` (candidate search)
Used for typed search of user stories within a project.

Request (query): `q` (≥2 chars), `type=user_story`, `project_id=<uuid>`, `limit` (≤50).
Response `data[]` items:
```json
{
  "type": "user_story",
  "id": "<user_story uuid>",
  "display_id": "US-1234",
  "title": "As a user I can ...",
  "project_id": "<uuid>",
  "project_name": "Acme",
  "status": "In Progress",
  "priority": "High",
  "url": "/user-stories/<uuid>"
}
```
Access: non-admins require `page:projects`; results are pre-filtered to permitted rows. **Unchanged.**

### `GET /user-stories?project_id=<uuid>&limit=<n>` (browse list)
Used for the initial "click opens a list" view and as the client-filter source.
Response: `{ data: UserStory[], pagination: {...} }`. Access: `qc.projects.view`. **Unchanged.**

### `GET /user-stories/:id` (resolve saved value)
Used on edit to render the readable label for a saved `parent_user_story_id`.
Response: `UserStory`. `404`/`403` → picker shows "unresolved" state. **Unchanged.**

## Reused — write (contract change)

### `POST /tasks` (create)
Body includes optional `parent_user_story_id: <uuid>`.
**Change**: the create handler MUST persist this field (add to INSERT). No request-shape change; this fixes a silent drop. Validated by `baseTaskSchema` (already optional uuid).

### `PATCH /tasks/:id` (update)
Body may include `parent_user_story_id`.
**Contract change (backward-compatible)**:
- `<uuid>` → set/replace the link (already supported).
- `null` → **clear** the link (NEW — `updateTaskSchema` must allow `null`; dynamic update loop writes `NULL`).
- key omitted → unchanged (already supported).

Audit: every create/update records before/after via existing `auditLog`. No contract change for audit, notifications, or Tuleap sync.

## Compatibility notes

- Sending `null` is additive; existing callers that omit the key or send a uuid are unaffected.
- Existing edit clients that never sent `null` continue to work; only the enhanced form newly sends `null` to clear.
