const { createUserStorySchema, updateUserStorySchema } = require('../src/schemas/userStory');

jest.mock('../src/config/db', () => ({
    pool: { query: jest.fn() },
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => next(),
    requirePermission: () => (req, res, next) => next(),
    requireAnyPermission: () => (req, res, next) => next(),
}));
jest.mock('../src/services/tuleapClient', () => ({
    defaultClient: {},
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
    defaultRegistry: {},
}));
jest.mock('../src/services/emitters/user_story', () => ({
    emitToTuleap: jest.fn(),
}));
jest.mock('../src/routes/artifactAttachments', () => ({
    adoptStagedAttachments: jest.fn().mockResolvedValue(undefined),
}));

const { pool } = require('../src/config/db');
const { emitToTuleap } = require('../src/services/emitters/user_story');
const request = require('supertest');
const express = require('express');

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/user-stories', require('../src/routes/userStories'));
    app.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

const PID = '00000000-0000-0000-0000-000000000001';

const ok = (overrides = {}) => ({ rows: [{ id: 'us1', project_id: PID, sync_status: 'pending', ...overrides }] });

describe('POST /user-stories — create with Zod + sync writeback', () => {
    beforeEach(() => jest.clearAllMocks());

    const validPayload = {
        title: 'As a user I want to login',
        project_id: PID,
        status: 'Draft',
        description: 'Login story',
        priority: 'P3-Medium',
    };

    it('returns 400 with Zod path when title is missing', async () => {
        const res = await request(createApp())
            .post('/user-stories')
            .send({ ...validPayload, title: '' });
        expect(res.status).toBe(400);
        expect(res.body.details.find(d => d.path.includes('title'))).toBeDefined();
    });

    it('returns 400 with Zod path when project_id is missing', async () => {
        const res = await request(createApp())
            .post('/user-stories')
            .send({ ...validPayload, project_id: undefined });
        expect(res.status).toBe(400);
        expect(res.body.details.find(d => d.path.includes('project_id'))).toBeDefined();
    });

    it('returns 201 with sync_status=synced when Tuleap mock succeeds', async () => {
        pool.query
            .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
            .mockResolvedValueOnce({ rows: [{ id: 'cfg-1', tuleap_tracker_id: 103 }] })
            .mockResolvedValueOnce(ok({ sync_status: 'synced', tuleap_artifact_id: 500, tuleap_url: 'https://tuleap.example.com/?aid=500' }));

        emitToTuleap.mockResolvedValueOnce({ tuleap_artifact_id: 500, tuleap_url: 'https://tuleap.example.com/?aid=500' });

        const res = await request(createApp()).post('/user-stories').send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.data.sync_status).toBe('synced');
        expect(emitToTuleap).toHaveBeenCalledTimes(1);
    });

    it('returns 201 with sync_status=failed and populated last_sync_error when Tuleap mock rejects', async () => {
        pool.query
            .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
            .mockResolvedValueOnce({ rows: [{ id: 'cfg-1', tuleap_tracker_id: 103 }] })
            .mockResolvedValueOnce(ok({ sync_status: 'failed', last_sync_error: 'Tuleap unavailable' }));

        emitToTuleap.mockRejectedValueOnce(new Error('Tuleap unavailable'));

        const res = await request(createApp()).post('/user-stories').send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.data.sync_status).toBe('failed');
        expect(res.body.data.last_sync_error).toBe('Tuleap unavailable');
    });

    it('returns 201 with sync_status=standalone when no tuleap_sync_config exists', async () => {
        pool.query
            .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce(ok({ sync_status: 'standalone' }));

        const res = await request(createApp()).post('/user-stories').send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.data.sync_status).toBe('standalone');
        expect(emitToTuleap).not.toHaveBeenCalled();
    });

    it('local INSERT always succeeds even when Tuleap mock throws', async () => {
        pool.query
            .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
            .mockResolvedValueOnce({ rows: [{ id: 'cfg-1', tuleap_tracker_id: 103 }] })
            .mockResolvedValueOnce(ok({ sync_status: 'failed', last_sync_error: 'Network error' }));

        emitToTuleap.mockRejectedValueOnce(new Error('Network error'));

        const res = await request(createApp()).post('/user-stories').send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.sync_status).toBe('failed');
    });
});

describe('Zod schemas', () => {
    it('createUserStorySchema rejects empty title', () => {
        const result = createUserStorySchema.safeParse({
            title: '', project_id: PID,
        });
        expect(result.success).toBe(false);
    });

    it('updateUserStorySchema allows partial updates without project_id', () => {
        const result = updateUserStorySchema.safeParse({ title: 'Updated' });
        expect(result.success).toBe(true);
    });

    it('updateUserStorySchema preserves project_id', () => {
        const result = updateUserStorySchema.safeParse({ project_id: PID, title: 'X' });
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('project_id', PID);
    });
});
