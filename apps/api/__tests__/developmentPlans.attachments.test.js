'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-uid' }),
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => next(),
    requireRole: () => (req, _res, next) => next(),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    canAccessUser: jest.fn(),
    getManagerTeamId: jest.fn(),
}));

jest.mock('../src/config/storage', () => ({
    uploadFile: jest.fn().mockResolvedValue({ path: 'mock-path' }),
    downloadFile: jest.fn(),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    createSignedUrl: jest.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
    IDP_ATTACHMENTS_BUCKET: 'idp-attachments',
}));

jest.mock('multer', () => {
    const mockMiddleware = (req, _res, next) => {
        req.file = {
            originalname: 'test.pdf',
            mimetype: 'application/pdf',
            size: 1024,
            buffer: Buffer.from('test'),
        };
        next();
    };
    const multerFn = () => ({ single: () => mockMiddleware });
    multerFn.memoryStorage = () => ({});
    return multerFn;
});

const express = require('express');
const request = require('supertest');
const { canAccessUser } = require('../src/middleware/teamAccess');
const storage = require('../src/config/storage');

function makeUserApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', require('../src/routes/developmentPlans'));
    return app;
}

function makeManagerApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'manager-1', role: 'manager' }; next(); });
    app.use('/development-plans', require('../src/routes/developmentPlans'));
    return app;
}

afterEach(() => jest.clearAllMocks());

// ─── GET /attachments/:attachmentId ──────────────────────────────────────────

describe('GET /attachments/:attachmentId — signed URL', () => {
    test('returns signed URL for own file', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'att-1',
                task_id: 'task-1',
                original_name: 'doc.pdf',
                mime_type: 'application/pdf',
                size_bytes: 1024,
                uploaded_by_role: 'resource',
                storage_path: 'idp/user-1/task-1/file.pdf',
                owner_user_id: 'user-1',
            }],
        });
        const res = await request(makeUserApp())
            .get('/development-plans/attachments/att-1');
        expect(res.status).toBe(200);
        expect(res.body.url).toBe('https://mock-signed-url.example.com/file');
        expect(res.body.original_name).toBe('doc.pdf');
    });

    test('returns 403 for another user\'s file (non-manager)', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'att-1',
                task_id: 'task-1',
                original_name: 'doc.pdf',
                mime_type: 'application/pdf',
                size_bytes: 1024,
                storage_path: 'idp/user-2/task-1/file.pdf',
                owner_user_id: 'user-2',
            }],
        });
        const res = await request(makeUserApp())
            .get('/development-plans/attachments/att-1');
        expect(res.status).toBe(403);
    });

    test('returns signed URL for manager accessing team member file', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'att-1',
                task_id: 'task-1',
                original_name: 'doc.pdf',
                mime_type: 'application/pdf',
                size_bytes: 1024,
                storage_path: 'idp/user-1/task-1/file.pdf',
                owner_user_id: 'user-1',
            }],
        });
        const res = await request(makeManagerApp())
            .get('/development-plans/attachments/att-1');
        expect(res.status).toBe(200);
        expect(res.body.url).toBe('https://mock-signed-url.example.com/file');
    });

    test('returns 404 for non-existent attachment', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp())
            .get('/development-plans/attachments/nonexistent');
        expect(res.status).toBe(404);
    });
});

// ─── DELETE /attachments/:attachmentId ────────────────────────────────────────

describe('DELETE /attachments/:attachmentId', () => {
    test('manager can delete any file', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'att-1',
                task_id: 'task-1',
                user_id: 'user-1',
                uploaded_by_role: 'resource',
                storage_path: 'idp/user-1/task-1/file.pdf',
                owner_user_id: 'user-1',
            }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeManagerApp())
            .delete('/development-plans/attachments/att-1');
        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe(true);
        expect(storage.deleteFile).toHaveBeenCalledWith('idp/user-1/task-1/file.pdf');
    });

    test('resource can only delete own uploads (403 for manager\'s file)', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'att-1',
                task_id: 'task-1',
                user_id: 'manager-1',
                uploaded_by_role: 'manager',
                storage_path: 'idp/user-1/task-1/file.pdf',
                owner_user_id: 'user-1',
            }],
        });
        const res = await request(makeUserApp())
            .delete('/development-plans/attachments/att-1');
        expect(res.status).toBe(403);
    });

    test('resource can delete own upload', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'att-1',
                task_id: 'task-1',
                user_id: 'user-1',
                uploaded_by_role: 'resource',
                storage_path: 'idp/user-1/task-1/file.pdf',
                owner_user_id: 'user-1',
            }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp())
            .delete('/development-plans/attachments/att-1');
        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe(true);
    });

    test('returns 404 for non-existent attachment', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp())
            .delete('/development-plans/attachments/nonexistent');
        expect(res.status).toBe(404);
    });
});

// ─── POST /my/tasks/:taskId/attachments — resource uploads ──────────────────

describe('POST /my/tasks/:taskId/attachments — resource upload', () => {
    test('returns 404 when task not found in own plan', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-999/attachments')
            .attach('file', Buffer.from('test'), 'test.pdf');
        expect(res.status).toBe(404);
    });

    test('uploads file and returns attachment record', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'att-1',
                    original_name: 'test.pdf',
                    mime_type: 'application/pdf',
                    size_bytes: 1024,
                    uploaded_by_role: 'resource',
                    uploaded_at: '2026-04-19T00:00:00Z',
                }],
            });
        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-1/attachments')
            .attach('file', Buffer.from('test'), 'test.pdf');
        expect(res.status).toBe(201);
        expect(res.body.original_name).toBe('test.pdf');
        expect(storage.uploadFile).toHaveBeenCalled();
    });
});

// ─── POST /:userId/tasks/:taskId/attachments — manager uploads ────────────────

describe('POST /:userId/tasks/:taskId/attachments — manager upload', () => {
    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/attachments')
            .attach('file', Buffer.from('test'), 'test.pdf');
        expect(res.status).toBe(403);
    });

    test('returns 404 when task not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-999/attachments')
            .attach('file', Buffer.from('test'), 'test.pdf');
        expect(res.status).toBe(404);
    });

    test('uploads file as manager and returns attachment record', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'att-1',
                    original_name: 'test.pdf',
                    mime_type: 'application/pdf',
                    size_bytes: 1024,
                    uploaded_by_role: 'manager',
                    uploaded_at: '2026-04-19T00:00:00Z',
                }],
            });
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/attachments')
            .attach('file', Buffer.from('test'), 'test.pdf');
        expect(res.status).toBe(201);
        expect(res.body.uploaded_by_role).toBe('manager');
    });
});

// ─── PATCH /my/tasks/:taskId/status — requires_attachment guard ──────────────

describe('PATCH /my/tasks/:taskId/status — requires_attachment guard', () => {
    test('returns 400 when requires_attachment=true and no attachment uploaded', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1', requires_attachment: true }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'DONE' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/requires an attachment/i);
    });

    test('allows DONE when requires_attachment=true and attachment exists', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1', requires_attachment: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'att-1' }] })
            .mockResolvedValueOnce({
                rows: [{ id: 'comp-1', task_id: 'task-1', progress_status: 'DONE', completed_at: new Date() }],
            });
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'DONE' });
        expect(res.status).toBe(200);
    });

    test('allows DONE when requires_attachment=false and no attachment', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1', requires_attachment: false }] })
            .mockResolvedValueOnce({
                rows: [{ id: 'comp-1', task_id: 'task-1', progress_status: 'DONE', completed_at: new Date() }],
            });
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'DONE' });
        expect(res.status).toBe(200);
    });
});

// ─── POST /:userId/objectives/:chapterId/tasks — requires_attachment field ───

describe('POST /:userId/objectives/:chapterId/tasks — requires_attachment', () => {
    test('accepts requires_attachment field', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'quest-1' }] })
            .mockResolvedValueOnce({
                rows: [{ id: 'task-1', title: 'Test Task', requires_attachment: true }],
            });
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/objectives/ch-1/tasks')
            .send({ title: 'Test Task', requires_attachment: true });
        expect(res.status).toBe(201);
    });
});

// ─── PATCH /:userId/tasks/:taskId — requires_attachment field ─────────────────

describe('PATCH /:userId/tasks/:taskId — requires_attachment', () => {
    test('accepts requires_attachment field', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ progress_status: 'IN_PROGRESS' }] })
            .mockResolvedValueOnce({
                rows: [{ id: 'task-1', title: 'Test', requires_attachment: true }],
            });
        const res = await request(makeManagerApp())
            .patch('/development-plans/user-1/tasks/task-1')
            .send({ requires_attachment: true });
        expect(res.status).toBe(200);
    });
});