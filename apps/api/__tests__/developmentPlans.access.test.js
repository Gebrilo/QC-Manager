'use strict';

/**
 * Issue #266 — Development Plans / IDP domain role-gate cutover.
 *
 * The 18 dev-plans routes previously used requireRole('admin','team_manager').
 * They now use requirePermission('qc.dev_plans.manage'). This test pins the
 * per-role reachability of that gate: admin + team_manager are admitted, every
 * other role is denied — identical to the old role-list decision (verified by
 * the truth-table harness in rbacTruthTable.test.js).
 */

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const { PERMISSIONS, ROLES } = require('../../shared/rbac/catalog.ts');
const { requirePermission } = require('../src/middleware/authMiddleware');

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

async function gateDecision(role, key) {
    const req = { user: { id: `${role}-1`, role } };
    const res = makeRes();
    const next = jest.fn();
    mockQuery.mockResolvedValue({ rows: [] });
    await requirePermission(key)(req, res, next);
    return next.mock.calls.length === 1 && next.mock.calls[0].length === 0;
}

afterEach(() => jest.clearAllMocks());
beforeEach(() => { delete process.env.RBAC_UNIFIED; });

describe('Dev Plans / IDP gate — requirePermission(qc.dev_plans.manage) per role (#266)', () => {
    const KEY = PERMISSIONS.DEV_PLANS_MANAGE;

    test.each(Object.keys(ROLES))('%s reachability matches the old admin|team_manager role gate', async (role) => {
        const admitted = await gateDecision(role, KEY);
        const oldRoleGateAllowed = ['admin', 'team_manager'].includes(role);
        expect(admitted).toBe(oldRoleGateAllowed);
    });

    test('the gate key is seeded onto team_manager (catalog definition)', () => {
        const { collectRolePermissions } = require('../../shared/rbac/catalog.ts');
        const tmPerms = collectRolePermissions('team_manager', new Set());
        expect(tmPerms).toContain(KEY);
    });
});
