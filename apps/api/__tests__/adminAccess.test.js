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
    test('PATCH /admin/access/matrix updates role_permissions and writes audit_log', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const res = await request(makeApp())
            .patch('/admin/access/matrix')
            .send({
                role_identifier: 'tester',
                permission_key: 'qc.bugs.triage',
                granted: true,
            });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            role_identifier: 'tester',
            permission_key: 'qc.bugs.triage',
            granted: true,
        });

        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM role_permissions WHERE role_identifier = $1',
            ['tester']
        );
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            sql.includes('INSERT INTO role_permissions') && params[1] === 'qc.bugs.triage'
        ))).toBe(true);
        expect(mockQuery.mock.calls.some(([sql, params]) => (
            sql.includes('INSERT INTO audit_log') && params[0] === 'role_permission'
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
