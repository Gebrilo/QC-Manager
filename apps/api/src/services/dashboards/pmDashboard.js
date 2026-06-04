'use strict';

// Helper: append an access-engine clause to a WHERE.
function withAccess(baseSql, access) {
    if (!access || access.clause === 'TRUE') return baseSql;
    if (access.clause === 'FALSE') return `${baseSql} AND FALSE`;
    return `${baseSql} AND ${access.clause}`;
}

async function getWorkloadCounts(db, projectId, access) {
    const queries = [
        { sql: 'SELECT COUNT(*)::int AS c FROM tasks WHERE project_id = $1', access: access.tasks },
        { sql: 'SELECT COUNT(*)::int AS c FROM bugs WHERE project_id = $1', access: access.bugs },
        { sql: 'SELECT COUNT(*)::int AS c FROM user_stories WHERE project_id = $1', access: access.user_stories },
    ];

    let total = 0;
    for (const q of queries) {
        const sql = withAccess(q.sql, q.access);
        const params = [projectId, ...(q.access ? q.access.params : [])];
        const r = await db.query(sql, params);
        total += Number(r.rows[0]?.c || 0);
    }
    return total;
}

async function getTasksByStatus(db, projectId, access) {
    const base = 'SELECT status, COUNT(*)::int AS c FROM tasks WHERE project_id = $1';
    const sql = `${withAccess(base, access)} GROUP BY status`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) out[row.status] = Number(row.c);
    return out;
}

async function getTasksByTeam(db, projectId, access) {
    const base = 'SELECT owner_team_id, COUNT(*)::int AS c FROM tasks WHERE project_id = $1';
    const sql = `${withAccess(base, access)} GROUP BY owner_team_id`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) {
        const key = row.owner_team_id || 'unassigned';
        out[key] = Number(row.c);
    }
    return out;
}

async function getBugsByStatus(db, projectId, access) {
    const base = 'SELECT status, COUNT(*)::int AS c FROM bugs WHERE project_id = $1';
    const sql = `${withAccess(base, access)} GROUP BY status`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) out[row.status] = Number(row.c);
    return out;
}

async function getBugsBySeverity(db, projectId, access) {
    const base = 'SELECT severity, COUNT(*)::int AS c FROM bugs WHERE project_id = $1';
    const sql = `${withAccess(base, access)} GROUP BY severity`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) out[row.severity] = Number(row.c);
    return out;
}

async function getUserStoryProgress(db, projectId, access) {
    const base = `
        SELECT
            COUNT(*)::int AS total,
            SUM(CASE WHEN status IN ('In Progress','Ready for Review') THEN 1 ELSE 0 END)::int AS in_progress,
            SUM(CASE WHEN status IN ('Done','Closed','Released') THEN 1 ELSE 0 END)::int AS done
        FROM user_stories
        WHERE project_id = $1`;
    const sql = withAccess(base, access);
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const row = r.rows[0] || { total: 0, in_progress: 0, done: 0 };
    return { total: Number(row.total), in_progress: Number(row.in_progress), done: Number(row.done) };
}

async function getBlockedCount(db, projectId, access) {
    // Blocked count = test_execution rows in 'blocked' status for the project.
    // Tasks/bugs have no blocked column — see plan scope notes.
    // No access filter applied here: PM-level blocked count is project-scoped only
    // (test_execution rows are not directly owned by a team).
    const sql = `
        SELECT COUNT(*)::int AS c
          FROM test_execution te
          JOIN test_run tr ON tr.id = te.test_run_id
         WHERE tr.project_id = $1
           AND te.status = 'blocked'`;
    const r = await db.query(sql, [projectId]);
    return Number(r.rows[0]?.c || 0);
}

async function getOverdueCount(db, projectId, access) {
    const base = `
        SELECT COUNT(*)::int AS c
        FROM tasks
        WHERE project_id = $1
          AND deadline IS NOT NULL
          AND deadline < CURRENT_DATE
          AND status NOT IN ('Done','Cancelled')`;
    const sql = withAccess(base, access);
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    return Number(r.rows[0]?.c || 0);
}

async function getResourceUtilization(db, projectId, access) {
    // For each resource appearing on any non-terminal task in the project,
    // sum the estimate hours that resource is responsible for (r1 or r2 slot).
    const base = `
        WITH resource_load AS (
            SELECT r.id AS resource_id,
                   r.resource_name AS name,
                   COALESCE(r.weekly_capacity_hrs, 0)::int AS capacity_hrs,
                   COALESCE(SUM(
                       CASE WHEN t.resource1_id = r.id THEN COALESCE(t.r1_estimate_hrs, 0) ELSE 0 END
                     + CASE WHEN t.resource2_id = r.id THEN COALESCE(t.r2_estimate_hrs, 0) ELSE 0 END
                   ), 0)::int AS allocated_hrs
              FROM resources r
              JOIN tasks t
                ON (t.resource1_id = r.id OR t.resource2_id = r.id)
             WHERE t.project_id = $1
               AND t.status NOT IN ('Done','Cancelled')
               AND r.deleted_at IS NULL`;
    const sql = `${withAccess(base, access)}
            GROUP BY r.id, r.resource_name, r.weekly_capacity_hrs
        )
        SELECT * FROM resource_load
        ORDER BY name`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    return r.rows.map(row => {
        const cap = Number(row.capacity_hrs);
        const alloc = Number(row.allocated_hrs);
        return {
            resource_id: row.resource_id,
            name: row.name,
            capacity_hrs: cap,
            allocated_hrs: alloc,
            utilization_pct: cap > 0 ? Math.round((alloc / cap) * 100) : 0,
        };
    });
}

async function getCrossTeamDependencies(db, projectId) {
    const sql = `
        SELECT t.owner_team_id AS from_team,
               tc.owner_team_id AS to_team,
               COUNT(*)::int AS artifact_count
          FROM task_test_cases ttc
          JOIN tasks t      ON t.id = ttc.task_id
          JOIN test_cases tc ON tc.id = ttc.test_case_id
         WHERE t.project_id = $1
           AND t.owner_team_id IS NOT NULL
           AND tc.owner_team_id IS NOT NULL
           AND t.owner_team_id <> tc.owner_team_id
         GROUP BY t.owner_team_id, tc.owner_team_id
         ORDER BY artifact_count DESC`;
    const r = await db.query(sql, [projectId]);
    return r.rows.map(row => ({
        from_team: row.from_team,
        to_team: row.to_team,
        artifact_count: Number(row.artifact_count),
    }));
}

async function getTestExecutionSummary(db, projectId) {
    // PRD A8/A26: PM lacks qc.testcases.view_steps — only counts, never
    // any test case body fields are exposed.
    // Status enum values from migration 001: 'pass', 'fail', 'blocked'.
    // Returns only passed/failed/blocked/total per the dashboard API contract;
    // not_run and skipped executions count toward `total` but have no named bucket.
    const sql = `
        SELECT
            SUM(CASE WHEN te.status = 'pass'    THEN 1 ELSE 0 END)::int AS passed,
            SUM(CASE WHEN te.status = 'fail'    THEN 1 ELSE 0 END)::int AS failed,
            SUM(CASE WHEN te.status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked,
            COUNT(*)::int AS total
          FROM test_execution te
          JOIN test_run tr ON tr.id = te.test_run_id
         WHERE tr.project_id = $1`;
    const r = await db.query(sql, [projectId]);
    const row = r.rows[0] || { passed: 0, failed: 0, blocked: 0, total: 0 };
    return {
        passed: Number(row.passed),
        failed: Number(row.failed),
        blocked: Number(row.blocked),
        total: Number(row.total),
    };
}

module.exports = {
    getWorkloadCounts,
    withAccess,
    getTasksByStatus,
    getTasksByTeam,
    getBugsByStatus,
    getBugsBySeverity,
    getUserStoryProgress,
    getBlockedCount,
    getOverdueCount,
    getResourceUtilization,
    getCrossTeamDependencies,
    getTestExecutionSummary,
};
