// Regression: GET /resources/:id/analytics was gated with
// requireRole('admin','team_manager'), a hardcoded role check that 403'd the
// `pm` role even though PMs are meant to view resource dashboards. The gate is
// now requirePermission('qc.team.view') — held by exactly admin/team_manager/pm
// in the RBAC catalog. This test exercises the REAL middleware (no auth mock).

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }), // no per-user overrides
}));

const { requirePermission, requireRole } = require('../src/middleware/authMiddleware');

// Drive a middleware to its terminal outcome and report the HTTP status it took.
function run(middleware, user) {
    return new Promise((resolve, reject) => {
        const req = { user };
        const res = { status: (code) => ({ json: () => resolve(code) }) };
        const next = (err) => (err ? reject(err) : resolve(200));
        Promise.resolve(middleware(req, res, next)).catch(reject);
    });
}

describe('GET /resources/:id/analytics gate — requirePermission(qc.team.view)', () => {
    const gate = requirePermission('qc.team.view');

    test.each(['admin', 'team_manager', 'pm'])('%s is allowed through', async (role) => {
        await expect(run(gate, { id: 'u1', role })).resolves.toBe(200);
    });

    test.each(['tester', 'viewer', 'contributor'])('%s is denied with 403', async (role) => {
        await expect(run(gate, { id: 'u1', role })).resolves.toBe(403);
    });

    test('regression: the old requireRole(admin, team_manager) gate 403d pm', async () => {
        const oldGate = requireRole('admin', 'team_manager');
        await expect(run(oldGate, { id: 'u1', role: 'pm' })).resolves.toBe(403);
    });
});
