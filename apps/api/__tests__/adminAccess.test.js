'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => {
        req.user = { id: 'admin-1', email: 'admin@example.com', role: 'admin', active: true, status: 'ACTIVE' };
        next();
    },
    requirePermission: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { permissionsForArtifact } = require('../src/routes/adminAccess');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/admin/access', require('../src/routes/adminAccess'));
    return app;
}

afterEach(() => {
    jest.clearAllMocks();
});

describe('admin access matrix routes', () => {
    test('permissionsForArtifact groups scoped actions into one matrix item', () => {
        const permissions = permissionsForArtifact('task');
        const view = permissions.find(permission => permission.key === 'qc.tasks.view');

        expect(view).toMatchObject({
            mode: 'scope',
            action: 'view',
            keys: {
                own: 'qc.tasks.view',
                team: 'qc.tasks.view_team',
                any: 'qc.tasks.view_any',
            },
        });
        expect(permissions.find(permission => permission.key === 'qc.tasks.view_team')).toBeUndefined();
        expect(permissions.find(permission => permission.key === 'qc.tasks.create')).toMatchObject({ mode: 'toggle' });
    });

    test('permissionsForArtifact exposes flat domains as toggle items', () => {
        expect(permissionsForArtifact('projects').find(permission => permission.key === 'qc.projects.view'))
            .toMatchObject({ mode: 'toggle', action: 'view' });
        expect(permissionsForArtifact('governance').find(permission => permission.key === 'qc.governance.approve_release'))
            .toMatchObject({ mode: 'toggle', action: 'approve_release' });
    });

    test('PATCH /admin/access/matrix updates role_permissions and writes audit_log', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const res = await request(makeApp())
            .patch('/admin/access/matrix')
            .send({
                role_identifier: 'tester',
                permission_key: 'qc.governance.manage_gates',
                granted: true,
            });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            role_identifier: 'tester',
            permission_key: 'qc.governance.manage_gates',
            granted: true,
        });

        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM role_permissions WHERE role_identifier = $1',
            ['tester']
        );
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            sql.includes('INSERT INTO role_permissions') && params[1] === 'qc.governance.manage_gates'
        ))).toBe(true);
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            sql.includes('INSERT INTO audit_log') && params[0] === 'role_permission'
        ))).toBe(true);
    });

    test('PATCH /admin/access/matrix expands a scope dropdown into bare and scoped keys', async () => {
        mockQuery.mockImplementation((sql) => {
            if (String(sql).includes('SELECT permission_key FROM role_permissions')) {
                return Promise.resolve({ rows: [{ permission_key: 'qc.tasks.view' }] });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const res = await request(makeApp())
            .patch('/admin/access/matrix')
            .send({
                role_identifier: 'tester',
                permission_group: 'qc.tasks.view',
                scope: 'team',
            });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            role_identifier: 'tester',
            permission_key: 'qc.tasks.view',
            scope: 'team',
        });
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            String(sql).includes('INSERT INTO role_permissions') && params[1] === 'qc.tasks.view'
        ))).toBe(true);
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            String(sql).includes('INSERT INTO role_permissions') && params[1] === 'qc.tasks.view_team'
        ))).toBe(true);
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            String(sql).includes('INSERT INTO audit_log') && params[5] === 'Granted qc.tasks.view_team for tester'
        ))).toBe(true);
    });

    test('PATCH /admin/access/matrix rejects revoking admin permissions', async () => {
        const res = await request(makeApp())
            .patch('/admin/access/matrix')
            .send({
                role_identifier: 'admin',
                permission_key: 'qc.admin.manage_permissions',
                granted: false,
            });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/admin role cannot have permissions revoked/i);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE /admin/access/roles/:name returns 409 when users are assigned', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ name: 'qa_lead' }] })
            .mockResolvedValueOnce({ rows: [{ count: '1' }] });

        const res = await request(makeApp()).delete('/admin/access/roles/qa_lead');

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/user\(s\) are assigned/i);
        expect(mockQuery).toHaveBeenCalledWith(
            'SELECT COUNT(*) AS count FROM app_user WHERE role = $1',
            ['qa_lead']
        );
    });
});
