'use strict';

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
}));

jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn() }));
jest.mock('../src/utils/n8n', () => ({ triggerWorkflow: jest.fn() }));
jest.mock('../src/services/emitters/task', () => ({ emitToTuleap: jest.fn() }));

const db = require('../src/config/db');
const express = require('express');
const request = require('supertest');

beforeEach(() => {
    jest.clearAllMocks();
});

function buildDashboardApp({ user, hasPermission = true }) {
    jest.resetModules();
    jest.doMock('../src/config/db', () => db);
    jest.doMock('../src/middleware/authMiddleware', () => ({
        requireAuth: (req, _res, next) => { req.user = user; next(); },
        blockContributors: (_req, _res, next) => next(),
        requirePermission: () => (_req, res, next) =>
            hasPermission ? next() : res.status(403).json({ error: 'forbidden' }),
    }));
    const app = express();
    app.use(express.json());
    app.use('/api/dashboards', require('../src/routes/dashboards'));
    return app;
}

function buildTasksApp({ user, hasPermission = true }) {
    jest.resetModules();
    jest.doMock('../src/config/db', () => db);
    jest.doMock('../src/middleware/authMiddleware', () => ({
        requireAuth: (req, _res, next) => { req.user = user; next(); },
        blockContributors: (_req, _res, next) => next(),
        requirePermission: () => (_req, res, next) =>
            hasPermission ? next() : res.status(403).json({ error: 'forbidden' }),
        optionalAuth: (_req, _res, next) => next(),
    }));
    const app = express();
    app.use(express.json());
    app.use('/api/tasks', require('../src/routes/tasks'));
    return app;
}

function installSqlRouter(routes, fallback = { rows: [] }) {
    db.query.mockImplementation((sql, params = []) => {
        for (const route of routes) {
            const matches = typeof route.match === 'string'
                ? sql.includes(route.match)
                : route.match.test(sql);
            if (!matches) continue;
            return Promise.resolve(typeof route.rows === 'function' ? { rows: route.rows(sql, params) } : { rows: route.rows });
        }
        return Promise.resolve(fallback);
    });
}

function roleRoutes({ teamId, teamType = 'qc', permissions }) {
    return [
        { match: 'SELECT permission_key FROM role_permissions', rows: permissions.map(permission_key => ({ permission_key })) },
        { match: 'SELECT permission_key, granted FROM user_permissions', rows: [] },
        { match: 'SELECT u.team_id', rows: [{ team_id: teamId, team_type: teamType }] },
        { match: 'SELECT project_id FROM project_managers WHERE user_id', rows: [] },
    ];
}

describe('GET /api/dashboards/team-manager', () => {
    const permissions = [
        'qc.dashboards.team_manager.view',
        'qc.tasks.view_team',
        'qc.tasks.edit_team',
        'qc.tasks.take_over',
        'qc.bugs.view_team',
    ];

    test('QC team manager sees QC team rows only', async () => {
        const app = buildDashboardApp({ user: { id: 'tm-qc', role: 'team_manager' } });
        installSqlRouter([
            ...roleRoutes({ teamId: 'team-qc', teamType: 'qc', permissions }),
            { match: 'FROM teams t', rows: [{ id: 'team-qc', name: 'QC', team_type: 'qc' }] },
            { match: /SELECT COUNT\(\*\)::int AS c FROM tasks t/, rows: (_sql, params) => params.includes('team-qc') ? [{ c: '2' }] : [{ c: '0' }] },
            { match: /SELECT t\.status, COUNT\(\*\)::int AS c FROM tasks t/, rows: [{ status: 'In Progress', c: '2' }] },
            { match: /assignments AS/, rows: [{ user_id: 'u-qc', resource_id: 'r-qc', name: 'QC Member', total: '2' }] },
            { match: /weekly_capacity_hrs/, rows: [{ user_id: 'u-qc', resource_id: 'r-qc', name: 'QC Member', workload_hrs: '12', capacity_hrs: '40', logged_hrs: '5' }] },
            { match: /AND t\.status = 'Blocked'/, rows: [] },
            { match: /deadline IS NOT NULL/, rows: [] },
            { match: /SELECT t\.id, t\.task_id/, rows: [{ id: 'task-qc', task_id: 'TSK-QC', task_name: 'QC Task', status: 'In Progress', project_id: 'p-qc', owner_team_id: 'team-qc', resource1_id: 'r-qc', total_est_hrs: '8', total_actual_hrs: '2' }] },
            { match: /SELECT COUNT\(\*\)::int AS c FROM bugs b/, rows: [{ c: '1' }] },
            { match: /SELECT b\.status, COUNT\(\*\)::int AS c FROM bugs b/, rows: [{ status: 'Open', c: '1' }] },
        ]);

        const res = await request(app).get('/api/dashboards/team-manager');
        expect(res.status).toBe(200);
        expect(res.body.team_id).toBe('team-qc');
        expect(res.body.team_tasks.total).toBe(2);
        expect(res.body.team_tasks.items).toHaveLength(1);
        expect(res.body.team_tasks.items[0].owner_team_id).toBe('team-qc');
        expect(res.body.team_tasks.items.find(task => task.owner_team_id === 'team-dev')).toBeUndefined();
    });

    test('Dev team manager sees Dev team rows only', async () => {
        const app = buildDashboardApp({ user: { id: 'tm-dev', role: 'team_manager' } });
        installSqlRouter([
            ...roleRoutes({ teamId: 'team-dev', teamType: 'dev', permissions }),
            { match: 'FROM teams t', rows: [{ id: 'team-dev', name: 'Dev', team_type: 'dev' }] },
            { match: /SELECT COUNT\(\*\)::int AS c FROM tasks t/, rows: (_sql, params) => params.includes('team-dev') ? [{ c: '1' }] : [{ c: '0' }] },
            { match: /SELECT t\.status, COUNT\(\*\)::int AS c FROM tasks t/, rows: [{ status: 'Backlog', c: '1' }] },
            { match: /assignments AS/, rows: [{ user_id: 'u-dev', resource_id: 'r-dev', name: 'Dev Member', total: '1' }] },
            { match: /weekly_capacity_hrs/, rows: [{ user_id: 'u-dev', resource_id: 'r-dev', name: 'Dev Member', workload_hrs: '6', capacity_hrs: '40', logged_hrs: '1' }] },
            { match: /AND t\.status = 'Blocked'/, rows: [] },
            { match: /deadline IS NOT NULL/, rows: [] },
            { match: /SELECT t\.id, t\.task_id/, rows: [{ id: 'task-dev', task_id: 'TSK-DEV', task_name: 'Dev Task', status: 'Backlog', project_id: 'p-dev', owner_team_id: 'team-dev', resource1_id: 'r-dev', total_est_hrs: '6', total_actual_hrs: '1' }] },
            { match: /SELECT COUNT\(\*\)::int AS c FROM bugs b/, rows: [{ c: '0' }] },
            { match: /SELECT b\.status, COUNT\(\*\)::int AS c FROM bugs b/, rows: [] },
        ]);

        const res = await request(app).get('/api/dashboards/team-manager');
        expect(res.status).toBe(200);
        expect(res.body.team_id).toBe('team-dev');
        expect(res.body.team_tasks.items).toHaveLength(1);
        expect(res.body.team_tasks.items[0].owner_team_id).toBe('team-dev');
        expect(res.body.team_tasks.items.find(task => task.owner_team_id === 'team-qc')).toBeUndefined();
    });
});

describe('GET /api/dashboards/member', () => {
    test('member sees only their assigned work', async () => {
        const app = buildDashboardApp({ user: { id: 'member-1', role: 'member' } });
        installSqlRouter([
            ...roleRoutes({
                teamId: 'team-qc',
                permissions: [
                    'qc.dashboards.member.view',
                    'qc.tasks.view_own',
                    'qc.tasks.edit_own',
                    'qc.bugs.view_own',
                    'qc.user_stories.view_own',
                    'qc.user_stories.view_team',
                ],
            }),
            { match: /SELECT t\.id, t\.task_id/, rows: [{ id: 'task-mine', task_id: 'TSK-ME', task_name: 'Mine', status: 'In Progress', project_id: 'p1', owner_team_id: 'team-qc', resource1_id: 'r-me', total_est_hrs: '4', total_actual_hrs: '1' }] },
            { match: /SELECT COALESCE\(SUM/, rows: [{ hours: '1' }] },
            { match: /SELECT b\.id, b\.bug_id/, rows: [{ id: 'bug-mine', bug_id: 'BUG-ME', title: 'Mine bug', status: 'Open', severity: 'High', owner_team_id: 'team-qc' }] },
            { match: /FROM bug_user_stories/, rows: [] },
            { match: /FROM user_stories us/, rows: [] },
            { match: /FROM artifact_access aa/, rows: [] },
        ]);

        const res = await request(app).get('/api/dashboards/member');
        expect(res.status).toBe(200);
        expect(res.body.my_tasks).toHaveLength(1);
        expect(res.body.my_tasks[0].id).toBe('task-mine');
        expect(res.body.my_tasks.find(task => task.id === 'task-other')).toBeUndefined();
        expect(res.body.my_bugs).toHaveLength(1);
        expect(res.body.my_bugs[0].id).toBe('bug-mine');
    });
});

describe('PATCH /api/tasks/:id task take-over enforcement', () => {
    test('team manager cannot take over a task in another team via direct PATCH', async () => {
        const app = buildTasksApp({ user: { id: 'tm-qc', role: 'team_manager' } });
        installSqlRouter([
            { match: /SELECT \* FROM tasks WHERE id = \$1/, rows: [{
                id: 'task-dev',
                task_id: 'TSK-DEV',
                task_name: 'Dev Task',
                status: 'In Progress',
                project_id: 'p-dev',
                owner_team_id: 'team-dev',
                resource1_id: 'r-dev',
                resource2_id: null,
                visibility_scope: 'team',
            }] },
            ...roleRoutes({
                teamId: 'team-qc',
                permissions: [
                    'qc.dashboards.team_manager.view',
                    'qc.tasks.view_team',
                    'qc.tasks.edit_team',
                    'qc.tasks.take_over',
                ],
            }),
        ]);

        const res = await request(app)
            .patch('/api/tasks/task-dev')
            .send({ resource1_uuid: '00000000-0000-0000-0000-000000000123' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/take over/);
        expect(db.query.mock.calls.find(call => String(call[0]).startsWith('UPDATE tasks SET'))).toBeUndefined();
    });
});
