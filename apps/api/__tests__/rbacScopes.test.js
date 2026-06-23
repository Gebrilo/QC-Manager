'use strict';

/**
 * Issue #269 — RBAC scopes move to DB with two-tier algebra + terminal-status
 * floor (ADR 0010 §5 + §6).
 */

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { resolve } = require('../src/access/RoleResolver');
const { seedRoleScopes, isRoleScopeSeeded, defaultScopesForRole } =
    require('../src/access/rbacScopeSeed');
const { requireStatusScope, isTerminalStatus } =
    require('../src/middleware/authMiddleware');
const { ROLES, ALL_SCOPE_VALUES } = require('../../shared/rbac/catalog.ts');

function rows(value) { return { rows: value }; }

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

async function runMiddleware(middleware, user, reqExtra = {}) {
    const req = { user: { id: `${user.role || user.status || 'u'}-1`, ...user }, ...reqExtra };
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

describe('effectiveScopes — two-tier algebra (issue #269)', () => {
    test('admin role has empty effectiveScopes (admin is gated by `active`, not scopes)', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([])) // 1. role_permissions
            .mockResolvedValueOnce(rows([])) // 2. user_permissions
            .mockResolvedValueOnce(rows([])) // 3. role_scopes (admin seeded with zero rows)
            .mockResolvedValueOnce(rows([])) // 4. user_scopes
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }])) // 5. team join
            .mockResolvedValueOnce(rows([])) // 6. project_managers
            .mockResolvedValueOnce(rows([{ '?column?': 1 }])); // 7. isRoleScopeSeeded → admin marker exists

        const out = await resolve({ id: 'a1', role: 'admin' });
        expect(out.effectiveScopes).toBeInstanceOf(Set);
        expect(out.effectiveScopes.size).toBe(0);
    });

    test('tester role resolves effectiveScopes = role_scopes from DB', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 't1', role: 'tester' });
        expect(out.effectiveScopes.has('active_only')).toBe(true);
        expect(out.effectiveScopes.has('team')).toBe(false);
    });

    test('user_scopes[granted=true] adds a scope absent from the role', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([{ scope_key: 'team', granted: true }]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 't1', role: 'tester' });
        expect(out.effectiveScopes.has('active_only')).toBe(true);
        expect(out.effectiveScopes.has('team')).toBe(true);
    });

    test('user_scopes[granted=false] strips a scope present in the role', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only', granted: false }]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 't1', role: 'tester' });
        expect(out.effectiveScopes.has('active_only')).toBe(false);
    });

    test('union/minus algebra: granted=true then granted=false on the same key net to absent', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([
                { scope_key: 'team', granted: true },
                { scope_key: 'team', granted: false },
            ]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 't1', role: 'tester' });
        expect(out.effectiveScopes.has('team')).toBe(false);
        expect(out.effectiveScopes.has('active_only')).toBe(true);
    });

    test('custom role with no DB row falls back to catalog (collectRoleScopes)', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))   // 1. role_permissions
            .mockResolvedValueOnce(rows([]))   // 2. user_permissions
            .mockResolvedValueOnce(rows([]))   // 3. role_scopes empty
            .mockResolvedValueOnce(rows([]))   // 4. user_scopes
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }])) // 5. team join
            .mockResolvedValueOnce(rows([]))   // 6. project_managers
            .mockResolvedValueOnce(rows([]));  // 7. isRoleScopeSeeded: no marker -> fall back to catalog

        const out = await resolve({ id: 'u1', role: 'tester' });
        expect(out.effectiveScopes.has('active_only')).toBe(true);
    });
});

describe('seedRoleScopes (issue #269)', () => {
    function makeClient() {
        const queries = [];
        const client = {
            query: jest.fn((text, params) => {
                queries.push({ text, params });
                if (typeof text === 'string' && text.includes('rbac_scope_seed_marker') && text.trim().toUpperCase().startsWith('SELECT')) {
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [], rowCount: 0 });
            }),
        };
        return { client, queries };
    }

    test('seeds every built-in role on a fresh database (no markers)', async () => {
        const { client, queries } = makeClient();
        const seeded = await seedRoleScopes(client);
        expect(new Set(seeded)).toEqual(new Set(Object.keys(ROLES)));

        const markerInserts = queries.filter(q => /INSERT INTO rbac_scope_seed_marker/.test(q.text));
        expect(markerInserts.length).toBe(Object.keys(ROLES).length);

        const adminScopeInserts = queries.filter(q =>
            q.params[0] === 'admin' && /INSERT INTO role_scopes/.test(q.text));
        expect(adminScopeInserts.length).toBe(0);
    });

    test('contributor role seeded with preparation_only', async () => {
        const { client, queries } = makeClient();
        await seedRoleScopes(client);
        const contributorInserts = queries.filter(q =>
            q.params[0] === 'contributor' && /INSERT INTO role_scopes/.test(q.text));
        expect(contributorInserts.map(q => q.params[1])).toEqual(['preparation_only']);
    });

    test('tester / pm / viewer / team_manager get active_only (and team_manager also gets team)', async () => {
        const { client, queries } = makeClient();
        await seedRoleScopes(client);
        const byRole = {};
        for (const q of queries) {
            if (/INSERT INTO role_scopes/.test(q.text)) {
                const [role, scope] = q.params;
                (byRole[role] = byRole[role] || []).push(scope);
            }
        }
        expect(new Set(byRole.tester)).toEqual(new Set(['active_only']));
        expect(new Set(byRole.pm)).toEqual(new Set(['active_only']));
        expect(new Set(byRole.viewer)).toEqual(new Set(['active_only']));
        expect(new Set(byRole.team_manager)).toEqual(new Set(['team', 'active_only']));
    });

    test('is idempotent — re-running with markers present is a no-op', async () => {
        const client = {
            query: jest.fn(text => {
                if (typeof text === 'string' && text.includes('rbac_scope_seed_marker') && text.trim().toUpperCase().startsWith('SELECT')) {
                    return Promise.resolve({ rows: [{ '?column?': 1 }] });
                }
                return Promise.resolve({ rows: [] });
            }),
        };
        const seeded = await seedRoleScopes(client);
        expect(seeded).toEqual([]);
        const writes = client.query.mock.calls.filter(([text]) =>
            /DELETE FROM role_scopes|INSERT INTO role_scopes|INSERT INTO rbac_scope_seed_marker/.test(text));
        expect(writes.length).toBe(0);
    });

    test('does NOT re-seed a role an admin has deliberately emptied', async () => {
        const client = {
            query: jest.fn((text, params) => {
                if (typeof text === 'string' && text.includes('rbac_scope_seed_marker') && text.trim().toUpperCase().startsWith('SELECT')) {
                    if (params && params[0] === 'tester') return Promise.resolve({ rows: [{ '?column?': 1 }] });
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            }),
        };
        const seeded = await seedRoleScopes(client);
        expect(seeded).not.toContain('tester');
        expect(seeded).toContain('admin');
    });

    test('isRoleScopeSeeded returns true/false based on marker row', async () => {
        const yes = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
        await expect(isRoleScopeSeeded(yes, 'tester')).resolves.toBe(true);
        const no = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        await expect(isRoleScopeSeeded(no, 'tester')).resolves.toBe(false);
    });

    test('defaultScopesForRole returns catalog defaults (admin has none)', () => {
        expect(defaultScopesForRole('admin')).toEqual([]);
        expect(defaultScopesForRole('tester')).toEqual(['active_only']);
        expect(new Set(defaultScopesForRole('team_manager'))).toEqual(new Set(['team', 'active_only']));
        expect(defaultScopesForRole('contributor')).toEqual(['preparation_only']);
    });
});

describe('requireStatusScope (issue #269)', () => {
    test('isTerminalStatus recognises SUSPENDED and ARCHIVED only', () => {
        expect(isTerminalStatus('SUSPENDED')).toBe(true);
        expect(isTerminalStatus('ARCHIVED')).toBe(true);
        expect(isTerminalStatus('suspended')).toBe(true);
        expect(isTerminalStatus('ACTIVE')).toBe(false);
        expect(isTerminalStatus('PREPARATION')).toBe(false);
        expect(isTerminalStatus(null)).toBe(false);
        expect(isTerminalStatus(undefined)).toBe(false);
    });

    describe('terminal-status floor (always blocks, both flag states)', () => {
        test('SUSPENDED user is blocked even if the resolver says they have the scope (flag ON)', async () => {
            process.env.RBAC_UNIFIED = 'on';
            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'SUSPENDED' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'terminal_status_floor' }));
        });

        test('ARCHIVED user is blocked even via an exemption (flag ON, user_scopes granted=true)', async () => {
            process.env.RBAC_UNIFIED = 'on';
            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'ARCHIVED' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'terminal_status_floor' }));
        });

        test('SUSPENDED user is blocked even when flag is OFF (legacy path)', async () => {
            delete process.env.RBAC_UNIFIED;
            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'SUSPENDED' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'terminal_status_floor' }));
        });
    });

    describe('flag OFF — legacy path unchanged', () => {
        beforeEach(() => { delete process.env.RBAC_UNIFIED; });

        test('tester in ACTIVE status passes active_only (catalog membership + status)', async () => {
            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'ACTIVE' }
            );
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('tester in PREPARATION status is denied', async () => {
            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'PREPARATION' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('contributor (catalog has preparation_only only) is denied active_only even in ACTIVE', async () => {
            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'contributor', status: 'ACTIVE' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('flag ON — resolver-backed path', () => {
        beforeEach(() => { process.env.RBAC_UNIFIED = 'on'; });

        test('tester with DB active_only scope + ACTIVE status passes', async () => {
            mockQuery
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
                .mockResolvedValueOnce(rows([]));

            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'ACTIVE' }
            );
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('user with user_scopes[granted=false] strip is denied active_only', async () => {
            mockQuery
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
                .mockResolvedValueOnce(rows([{ scope_key: 'active_only', granted: false }]))
                .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
                .mockResolvedValueOnce(rows([]));

            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'ACTIVE' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'scope_missing' }));
        });

        test('status mismatch still returns 403 after scope passes', async () => {
            mockQuery
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
                .mockResolvedValueOnce(rows([]))
                .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
                .mockResolvedValueOnce(rows([]));

            const { res, next } = await runMiddleware(
                requireStatusScope('active_only'),
                { id: 'u1', role: 'tester', status: 'PREPARATION' }
            );
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });
});

describe('rbacScopes admin route (issue #269 — backend surface for Matrix UI)', () => {
    let router;
    function makeReqRes(user = { id: 'admin-1', role: 'admin', email: 'a@example.com' }) {
        const req = { user, params: {}, body: {} };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();
        return { req, res, next };
    }
    function findHandler(router, method, path) {
        const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
        if (!layer) throw new Error(`No route ${method.toUpperCase()} ${path}`);
        return layer.route.stack[layer.route.stack.length - 1].handle;
    }

    beforeAll(() => {
        router = require('../src/routes/rbacScopes');
    });

    test('GET /scopes/role/:roleIdentifier returns the role_scopes + known scope vocabulary', async () => {
        const handler = findHandler(router, 'get', '/scopes/role/:roleIdentifier');
        const { req, res, next } = makeReqRes();
        req.params = { roleIdentifier: 'tester' };
        mockQuery.mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]));

        await handler(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            role_identifier: 'tester',
            scopes: ['active_only'],
            known_scopes: ALL_SCOPE_VALUES,
        }));
    });

    test('PUT /scopes/role/:roleIdentifier replaces the role scopes and audits', async () => {
        const handler = findHandler(router, 'put', '/scopes/role/:roleIdentifier');
        const { req, res, next } = makeReqRes();
        req.params = { roleIdentifier: 'tester' };
        req.body = { scopes: ['active_only', 'team'] };

        const calls = [];
        mockQuery.mockImplementation(async (text, params) => {
            calls.push({ text, params });
            if (text.startsWith('SELECT scope_key FROM role_scopes')) {
                return rows([{ scope_key: 'active_only' }]);
            }
            return { rows: [], rowCount: 0 };
        });

        await handler(req, res, next);

        const deleteCall = calls.find(c => /DELETE FROM role_scopes/.test(c.text));
        const insertCalls = calls.filter(c => /INSERT INTO role_scopes/.test(c.text));
        const auditCall = calls.find(c => /INSERT INTO audit_log/.test(c.text));
        expect(deleteCall).toBeDefined();
        expect(insertCalls.map(c => c.params[1]).sort()).toEqual(['active_only', 'team']);
        expect(auditCall).toBeDefined();
        expect(auditCall.params[0]).toBe('role_scope');
        expect(auditCall.params[1]).toBe('rbac_scope_audit');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            role_identifier: 'tester',
            scopes: expect.arrayContaining(['active_only', 'team']),
        }));
    });

    test('PUT /scopes/role/:roleIdentifier rejects unknown scope keys', async () => {
        const handler = findHandler(router, 'put', '/scopes/role/:roleIdentifier');
        const { req, res, next } = makeReqRes();
        req.params = { roleIdentifier: 'tester' };
        req.body = { scopes: ['active_only', 'not_a_real_scope'] };

        await handler(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('GET /scopes/user/:userId returns user_scopes for a known user', async () => {
        const handler = findHandler(router, 'get', '/scopes/user/:userId');
        const { req, res, next } = makeReqRes();
        const userId = '11111111-1111-1111-1111-111111111111';
        req.params = { userId };
        mockQuery.mockImplementation(async text => {
            if (/SELECT id FROM app_user/.test(text)) return rows([{ id: userId }]);
            if (/SELECT scope_key, granted FROM user_scopes/.test(text)) {
                return rows([{ scope_key: 'team', granted: true }]);
            }
            return { rows: [] };
        });

        await handler(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            user_id: userId,
            scopes: [{ scope_key: 'team', granted: true }],
        }));
    });

    test('GET /scopes/user/:userId rejects non-UUID', async () => {
        const handler = findHandler(router, 'get', '/scopes/user/:userId');
        const { req, res, next } = makeReqRes();
        req.params = { userId: 'not-a-uuid' };

        await handler(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('GET /scopes/user/:userId 404s on unknown user', async () => {
        const handler = findHandler(router, 'get', '/scopes/user/:userId');
        const { req, res, next } = makeReqRes();
        const userId = '11111111-1111-1111-1111-111111111111';
        req.params = { userId };
        mockQuery.mockResolvedValueOnce(rows([]));

        await handler(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('PUT /scopes/user/:userId replaces and audits user_scopes', async () => {
        const handler = findHandler(router, 'put', '/scopes/user/:userId');
        const { req, res, next } = makeReqRes();
        const userId = '11111111-1111-1111-1111-111111111111';
        req.params = { userId };
        req.body = { scopes: [{ scope_key: 'team', granted: true }] };

        const calls = [];
        mockQuery.mockImplementation(async (text, params) => {
            calls.push({ text, params });
            if (/SELECT id FROM app_user/.test(text)) return rows([{ id: userId }]);
            if (/SELECT scope_key, granted FROM user_scopes/.test(text)) return rows([]);
            return { rows: [], rowCount: 0 };
        });

        await handler(req, res, next);

        const deleteCall = calls.find(c => /DELETE FROM user_scopes/.test(c.text));
        const insertCalls = calls.filter(c => /INSERT INTO user_scopes/.test(c.text));
        const auditCall = calls.find(c => /INSERT INTO audit_log/.test(c.text));
        expect(deleteCall).toBeDefined();
        expect(insertCalls.length).toBe(1);
        expect(insertCalls[0].params[0]).toBe(userId);
        expect(insertCalls[0].params[1]).toBe('team');
        expect(insertCalls[0].params[2]).toBe(true);
        expect(auditCall).toBeDefined();
        expect(auditCall.params[0]).toBe('user_scope');
        expect(auditCall.params[1]).toBe('rbac_scope_audit');
    });
});
