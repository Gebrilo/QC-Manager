jest.mock('../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../src/config/db');

let handler;
beforeAll(() => {
  handler = require('../src/routes/me').testExports.dashboardHandler;
});

beforeEach(() => {
  jest.clearAllMocks();
});

function makeReq(userId = 'user-123') {
  return { user: { id: userId } };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('GET /me/dashboard', () => {
  test('returns 404 when no resource linked to user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No resource linked to your account',
    });
  });

  test('returns dashboard with zero totals when user has no tasks or bugs', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: { resource_id: 'res-abc', resource_name: 'Alice', department: 'QA' },
        summary: { total_tasks: 0, total_projects: 0, hours_variance: 0 },
        task_distribution: {},
        tasks_by_project: [],
        submitted_bugs: [],
      })
    );
  });

  test('computes hours_variance as SUM(actual) - SUM(estimate)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [
        { status: 'In Progress', project_id: 'p1', project_name: 'Alpha', estimate_hrs: 10, actual_hrs: 12 },
        { status: 'Done',        project_id: 'p1', project_name: 'Alpha', estimate_hrs: 5,  actual_hrs: 3  },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.summary.hours_variance).toBe(0);
    expect(body.summary.total_tasks).toBe(2);
    expect(body.summary.total_projects).toBe(1);
  });

  test('aggregates task_distribution by status', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [
        { status: 'Backlog',     project_id: 'p1', project_name: 'A', estimate_hrs: 2, actual_hrs: 0 },
        { status: 'Backlog',     project_id: 'p2', project_name: 'B', estimate_hrs: 2, actual_hrs: 0 },
        { status: 'In Progress', project_id: 'p1', project_name: 'A', estimate_hrs: 4, actual_hrs: 5 },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.task_distribution).toEqual({ Backlog: 2, 'In Progress': 1 });
  });

  test('aggregates tasks_by_project correctly', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [
        { status: 'Done',        project_id: 'p1', project_name: 'Alpha', estimate_hrs: 2, actual_hrs: 2 },
        { status: 'In Progress', project_id: 'p1', project_name: 'Alpha', estimate_hrs: 3, actual_hrs: 1 },
        { status: 'Backlog',     project_id: 'p2', project_name: 'Beta',  estimate_hrs: 1, actual_hrs: 0 },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.tasks_by_project).toEqual(
      expect.arrayContaining([
        { project_id: 'p1', project_name: 'Alpha', total: 2, done: 1, in_progress: 1, backlog: 0 },
        { project_id: 'p2', project_name: 'Beta',  total: 1, done: 0, in_progress: 0, backlog: 1 },
      ])
    );
  });

  test('includes submitted_bugs in response', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { id: 'bug-1', bug_id: 'TLP-99', title: 'Crash on login', status: 'Open',
          severity: 'high', project_name: 'Alpha', creation_date: '2026-04-01' },
      ]});

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.submitted_bugs).toHaveLength(1);
    expect(body.submitted_bugs[0].bug_id).toBe('TLP-99');
  });
});
