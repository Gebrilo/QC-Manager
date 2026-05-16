# ADR 0009: tracker_config naming + qcProjectId/tuleapProjectId convention

## Status

Accepted

## Context

The codebase used bare `projectId` for both QC and Tuleap project identifiers. This made it impossible to tell from a variable name whether the value is a UUID (QC) or an integer (Tuleap). The `tuleap_sync_config` table was renamed to `tracker_config` (ADR 0008), but a backward-compat view shim was temporarily left in place.

Additionally, the `tracker_config` table still has a `tuleap_project_id` column (integer) alongside `qc_project_id` (UUID). The `projects` table uses `project_id` (UUID, PK) and `tuleap_project_id` (integer). When reading Tuleap project IDs from code, the distinction matters.

## Decision

1. **JavaScript variables**: `qcProjectId` for QC project UUIDs, `tuleapProjectId` for Tuleap project integers. Bare `projectId` is banned in `apps/api/src/modules/**` via ESLint rule `no-bare-projectId`.

2. **URL path params**: `:qcProjectId` on all work/identity/quality routes; `:tuleapProjectId` on integration routes that accept Tuleap integer IDs.

3. **SQL column names**: Stay as-is (`project_id`, `qc_project_id`, `tuleap_project_id`). The naming convention applies to JavaScript code, not schema.

4. **Artifact Links**: Link arrays return only `linked_artifact_id` (QC UUID). `business_key` and `tuleap_artifact_id` appear only on the artifact's own detail endpoint. Translation between QC UUID and Tuleap integer stays inside `tuleapLinkResolver.js`.

5. **`tuleap_sync_config` view shim**: Dropped. All code reads `tracker_config` directly.

## Consequences

- Any future use of bare `projectId` in modules/ will fail the ESLint check.
- Frontend and API consumers already using `project_id` in JSON payloads are unaffected — the convention is purely about internal JavaScript identifiers and URL path parameter naming.
- The `parent_story_tuleap_artifact_id` column is excluded from task API responses (it's another artifact's Tuleap ID leaking into a task's row).