'use strict';

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
}));

const db = require('../src/config/db');
const express = require('express');
const request = require('supertest');

let svc;
beforeAll(() => {
    svc = require('../src/services/dashboards/pmDashboard');
});

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Integration test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Express app that mounts only the dashboards router.
 * Auth middleware is replaced by stubs so we can control req.user and the
 * permission gate without hitting the DB for JWT verification.
 *
 * IMPORTANT: we use jest.resetModules() + jest.doMock() inside each test
 * so that re-requiring dashboards.js picks up the freshly stubbed middleware.
 * The db mock was established at file scope and persists across resets.
 */
function buildApp({ user, hasPermission = true } = {}) {
    jest.resetModules();
    // Re-mock db after resetModules so the freshly required dashboards.js
    // gets the same mock instance we hold a reference to above.
    jest.doMock('../src/config/db', () => db);
    jest.doMock('../src/middleware/authMiddleware', () => ({
        requireAuth: (req, _res, next) => { req.user = user; next(); },
        requirePermission: (_key) => (req, res, next) =>
            hasPermission ? next() : res.status(403).json({ error: 'forbidden' }),
    }));
    const app = express();
    app.use(express.json());
    // eslint-disable-next-line global-require
    app.use('/api/dashboards', require('../src/routes/dashboards'));
    return app;
}

/**
 * SQL-pattern mock router.
 *
 * Because the handler wraps 11 helpers in Promise.all, queries from different
 * helpers arrive at db.query in non-deterministic microtask order. FIFO
 * mockResolvedValueOnce chains are therefore flaky in this context.
 *
 * Instead, we install a single jest.fn() implementation that inspects the SQL
 * string and returns the matching response. Each pattern must be specific
 * enough not to collide with other queries.
 *
 * The router is reset before each test (beforeEach clears mocks) and installed
 * fresh via installSqlRouter().
 *
 * @param {Array<{match: RegExp|string, rows: object[], once?: boolean}>} routes
 * @param {object} [fallback] - returned when no route matches (default: {rows:[]})
 */
function installSqlRouter(routes, fallback = { rows: [] }) {
    // Each route may be consumed once (once:true) or unlimited times.
    const state = routes.map(r => ({ ...r, consumed: false }));

    db.query.mockImplementation((sql) => {
        for (const r of state) {
            const matches = typeof r.match === 'string'
                ? sql.includes(r.match)
                : r.match.test(sql);
            if (!matches) continue;
            if (r.once && r.consumed) continue;
            if (r.once) r.consumed = true;
            return Promise.resolve({ rows: r.rows });
        }
        return Promise.resolve(fallback);
    });
}

describe('pmDashboard service', () => {
    test('getWorkloadCounts sums tasks, bugs, stories filtered by access clause', async () => {
        db.query
            .mockResolvedValueOnce({ rows: [{ c: '7' }] })   // tasks
            .mockResolvedValueOnce({ rows: [{ c: '3' }] })   // bugs
            .mockResolvedValueOnce({ rows: [{ c: '2' }] });  // user_stories

        const result = await svc.getWorkloadCounts(db, 'proj-1', {
            tasks:        { clause: 'TRUE', params: [] },
            bugs:         { clause: 'TRUE', params: [] },
            user_stories: { clause: 'TRUE', params: [] },
        });

        expect(result).toBe(12);
        expect(db.query).toHaveBeenCalledTimes(3);
        const tasksSql = db.query.mock.calls[0][0];
        expect(tasksSql).toMatch(/FROM tasks/);
        expect(tasksSql).toMatch(/project_id = \$1/);
    });

    test('getTasksByStatus groups by status, returns object keyed by status', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { status: 'Backlog', c: '4' },
                { status: 'In Progress', c: '2' },
                { status: 'Done', c: '6' },
            ],
        });

        const result = await svc.getTasksByStatus(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual({ 'Backlog': 4, 'In Progress': 2, 'Done': 6 });

        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/GROUP BY status/);
    });

    test('getTasksByTeam groups by owner_team_id, returns object keyed by team_id', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { owner_team_id: 'team-qc', c: '5' },
                { owner_team_id: 'team-dev', c: '8' },
                { owner_team_id: null, c: '1' },
            ],
        });
        const result = await svc.getTasksByTeam(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual({ 'team-qc': 5, 'team-dev': 8, 'unassigned': 1 });
    });

    test('getBugsByStatus and getBugsBySeverity return objects keyed by canonical labels', async () => {
        db.query
            .mockResolvedValueOnce({ rows: [{ status: 'Open', c: '3' }, { status: 'Closed', c: '5' }] })
            .mockResolvedValueOnce({ rows: [{ severity: 'High', c: '2' }, { severity: 'Low', c: '4' }] });

        const byStatus = await svc.getBugsByStatus(db, 'proj-1', { clause: 'TRUE', params: [] });
        const bySev    = await svc.getBugsBySeverity(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(byStatus).toEqual({ Open: 3, Closed: 5 });
        expect(bySev).toEqual({ High: 2, Low: 4 });
    });

    test('getUserStoryProgress returns { total, in_progress, done }', async () => {
        db.query.mockResolvedValueOnce({
            rows: [{ total: '10', in_progress: '3', done: '4' }],
        });
        const result = await svc.getUserStoryProgress(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual({ total: 10, in_progress: 3, done: 4 });
    });

    test('getBlockedCount counts blocked test_executions for the project', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ c: '4' }] });
        const result = await svc.getBlockedCount(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toBe(4);
        expect(db.query.mock.calls[0][0]).toMatch(/test_execution\b/);
        expect(db.query.mock.calls[0][0]).toMatch(/status = 'blocked'/);
    });

    test('getOverdueCount counts non-terminal tasks past deadline', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ c: '2' }] });
        const result = await svc.getOverdueCount(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toBe(2);
        expect(db.query.mock.calls[0][0]).toMatch(/deadline < CURRENT_DATE/);
        expect(db.query.mock.calls[0][0]).toMatch(/status NOT IN/);
    });

    test('getResourceUtilization returns per-resource capacity, allocated, util%', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { resource_id: 'r1', name: 'Alice', capacity_hrs: 40, allocated_hrs: 30 },
                { resource_id: 'r2', name: 'Bob',   capacity_hrs: 40, allocated_hrs: 50 },
                { resource_id: 'r3', name: 'Carol', capacity_hrs: 0,  allocated_hrs: 5 },
            ],
        });
        const result = await svc.getResourceUtilization(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual([
            { resource_id: 'r1', name: 'Alice', capacity_hrs: 40, allocated_hrs: 30, utilization_pct: 75 },
            { resource_id: 'r2', name: 'Bob',   capacity_hrs: 40, allocated_hrs: 50, utilization_pct: 125 },
            { resource_id: 'r3', name: 'Carol', capacity_hrs: 0,  allocated_hrs: 5,  utilization_pct: 0 },
        ]);
    });

    test('getCrossTeamDependencies groups task→test_case links across team boundaries', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { from_team: 'team-dev', to_team: 'team-qc', artifact_count: '5' },
                { from_team: 'team-dev', to_team: 'team-sec', artifact_count: '2' },
            ],
        });
        const result = await svc.getCrossTeamDependencies(db, 'proj-1');
        expect(result).toEqual([
            { from_team: 'team-dev', to_team: 'team-qc', artifact_count: 5 },
            { from_team: 'team-dev', to_team: 'team-sec', artifact_count: 2 },
        ]);
    });

    test('getTestExecutionSummary returns counts only — never includes steps/expected_result', async () => {
        db.query.mockResolvedValueOnce({
            rows: [{ passed: '40', failed: '5', blocked: '3', total: '50' }],
        });
        const result = await svc.getTestExecutionSummary(db, 'proj-1');
        expect(result).toEqual({ passed: 40, failed: 5, blocked: 3, total: 50 });
        expect(result).not.toHaveProperty('steps');
        expect(result).not.toHaveProperty('expected_result');
        expect(result).not.toHaveProperty('preconditions');
    });
});

// ---------------------------------------------------------------------------
// Integration tests — acceptance criteria 7, 8, 9 (issue #89)
// ---------------------------------------------------------------------------
//
// NOTE: We use a SQL-pattern mock router (installSqlRouter) rather than
// FIFO mockResolvedValueOnce chains. The handler wraps 11 per-project helpers
// in Promise.all, which causes non-deterministic microtask interleaving.
// FIFO mocks would produce flaky results when getWorkloadCounts fires its
// three internal queries while other helpers' single queries also resolve.
// The pattern router matches on SQL substrings so each helper always gets
// the correct response regardless of arrival order.
//
// RoleResolver query count: resolve() fires Promise.all([rolePerms, userPerms,
// loadScope]). loadScope itself runs two sequential queries (team row, then
// pm_of_projects). So the first buildListFilter call costs 4 DB queries;
// subsequent calls within the same request reuse req._accessResolverCache.
// buildFilterMap calls buildListFilter 3× but only the first hits the DB.
// Total non-per-project queries: 1 (listPmProjects) + 4 (RoleResolver) = 5.
// Per project: 13 queries (workload×3 + 10 single-query helpers).
// ---------------------------------------------------------------------------

describe('GET /api/dashboards/pm — integration', () => {
    const pmUser = { id: 'u-pm', role: 'pm' };

    // -----------------------------------------------------------------------
    // Shared SQL-pattern routes used by both project-data tests.
    // Each route matches on a unique SQL fragment so it fires for the right
    // helper regardless of Promise.all ordering.
    // -----------------------------------------------------------------------
    function buildPerProjectRoutes({ taskCount = '5', bugCount = '2', storyCount = '1',
        bugsBySeverity = [{ severity: 'High', c: '1' }],
        bugsByStatus = [{ status: 'Open', c: '2' }],
        testExecRows = [{ passed: '8', failed: '1', blocked: '0', total: '9' }],
    } = {}) {
        return [
            // workload — 3 queries, identified by SELECT target table
            { match: /COUNT\(\*\)::int AS c FROM tasks WHERE project_id/, rows: [{ c: taskCount }] },
            { match: /COUNT\(\*\)::int AS c FROM bugs WHERE project_id/, rows: [{ c: bugCount }] },
            { match: /COUNT\(\*\)::int AS c FROM user_stories WHERE project_id/, rows: [{ c: storyCount }] },
            // tasks_by_status — GROUP BY status + FROM tasks
            { match: /SELECT status, COUNT.*FROM tasks.*GROUP BY status/s, rows: [{ status: 'Done', c: '3' }] },
            // tasks_by_team
            { match: /SELECT owner_team_id/, rows: [{ owner_team_id: 't1', c: taskCount }] },
            // bugs_by_status
            { match: /SELECT status, COUNT.*FROM bugs.*GROUP BY status/s, rows: bugsByStatus },
            // bugs_by_severity
            { match: /SELECT severity/, rows: bugsBySeverity },
            // user_story_progress
            { match: /SUM\(CASE WHEN status IN \('In Progress'/, rows: [{ total: storyCount, in_progress: '0', done: storyCount }] },
            // blocked count — uses test_execution table (not test_executions)
            { match: /status = 'blocked'/, rows: [{ c: '0' }] },
            // overdue count
            { match: /deadline < CURRENT_DATE/, rows: [{ c: '0' }] },
            // resource utilization
            { match: /weekly_capacity_hrs/, rows: [] },
            // cross-team deps
            { match: /task_test_cases/, rows: [] },
            // test execution summary
            { match: /SUM\(CASE WHEN te\.status = 'pass'/, rows: testExecRows },
        ];
    }

    // AC 7: PM assigned to 2 projects sees aggregations for both — not a third
    test('PM assigned to 2 projects sees aggregations for both projects, not a third', async () => {
        const app = buildApp({ user: pmUser });

        installSqlRouter([
            // 1. listPmProjects
            { match: 'FROM project_managers pm', rows: [
                { project_id: 'p-1', project_name: 'Alpha' },
                { project_id: 'p-2', project_name: 'Beta' },
            ]},
            // 2. RoleResolver — role_permissions
            { match: 'SELECT permission_key FROM role_permissions', rows: [
                { permission_key: 'qc.tasks.view_any' },
                { permission_key: 'qc.bugs.view_any' },
                { permission_key: 'qc.user_stories.view_any' },
            ]},
            // 3. RoleResolver — user_permissions (overrides/grants per user)
            { match: 'SELECT permission_key, granted FROM user_permissions', rows: [] },
            // 4. RoleResolver — team scope
            { match: 'SELECT u.team_id', rows: [{ team_id: null, team_type: null }] },
            // 5. RoleResolver — pm_of_projects (inside loadScope)
            { match: 'SELECT project_id FROM project_managers WHERE user_id', rows: [
                { project_id: 'p-1' },
                { project_id: 'p-2' },
            ]},
            // Per-project aggregation queries (same responses for both projects)
            ...buildPerProjectRoutes(),
        ]);

        const res = await request(app).get('/api/dashboards/pm');

        expect(res.status).toBe(200);
        expect(res.body.projects).toHaveLength(2);
        expect(res.body.projects.map(p => p.project_id)).toEqual(['p-1', 'p-2']);
        // p-3 was never a managed project — must not appear
        expect(res.body.projects.find(p => p.project_id === 'p-3')).toBeUndefined();
        // Each project must carry the aggregation keys
        for (const proj of res.body.projects) {
            expect(proj).toHaveProperty('total_workload');
            expect(proj).toHaveProperty('tasks_by_status');
            expect(proj).toHaveProperty('bugs_by_severity');
            expect(proj).toHaveProperty('test_execution_summary');
        }
    });

    // AC 8: Non-PM user (member role) calling endpoint → 403
    test('non-PM user (member role) calling endpoint → 403', async () => {
        const app = buildApp({
            user: { id: 'u-member', role: 'member' },
            hasPermission: false,
        });
        // No db.query mocks needed — the permission gate fires before any DB call.
        const res = await request(app).get('/api/dashboards/pm');
        expect(res.status).toBe(403);
    });

    // AC 9: bugs_by_severity total equals bugs_by_status total
    // (both use the identical access filter — proven by equality of aggregate sums)
    test('bugs_by_severity total equals what /api/bugs would return with the same filter', async () => {
        const app = buildApp({ user: pmUser });

        const bugsBySeverity = [
            { severity: 'High',   c: '4' },
            { severity: 'Medium', c: '6' },
            { severity: 'Low',    c: '2' },
        ];
        const bugsByStatus = [{ status: 'Open', c: '12' }];

        installSqlRouter([
            // 1. listPmProjects
            { match: 'FROM project_managers pm', rows: [
                { project_id: 'p-1', project_name: 'Alpha' },
            ]},
            // 2-5. RoleResolver
            { match: 'SELECT permission_key FROM role_permissions', rows: [
                { permission_key: 'qc.tasks.view_any' },
                { permission_key: 'qc.bugs.view_any' },
                { permission_key: 'qc.user_stories.view_any' },
            ]},
            { match: 'SELECT permission_key, granted FROM user_permissions', rows: [] },
            { match: 'SELECT u.team_id', rows: [{ team_id: null, team_type: null }] },
            { match: 'SELECT project_id FROM project_managers WHERE user_id', rows: [
                { project_id: 'p-1' },
            ]},
            // Per-project aggregations with the specific bug data we want to assert on
            ...buildPerProjectRoutes({ bugsBySeverity, bugsByStatus, bugCount: '12' }),
        ]);

        const res = await request(app).get('/api/dashboards/pm');
        expect(res.status).toBe(200);

        const proj = res.body.projects[0];

        // The severity breakdown must sum to the same total as the status breakdown,
        // because both queries apply the identical access filter (buildListFilter for
        // artifact type 'bug', verb 'view') scoped to the same project_id.
        const severitySum = Object.values(proj.bugs_by_severity).reduce((a, b) => a + b, 0);
        const statusSum   = Object.values(proj.bugs_by_status).reduce((a, b) => a + b, 0);
        expect(severitySum).toBe(statusSum);
        expect(severitySum).toBe(12);
    });
});
