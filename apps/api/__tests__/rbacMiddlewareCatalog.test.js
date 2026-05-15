'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const {
    ALL_PERMISSION_VALUES,
    ROLES,
    canUserPerform,
} = require('../../shared/rbac/catalog.ts');
const { requirePermission, requireAnyPermission } = require('../src/middleware/authMiddleware');

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

async function runMiddleware(middleware, user) {
    const req = { user: { id: `${user.role}-1`, ...user } };
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    return { res, next };
}

afterEach(() => jest.clearAllMocks());

describe('catalog-backed permission middleware', () => {
    test.each(Object.keys(ROLES).flatMap(role => (
        ALL_PERMISSION_VALUES.map(permission => [role, permission])
    )))('requirePermission matches canUserPerform for role=%s permission=%s', async (role, permission) => {
        mockQuery.mockResolvedValue({ rows: [] });

        const user = { role };
        const expected = canUserPerform(user, permission);
        const { res, next } = await runMiddleware(requirePermission(permission), user);

        if (expected) {
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        } else {
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        }
    });

    test('requireAnyPermission grants when any catalog permission matches', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const { res, next } = await runMiddleware(
            requireAnyPermission('qc.governance.manage_gates', 'qc.tasks.view'),
            { role: 'tester' }
        );

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('requireAnyPermission denies when no catalog permission matches', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const { res, next } = await runMiddleware(
            requireAnyPermission('qc.governance.manage_gates', 'qc.admin.users.view'),
            { role: 'tester' }
        );

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('unknown permission keys are denied', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const { res, next } = await runMiddleware(
            requirePermission('page:tasks'),
            { role: 'tester' }
        );

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('per-user grant override can allow a role-denied permission', async () => {
        mockQuery.mockResolvedValue({
            rows: [{ permission_key: 'qc.governance.manage_gates', granted: true }],
        });

        const { res, next } = await runMiddleware(
            requirePermission('qc.governance.manage_gates'),
            { role: 'tester' }
        );

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });
});
