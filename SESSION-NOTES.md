# Session Notes — Governance Dashboard Bug Source & ID Fix

## Goal

The user wants to fix the Governance Dashboard's bug summary section so that:
1. **Each bug card is labeled with its source** — If a bug is linked to test cases on Tuleap, it should display a "Testing via Test Cases" label/badge. If there are no links, it should display a "Standalone Bug" label.
2. **Bug IDs should follow the format `TLP-xxx`** — instead of the old `BUG-{timestamp}` format, bug IDs should be formatted as `TLP-{tuleap_artifact_id}` (e.g., `TLP-234`).
3. **The source classification comes from the raw Tuleap payload** — if the Tuleap payload mentions linked test cases/artifacts, the bug is `TEST_CASE`. If no links exist, it's `EXPLORATORY` (standalone).

## Instructions

- Deploy using the steps in `/root/DEPLOY.md` when ready to deploy
- The source classification logic: if `linked_test_case_ids` or `linked_test_execution_ids` arrays are non-empty → `TEST_CASE` (display "Testing via Test Cases"); otherwise → `EXPLORATORY` (display "Standalone Bug")
- The user clarified: "the source will appear if raw payload came from tuleap — it may mention that the bug is connected to links or artifacts that label the test cases. If there are no links it means it was found without the test case."

## Discoveries

### Database State (verified via direct query)
- **4 bugs exist** in the `bugs` table, ALL with `source = 'EXPLORATORY'` and `tuleap_artifact_id` values (263, 155, 264, 213)
- All 4 bugs already have `bug_id` in `TLP-xxx` format (e.g., `TLP-263`)
- `v_bug_summary_global` returns: `total_bugs=4, bugs_from_test_cases=0, bugs_from_exploratory=4, bugs_from_testing=0, standalone_bugs=0`
- The `source` column was added via migration with `DEFAULT 'EXPLORATORY'` and `CHECK (source IN ('TEST_CASE', 'EXPLORATORY'))`
- Backfill was already run — no NULL sources exist

### CI/CD Issue
- **GitHub Actions CI/CD is FAILING** — all recent runs failed (commits `d4772d1`, `6f37475`, `50b0f97`). This means Docker images on Docker Hub are **stale** and do NOT contain our code changes.
- The `qc-api` container has the latest code because it was restarted after the push (it reads source from a volume or was manually updated). Verified: `grep "finalBugId" /app/src/routes/bugs.js` shows `TLP-` format and `finalSource`.
- The **`qc-web` container is NOT rebuilt** — its JS chunks are from **April 1st** and do NOT contain `by_source`, source badges, or TLP-xxx ID formatting. This is why the user sees no changes on the frontend.
- The API containers were last created `2026-04-05T14:25:49Z` and web `2026-04-05T14:26:00Z` — these are old.

### What Needs to Happen for Deployment
Since GitHub Actions is failing, we need to **build Docker images locally** on the VPS and deploy them manually, OR fix the CI/CD pipeline. The `DEPLOY.md` steps assume images are already built on Docker Hub by CI/CD, but that's not happening.

## Accomplished

### Code Changes — All Committed and Pushed to `main`

**Commit 1** (`6f37475`): Frontend + backend changes
- `apps/api/src/routes/bugs.js` — Added `b.source` and `b.tuleap_artifact_id` to recent bugs SELECT query; changed `bug_id` fallback to `TLP-{tuleap_artifact_id}`
- `apps/api/src/routes/tuleapWebhook.js` — Changed bug_id to `TLP-{tuleap_artifact_id}`; added `finalSource` auto-computation (uses `source` from body or computes from linked test IDs); uses `finalSource` in both INSERT and UPDATE
- `apps/web/src/types/governance.ts` — Added `tuleap_artifact_id` and `source` to `Bug` interface; added `by_source` to `BugSummaryData`
- `apps/web/src/lib/api.ts` — Added `tuleap_artifact_id` to `Bug` interface
- `apps/web/src/components/governance/BugSummaryWidget.tsx` — Source donut uses `data.by_source` instead of `totals`; stat cards use `bySource` counts; bug cards show `TLP-xxx` IDs and source label badges ("Testing via Test Cases" / "Standalone Bug")
- `apps/web/app/bugs/page.tsx` — Table shows `TLP-{artifact_id}` format; added Source column with colored badges; updated colspans
- `apps/web/src/services/governanceApi.ts` — Added `by_source` to empty fallback
- `n8n workflow already up to date — already generates `TLP-{artifactId}` and `source`

**Commit 2** (`d4772d1`): Backend fixes
- `apps/api/src/routes/bugs.js` — Added `source` to POST endpoint INSERT with auto-computation (`TEST_CASE` if linked arrays non-empty, else `EXPLORATORY`)
- `apps/api/src/config/db.js` — Removed duplicate `v_bug_summary_global` view definition; added `COALESCE(source, 'EXPLORATORY')` for NULL-safe counting; fixed `standalone_bugs` filter for NULL `array_length`

### NOT Yet Accomplished (Blockers)

1. **Frontend container NOT rebuilt** — CI/CD is failing, so Docker Hub images are stale. The `qc-web` container serves April 1st JS bundles that don't have any of our changes.
2. **Need to build images locally** on the VPS since GitHub Actions can't build them, OR fix the CI/CD pipeline.
3. **Backfill SQL** — May need to run `UPDATE bugs SET source = 'EXPLORATORY' WHERE source IS NULL` on production DB (though current DB has 0 NULLs).
4. **Views need re-creation** — The `v_bug_summary_global` view change (COALESCE) won't take effect until the API container restarts and `runMigrations()` re-runs.

## Next Steps

1. **Build Docker images locally** on the VPS since CI/CD is broken:
   ```bash
   cd /root/QC-Manager
   docker build -t agebril/qc-api:latest ./apps/api
   docker build --build-arg NEXT_PUBLIC_API_URL=https://api.gebrils.cloud -t agebril/qc-web:latest ./apps/web
   ```
2. **Deploy** using DEPLOY.md steps 4-5 (recreate containers, health check)
3. **Run backfill SQL** on production DB to recreate views and ensure no NULL sources
4. **Verify** the frontend shows source labels and TLP-xxx IDs

## Relevant Files

| File | Purpose |
|------|---------|
| `apps/api/src/routes/bugs.js` | Bug routes, summary endpoint, POST endpoint (source added) |
| `apps/api/src/routes/tuleapWebhook.js` | Webhook handler (TLP IDs + finalSource) |
| `apps/api/src/config/db.js` | DB schema, migrations, view definitions (COALESCE fix) |
| `apps/web/src/components/governance/BugSummaryWidget.tsx` | Dashboard bug widget (source badges, by_source donut) |
| `apps/web/src/types/governance.ts` | TypeScript types (Bug, BugSummaryData with by_source) |
| `apps/web/src/lib/api.ts` | API client Bug type (tuleap_artifact_id added) |
| `apps/web/src/services/governanceApi.ts` | getBugSummary fallback (by_source added) |
| `apps/web/app/bugs/page.tsx` | Bugs list page (TLP IDs + Source column) |
| `apps/web/app/projects/[id]/quality/page.tsx` | Project quality page (already has BugsBySourceChart with by_source) |
| `/root/DEPLOY.md` | Deploy steps to follow |
| `/root/.qc-deploy-secrets` | Contains GITHUB_TOKEN, DOCKER_HUB_USERNAME, DOCKER_HUB_TOKEN |
| `n8n-workflows/tuleap-bug-sync.json` | Already generates TLP IDs and source (no changes needed) |
| `scripts/backfill-bug-source.sql` | Backfill script for NULL sources |
