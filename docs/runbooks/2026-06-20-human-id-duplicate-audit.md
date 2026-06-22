# Pre-flight: Human-ID Duplicate Audit

**Date:** 2026-06-20
**Status:** MUST BE RUN BY A HUMAN before deploying the partial unique indexes added in this branch.

## Purpose

The human-readable artifact URL feature (branch `worktree-human-readable-artifact-urls`) adds four
partial unique indexes to enforce that each human ID resolves to at most one live row. The indexes are:

- `uq_bugs_bug_id_live` on `bugs(bug_id) WHERE deleted_at IS NULL`
- `uq_tasks_task_id_live` on `tasks(task_id) WHERE deleted_at IS NULL AND task_id IS NOT NULL`
- `uq_test_case_test_case_id_live` on `test_case(test_case_id) WHERE deleted_at IS NULL`
- `uq_test_suites_suite_id_live` on `test_suites(suite_id) WHERE deleted_at IS NULL`

`CREATE UNIQUE INDEX` **will fail** if duplicate values exist. Because the indexes are created during
API startup (`runMigrations` in `db.js`), a failure here will **wedge API startup** until the
duplicates are resolved.

## GATE: Run audit queries BEFORE deploying

**Target:** `supabase-db` (prod). Do NOT run against the legacy `qc-postgres` container.

Each of the four queries below is **READ-ONLY**. Run them against the production database and confirm
every query returns **zero rows**. If any query returns rows, **STOP — do not deploy** until the
duplicates are resolved with the team.

```sql
-- each query must return ZERO rows before proceeding
SELECT bug_id, count(*) FROM bugs WHERE deleted_at IS NULL GROUP BY bug_id HAVING count(*) > 1;
SELECT task_id, count(*) FROM tasks WHERE deleted_at IS NULL AND task_id IS NOT NULL GROUP BY task_id HAVING count(*) > 1;
SELECT test_case_id, count(*) FROM test_case WHERE deleted_at IS NULL GROUP BY test_case_id HAVING count(*) > 1;
SELECT suite_id, count(*) FROM test_suites WHERE deleted_at IS NULL GROUP BY suite_id HAVING count(*) > 1;
-- run_id already has a UNIQUE constraint; user_story resolves via tuleap_artifact_id (already UNIQUE NOT NULL)
```

## Expected results (record here before proceeding)

| Query | Row count | Audited by | Date |
|-------|-----------|------------|------|
| bugs duplicate bug_id | 0 | — | — |
| tasks duplicate task_id | 0 | — | — |
| test_case duplicate test_case_id | 0 | — | — |
| test_suites duplicate suite_id | 0 | — | — |

## If duplicates are found

1. **Do not deploy** this branch.
2. Investigate the duplicate rows (check `created_at`, `tuleap_artifact_id`, `deleted_at` etc).
3. Resolve with the team: soft-delete the spurious rows or update the human IDs to be unique.
4. Re-run the audit queries to confirm zero rows, then proceed with the deploy.

## Post-deploy verification

After deploy, grep the `qc-api` container logs for `migration error` to confirm the indexes were
created without error:

```bash
docker logs qc-api 2>&1 | grep -i "migration error"
# Expected: no output (empty)
```

Also check for the success message:
```bash
docker logs qc-api 2>&1 | grep "Database migrations completed successfully"
# Expected: at least one line
```
