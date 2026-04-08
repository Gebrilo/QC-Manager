/**
 * Tests: T_ANA01–T_ANA03
 * Verifies GET /resources/:id/analytics returns task_summary and bugs.
 */

const mockDbQuery = jest.fn();

jest.mock('../src/config/db', () => ({ query: mockDbQuery }));
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => next(),
    requireRole: (...roles) => (req, res, next) => next(),
    requirePermission: (perm) => (req, res, next) => next(),
}));
jest.mock('../src/utils/workingDays', () => ({
    computeTaskTimeline: (task) => ({
        start_variance: null,
        completion_variance: null,
        execution_variance: null,
        health_status: null,
    }),
}));
jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn() }));
jest.mock('../src/utils/n8n', () => ({ triggerWorkflow: jest.fn() }));
jest.mock('../src/schemas/resource', () => ({
    createResourceSchema: { parse: (d) => d },
    updateResourceSchema: { parse: (d) => d },
}));

const resourcesRouter = require('../src/routes/resources');

const RESOURCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const PROFILE_ROW = {
    id: RESOURCE_ID,
    resource_name: 'Alice',
    email: 'alice@example.com',
    department: 'QA',
    role: 'Test Engineer',
    is_active: true,
    user_id: null,
    weekly_capacity_hrs: 40,
    current_allocation_hrs: 16,
    utilization_pct: 40,
    active_tasks_count: 2,
    backlog_tasks_count: 1,
};

const TASKS_ROWS = [
    {
        id: 'task-uuid-1', task_id: 'TSK-001', task_name: 'Write tests',
        status: 'In Progress', priority: 'high', project_name: 'Project A',
        estimate_hrs: 8, actual_hrs: 4, assignment_role: 'Primary',
        expected_start_date: null, actual_start_date: null,
        completed_date: null, deadline: null, estimate_days: null,
    },
    {
        id: 'task-uuid-2', task_id: 'TSK-002', task_name: 'Review spec',
        status: 'Backlog', priority: 'medium', project_name: 'Project A',
        estimate_hrs: 4, actual_hrs: 0, assignment_role: 'Secondary',
        expected_start_date: null, actual_start_date: null,
        completed_date: null, deadline: null, estimate_days: null,
    },
    {
        id: 'task-uuid-3', task_id: 'TSK-003', task_name: 'Deploy',
        status: 'Done', priority: 'high', project_name: 'Project B',
        estimate_hrs: 4, actual_hrs: 5, assignment_role: 'Primary',
        expected_start_date: null, actual_start_date: null,
        completed_date: null, deadline: null, estimate_days: null,
    },
];

const BUGS_ROWS = [
    {
        id: 'bug-uuid-1', bug_id: 'TLP-100', title: 'Login crash',
        source: 'EXPLORATORY', status: 'Open', severity: 'high',
        project_name: 'Project A', creation_date: '2026-03-15T10:00:00Z',
    },
    {
        id: 'bug-uuid-2', bug_id: 'TLP-101', title: 'Data mismatch',
        source: 'TEST_CASE', status: 'Closed', severity: 'medium',
        project_name: 'Project B', creation_date: '2026-03-20T09:00:00Z',
    },
];

function setupMocks() {
    mockDbQuery
        .mockResolvedValueOnce({ rows: [PROFILE_ROW] })          // v_resources_with_utilization
        .mockResolvedValueOnce({ rows: [{ current_week_actual_hrs: '6.0' }] }) // week actuals
        .mockResolvedValueOnce({ rows: [{ backlog_hrs: '12.0' }] })            // backlog
        .mockResolvedValueOnce({ rows: TASKS_ROWS })             // tasks list
        .mockResolvedValueOnce({ rows: BUGS_ROWS });             // bugs owned by resource
}

function getAnalyticsRoute() {
    const layer = resourcesRouter.stack.find(
        l => l.route && l.route.path === '/:id/analytics' && l.route.methods.get
    );
    expect(layer).toBeDefined();
    // Stack: [requireAuth, requireRole, handler]
    return layer.route.stack[layer.route.stack.length - 1].handle;
}

beforeEach(() => {
    mockDbQuery.mockReset();
});

describe('GET /resources/:id/analytics — enhanced response', () => {

    test('T_ANA01: returns task_summary with correct by_status counts', async () => {
        setupMocks();

        const mockReq = { params: { id: RESOURCE_ID } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };
        const mockNext = jest.fn();

        await getAnalyticsRoute()(mockReq, mockRes, mockNext);

        if (mockNext.mock.calls.length > 0) {
            const err = mockNext.mock.calls[0][0];
            if (err) throw err;
        }

        expect(mockRes.json).toHaveBeenCalled();
        const body = mockRes.json.mock.calls[0][0];
        expect(body.task_summary).toBeDefined();
        expect(body.task_summary.total).toBe(3);
        expect(body.task_summary.by_status['In Progress']).toBe(1);
        expect(body.task_summary.by_status['Backlog']).toBe(1);
        expect(body.task_summary.by_status['Done']).toBe(1);
    });

    test('T_ANA02: returns task_summary with by_priority and by_project', async () => {
        setupMocks();

        const mockReq = { params: { id: RESOURCE_ID } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };
        const mockNext = jest.fn();

        await getAnalyticsRoute()(mockReq, mockRes, mockNext);

        if (mockNext.mock.calls.length > 0) {
            const err = mockNext.mock.calls[0][0];
            if (err) throw err;
        }

        expect(mockRes.json).toHaveBeenCalled();
        const body = mockRes.json.mock.calls[0][0];
        expect(body.task_summary.by_priority['high']).toBe(2);
        expect(body.task_summary.by_priority['medium']).toBe(1);
        expect(body.task_summary.by_project['Project A']).toBe(2);
        expect(body.task_summary.by_project['Project B']).toBe(1);
    });

    test('T_ANA03: returns bugs owned by resource with id, bug_id, title, source, status, severity, project_name, creation_date', async () => {
        setupMocks();

        const mockReq = { params: { id: RESOURCE_ID } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };
        const mockNext = jest.fn();

        await getAnalyticsRoute()(mockReq, mockRes, mockNext);

        if (mockNext.mock.calls.length > 0) {
            const err = mockNext.mock.calls[0][0];
            if (err) throw err;
        }

        expect(mockRes.json).toHaveBeenCalled();
        const body = mockRes.json.mock.calls[0][0];
        expect(Array.isArray(body.bugs)).toBe(true);
        expect(body.bugs).toHaveLength(2);

        const bug = body.bugs[0];
        expect(bug.id).toBe('bug-uuid-1');
        expect(bug.bug_id).toBe('TLP-100');
        expect(bug.title).toBe('Login crash');
        expect(bug.source).toBe('EXPLORATORY');
        expect(bug.status).toBe('Open');
        expect(bug.severity).toBe('high');
        expect(bug.project_name).toBe('Project A');
        expect(bug.creation_date).toBeDefined();
    });
});
