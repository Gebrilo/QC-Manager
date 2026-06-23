'use strict';

/**
 * Issue #265 — Journeys domain role-gate cutover.
 *
 * The 14 journeys CRUD routes previously used requireRole('admin','team_manager').
 * They now use requirePermission('qc.journeys.manage'). This test pins the
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
    // catalog path (RBAC_UNIFIED off): admin short-circuits overrides; others
    // load per-user overrides (mocked empty).
    mockQuery.mockResolvedValue({ rows: [] });
    await requirePermission(key)(req, res, next);
    return next.mock.calls.length === 1 && next.mock.calls[0].length === 0;
}

afterEach(() => jest.clearAllMocks());
beforeEach(() => { delete process.env.RBAC_UNIFIED; });

describe('Journeys gate — requirePermission(qc.journeys.manage) per role (#265)', () => {
    const KEY = PERMISSIONS.JOURNEYS_MANAGE;

    test.each(Object.keys(ROLES))('%s reachability matches the old admin|team_manager role gate', async (role) => {
        const admitted = await gateDecision(role, KEY);
        const oldRoleGateAllowed = ['admin', 'team_manager'].includes(role);
        expect(admitted).toBe(oldRoleGateAllowed);
    });

    test('the gate key is seeded onto team_manager (catalog definition)', () => {
        // Sanity: the catalog grants the key to team_manager so the bootstrap
        // seed (#263) + Migration 045 land it on the role.
        const { collectRolePermissions } = require('../../shared/rbac/catalog.ts');
        const tmPerms = collectRolePermissions('team_manager', new Set());
        expect(tmPerms).toContain(KEY);
    });
});
