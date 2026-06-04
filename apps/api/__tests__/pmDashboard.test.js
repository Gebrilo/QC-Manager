'use strict';

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
}));

const db = require('../src/config/db');

let svc;
beforeAll(() => {
    svc = require('../src/services/dashboards/pmDashboard');
});

beforeEach(() => {
    jest.clearAllMocks();
});

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
