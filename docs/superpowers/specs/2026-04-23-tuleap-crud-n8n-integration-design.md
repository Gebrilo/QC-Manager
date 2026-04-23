# Tuleap CRUD & n8n Integration Design

**Date:** 2026-04-23
**Status:** Approved

## Goal

Extend QC-Manager so users can create, edit, and delete Tuleap artifacts (User Stories, Test Cases, Tasks, Bugs) directly through the QC-Manager API, while n8n continues to handle background sync from Tuleap into QC-Manager.

## Current State

- `POST /tuleap/artifacts/:type` — create endpoint already implemented
- `tuleap-bug-sync.json`, `tuleap-task-sync.json` — webhook-driven Tuleap → QC-Manager sync for bugs and tasks
- `tuleap-bug-deletion-sync.json` — polling sync for bug deletions

## Architecture

**Write path (create / edit / delete):**
QC-Manager UI calls the QC API directly. The API resolves field IDs via the cached FieldRegistry and proxies the operation to the Tuleap REST API via TuleapClient.

**Read path — on-demand:**
QC-Manager UI calls `GET /tuleap/artifacts/:type` or `GET /tuleap/artifacts/:type/:id`. The API proxies the query to Tuleap and returns the raw response.

**Read path — background sync:**
n8n polls Tuleap every 15 minutes per artifact type, transforms the payload into QC-Manager's shape, and upserts records via the QC API.

## Section 1: API Endpoints

File: `apps/api/src/routes/tuleapArtifacts.js` (rename from `tuleapCreate.js`)

All routes are protected by `requireAuth`.

| Method | Path | Tuleap call | Response |
|--------|------|-------------|----------|
| `POST` | `/tuleap/artifacts/:type` | `POST /artifacts` | 201 `{ tuleap_artifact_id, tuleap_url, artifact_type, xref }` |
| `PATCH` | `/tuleap/artifacts/:id` | `PUT /artifacts/:id` | 200 `{ updated: true }` |
| `DELETE` | `/tuleap/artifacts/:id` | `DELETE /artifacts/:id` | 200 `{ deleted: true }` |
| `GET` | `/tuleap/artifacts/:type` | `GET /artifacts?tracker=:trackerId` | 200 `{ data: [...], total }` |
| `GET` | `/tuleap/artifacts/:type/:id` | `GET /artifacts/:id` | 200 artifact object |

### Edit (`PATCH`) input shape

```json
{
  "fields": {
    "story_title": "Updated title",
    "status": "Review"
  },
  "type": "user-story"
}
```

The route resolves each key to a `field_id` via FieldRegistry (using the tracker ID derived from `type`), builds the `{ field_id, value/bind_value_ids }` array, and calls Tuleap `PUT /artifacts/:id`.

### List (`GET /:type`) query params

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 50 | Max results |
| `offset` | 0 | Pagination offset |
| `status` | — | Filter by status label |

## Section 2: n8n Workflows

### New webhook-driven sync workflows (Tuleap → QC-Manager)

Follow the exact structure of `tuleap-bug-sync.json`:

| File | Trigger | Tracker |
|------|---------|---------|
| `tuleap-user-story-sync.json` | Tuleap webhook on US create/update | tracker 6 |
| `tuleap-test-case-sync.json` | Tuleap webhook on TC create/update | tracker 9 |

Nodes: Webhook → Parse Payload → Fetch Sync Config → Match Config → Has Config? → Transform → POST to QC API → Respond OK

### New polling sync workflows (periodic Tuleap → QC-Manager)

Follow the exact structure of `tuleap-bug-deletion-sync.json` (schedule trigger every 15 min):

| File | Tracker ID | Artifact type |
|------|-----------|---------------|
| `tuleap-user-story-poll.json` | 6 | user-story |
| `tuleap-test-case-poll.json` | 9 | test-case |
| `tuleap-task-poll.json` | 5 | task |
| `tuleap-bug-poll.json` | 1 | bug |

Each polling workflow:
1. Fetches active sync configs from QC API (`GET /tuleap-webhook/config?tracker_type=X&is_active=true`)
2. For each config, calls `GET /tuleap/artifacts/:type?limit=100&offset=0` (the new QC API endpoint)
3. Transforms fields into QC-Manager shape
4. Upserts via QC API (`POST /qc-api/...` — existing upsert endpoints)

## Section 3: Data Flow & Error Handling

### Write path

```
QC-Manager UI
  → POST/PATCH/DELETE /tuleap/artifacts/...
  → FieldRegistry.getFieldId() / resolveBindValue() [5-min cache]
  → TuleapClient (3 retries on 429/5xx, exponential back-off)
  → Tuleap REST API
  → 201/200 { tuleap_artifact_id, tuleap_url } on success
```

### Read path (on-demand)

```
QC-Manager UI
  → GET /tuleap/artifacts/:type[/:id]
  → TuleapClient proxies to Tuleap
  → Returns raw Tuleap response (no field transform)
```

### Read path (background)

```
n8n scheduler (every 15 min)
  → GET /tuleap/artifacts/:type  [QC API]
  → n8n transforms to QC-Manager shape
  → Upsert into QC-Manager DB via QC API
```

### Error handling

| Scenario | HTTP response |
|----------|--------------|
| Unknown field name in edit | 400 with message listing valid fields |
| Tuleap 404 on delete | 404 — artifact already gone |
| Tuleap 403 | 502 `{ tuleap_status: 403 }` — PAK permissions issue |
| Tuleap 429 / 5xx | Retried 3× by TuleapClient; 502 if all retries fail |
| Missing required field in create | 400 `{ error: "Missing required fields: ..." }` |
| n8n workflow failure | Logged to n8n execution history; no user-facing impact |

## File Changes

```
apps/api/src/routes/
  tuleapArtifacts.js          ← rename + extend tuleapCreate.js

apps/api/__tests__/
  tuleapArtifacts.routes.test.js  ← extend tuleapCreate.routes.test.js

n8n-workflows/
  tuleap-user-story-sync.json     ← new
  tuleap-test-case-sync.json      ← new
  tuleap-user-story-poll.json     ← new
  tuleap-test-case-poll.json      ← new
  tuleap-task-poll.json           ← new
  tuleap-bug-poll.json            ← new
```

## Testing

- Unit tests for new route handlers (mock TuleapClient + FieldRegistry)
- Existing tuleap tests must keep passing
- n8n workflows validated by importing into n8n and running in dry-run mode against the live Tuleap instance
