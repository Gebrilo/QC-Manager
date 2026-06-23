'use strict';

/**
 * Issue #262 — RBAC_UNIFIED kill-switch.
 *
 * Verifies the two authorization paths the flag selects:
 *   OFF (default) → legacy catalog path (`canUserPerform` + per-key user_permissions overrides).
 *   ON            → Access Engine RoleResolver resolves the effective set once per request
 *                   (cached) and the pure `hasPermission` membership test is applied, with
 *                   the admin `*` wildcard matching any key (a not-yet-seeded key never 403s
 *                   admin).
 */

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { requirePermission, requireAnyPermission } = require('../src/middleware/authMiddleware');

function rows(value) { return { rows: value }; }
function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

async function runMiddleware(middleware, user, reqExtra = {}) {
    const req = { user: { id: `${user.role}-1`, ...user }, ...reqExtra };
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    return { req, res, next };
}

const PREV_RBAC = process.env.RBAC_UNIFIED;
afterEach(() => {
    jest.clearAllMocks();
    if (PREV_RBAC === undefined) delete process.env.RBAC_UNIFIED;
    else process.env.RBAC_UNIFIED = PREV_RBAC;
});

describe('RBAC_UNIFIED flag (issue #262)', () => {
    describe('flag OFF — legacy catalog path is unchanged', () => {
        beforeEach(() => { delete process.env.RBAC_UNIFIED; });

        test('tester is allowed a catalog-granted permission', async () => {
            mockQuery.mockResolvedValue(rows([])); // no per-user overrides
            const { res, next } = await runMiddleware(
                requirePermission('qc.tasks.view'),
                { role: 'tester' }
            );
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('tester is denied a permission the catalog does not grant', async () => {
            mockQuery.mockResolvedValue(rows([]));
            const { res, next } = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'tester' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('admin is allowed any known key', async () => {
            mockQuery.mockResolvedValue(rows([])); // admin short-circuits overrides
            const { res, next } = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'admin' }
            );
            expect(next).toHaveBeenCalledWith();
        });

        test('per-user grant override allows a role-denied permission', async () => {
            mockQuery.mockResolvedValue(rows([
                { permission_key: 'qc.governance.manage_gates', granted: true },
            ]));
            const { res, next } = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'tester' }
            );
            expect(next).toHaveBeenCalledWith();
        });
    });

    describe('flag ON — unified resolver path', () => {
        beforeEach(() => { process.env.RBAC_UNIFIED = 'on'; });

        // RoleResolver.resolve issues six queries in this order:
        //   1. role_permissions  2. user_permissions  3. role_scopes  4. user_scopes
        //   5. team join  6. project_managers
        function mockResolveSequence(rolePerms, userPerms = []) {
            mockQuery
                .mockResolvedValueOnce(rows(rolePerms.map(permission_key => ({ permission_key }))))
                .mockResolvedValueOnce(rows(userPerms))
                .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
                .mockResolvedValueOnce(rows([]));
        }

        test('tester is allowed when the key is in role_permissions', async () => {
            mockResolveSequence(['qc.tasks.view']);
            const { res, next } = await runMiddleware(
                requirePermission('qc.tasks.view'),
                { role: 'tester' }
            );
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('tester is denied when the key is absent from the effective set', async () => {
            mockResolveSequence(['qc.tasks.view']);
            const { res, next } = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'tester' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('admin `*` wildcard matches a not-yet-seeded (unknown) key', async () => {
            // Empty role_permissions → resolver falls back to admin catalog default ['*'].
            mockResolveSequence([]);
            const { res, next } = await runMiddleware(
                requirePermission('qc.brand.new.unseeded'),
                { role: 'admin' }
            );
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('per-user elevation (granted=true) adds a key not in the role set', async () => {
            mockResolveSequence(
                ['qc.tasks.view'],
                [{ permission_key: 'qc.governance.manage_gates', granted: true }]
            );
            const { res, next } = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'tester' }
            );
            expect(next).toHaveBeenCalledWith();
        });

        test('per-user restriction (granted=false) strips a key present in the role set', async () => {
            mockResolveSequence(
                ['qc.tasks.view'],
                [{ permission_key: 'qc.tasks.view', granted: false }]
            );
            const { res, next } = await runMiddleware(
                requirePermission('qc.tasks.view'),
                { role: 'tester' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('requireAnyPermission allows when any candidate key is in the effective set', async () => {
            mockResolveSequence(['qc.tasks.view']);
            const { res, next } = await runMiddleware(
                requireAnyPermission('qc.governance.manage_gates', 'qc.tasks.view'),
                { role: 'tester' }
            );
            expect(next).toHaveBeenCalledWith();
        });

        test('requireAnyPermission denies when no candidate key is in the effective set', async () => {
            mockResolveSequence(['qc.tasks.view']);
            const { res, next } = await runMiddleware(
                requireAnyPermission('qc.governance.manage_gates', 'qc.admin.users.view'),
                { role: 'tester' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('effective set is resolved once per request (cached on req)', async () => {
            // Six queries per resolve; we only mock one resolve's worth.
            mockResolveSequence(['qc.tasks.view']);
            const req = { user: { id: 'tester-1', role: 'tester' } };
            const res = makeRes();
            const mw = requirePermission('qc.tasks.view');
            await mw(req, res, jest.fn());
            // Second invocation on the SAME req must hit the cache (no extra queries).
            const res2 = makeRes();
            await mw(req, res2, jest.fn());
            expect(mockQuery).toHaveBeenCalledTimes(6); // not 12
        });
    });

    describe('flag toggling is live (no module re-require)', () => {
        test('same middleware honors OFF then ON sequentially', async () => {
            // OFF: tester denied governance via catalog.
            delete process.env.RBAC_UNIFIED;
            mockQuery.mockReset();
            mockQuery.mockResolvedValue(rows([])); // legacy overrides empty
            const off = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'tester' }
            );
            expect(off.next).not.toHaveBeenCalled();

            // ON: tester still denied (key absent from role_permissions).
            process.env.RBAC_UNIFIED = 'on';
            mockQuery.mockReset();
            mockQuery
                .mockResolvedValueOnce(rows([{ permission_key: 'qc.tasks.view' }]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
                .mockResolvedValueOnce(rows([]));
            const on = await runMiddleware(
                requirePermission('qc.governance.manage_gates'),
                { role: 'tester' }
            );
            expect(on.next).not.toHaveBeenCalled();
        });
    });
});
