'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = { id: 'u1', role: 'member' }; next(); },
    requireRole: () => (req, _res, next) => next(),
    requirePermission: () => (req, _res, next) => next(),
    requireAnyPermission: () => (req, _res, next) => next(),
    optionalAuth: (req, _res, next) => next(),
    requireStatus: () => (req, _res, next) => next(),
    requireStatusScope: () => (req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');

afterEach(() => jest.clearAllMocks());

describe('GET /auth/me — Access Engine shape', () => {
    test('response includes effective_permissions and scope alongside legacy permissions', async () => {
        // Stub the row sequence the route + resolver issue:
        //  1) auth.js SELECT FROM app_user (handler)
        //  2) auth.js SELECT FROM user_permissions (legacy)
        //  3) RoleResolver: SELECT FROM role_permissions
        //  4) RoleResolver: SELECT FROM user_permissions
        //  5) RoleResolver: SELECT FROM role_scopes
        //  6) RoleResolver: SELECT FROM user_scopes
        //  7) RoleResolver: SELECT FROM app_user JOIN teams JOIN team_types
        //  8) RoleResolver: SELECT FROM project_managers
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'M', email: 'm@x', role: 'member', active: true, status: 'ACTIVE' }] })
            .mockResolvedValueOnce({ rows: [{ permission_key: 'qc.tasks.view_team', granted: true }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ permission_key: 'qc.tasks.view_team', granted: true }] })
            .mockResolvedValueOnce({ rows: [{ scope_key: 'active_only' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ team_id: 't-1', team_type: 'qc' }] })
            .mockResolvedValueOnce({ rows: [{ project_id: 'p-1' }] });

        const router = require('../src/routes/auth');
        const app = express();
        app.use(express.json());
        app.use('/auth', router);

        const res = await request(app).get('/auth/me').set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.effective_permissions)).toBe(true);
        expect(res.body.effective_permissions).toEqual(expect.arrayContaining(['qc.tasks.view_team']));
        expect(res.body.scope).toEqual({ team_id: 't-1', team_type: 'qc', pm_of_projects: ['p-1'] });
        // Legacy fields preserved
        expect(Array.isArray(res.body.permissions)).toBe(true);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.id).toBe('u1');
    });
});
