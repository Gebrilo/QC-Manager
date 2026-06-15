'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => {
        if (!req.user) req.user = { id: 'user-1', role: 'user' };
        next();
    },
}));

jest.mock('../src/config/storage', () => ({
    ensureArtifactBucketExists: jest.fn().mockResolvedValue(undefined),
    uploadArtifactFile: jest.fn().mockResolvedValue({ path: 'mock-path' }),
    downloadArtifactFile: jest.fn().mockResolvedValue(new Blob(['data'])),
    deleteArtifactFile: jest.fn().mockResolvedValue(undefined),
    createArtifactSignedUrl: jest.fn().mockResolvedValue('https://signed.url/file'),
    listArtifactFiles: jest.fn().mockResolvedValue([]),
    ARTIFACT_ATTACHMENTS_BUCKET: 'artifact-attachments',
}));

jest.mock('multer', () => {
    const { IncomingForm } = require('formidable');
    const mockMiddleware = (req, _res, next) => {
        req.file = { originalname: 'test.png', mimetype: 'image/png', size: 2048, buffer: Buffer.from('img') };
        if (!req.body) req.body = {};
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            const form = new IncomingForm({ multiples: false });
            form.parse(req, (err, fields) => {
                if (!err && fields) {
                    for (const [key, val] of Object.entries(fields)) {
                        req.body[key] = Array.isArray(val) ? val[0] : val;
                    }
                }
                next();
            });
        } else {
            next();
        }
    };
    const multerFn = () => ({ single: () => mockMiddleware });
    multerFn.memoryStorage = () => ({});
    return multerFn;
});

const express = require('express');
const request = require('supertest');
const storage = require('../src/config/storage');

function makeApp(role = 'user') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role }; next(); });
    app.use('/attachments', require('../src/routes/artifactAttachments'));
    return app;
}

afterEach(() => jest.clearAllMocks());

// ── POST /staged ──────────────────────────────────────────────────────────────

describe('POST /attachments/staged', () => {
    test('uploads file to tmp path and returns metadata', async () => {
        const res = await request(makeApp())
            .post('/attachments/staged')
            .field('temp_id', 'tmp-uuid-123')
            .attach('file', Buffer.from('data'), 'test.png');
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ originalName: 'test.png', mimeType: 'image/png' });
        expect(storage.uploadArtifactFile).toHaveBeenCalledWith(
            expect.stringContaining('tmp/tmp-uuid-123/'),
            expect.any(Buffer),
            'image/png'
        );
    });

    test('returns 400 when temp_id is missing', async () => {
        const res = await request(makeApp())
            .post('/attachments/staged')
            .attach('file', Buffer.from('data'), 'test.png');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/temp_id/);
    });
});

// ── GET /:type/:id ────────────────────────────────────────────────────────────

describe('GET /attachments/:type/:id', () => {
    test('returns list of attachments', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'att-1', original_name: 'doc.pdf', mime_type: 'application/pdf', size_bytes: 1024, created_at: '2026-05-23', uploaded_by_name: 'Alice' }],
        });
        const res = await request(makeApp()).get('/attachments/bug/11111111-1111-4111-8111-111111111111');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].original_name).toBe('doc.pdf');
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual(['bug', '11111111-1111-4111-8111-111111111111']);
    });

    test('resolves numeric Tuleap artifact id before listing attachments', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-4222-8222-222222222222' }] })
            .mockResolvedValueOnce({
                rows: [{ id: 'att-1', original_name: 'story.pdf', mime_type: 'application/pdf', size_bytes: 512, created_at: '2026-06-15', uploaded_by_name: 'Alice' }],
            });

        const res = await request(makeApp()).get('/attachments/user_story/52');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(mockQuery.mock.calls[0][0]).toMatch(/FROM user_stories/);
        expect(mockQuery.mock.calls[0][1]).toEqual([52]);
        expect(mockQuery.mock.calls[1][1]).toEqual(['user_story', '22222222-2222-4222-8222-222222222222']);
    });

    test('returns 404 when numeric Tuleap artifact id is unknown', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(makeApp()).get('/attachments/user_story/999999');

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/Artifact not found/);
    });

    test('returns 400 for malformed artifact id', async () => {
        const res = await request(makeApp()).get('/attachments/user_story/not-a-uuid');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/QC UUID or Tuleap artifact id/);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('returns 400 for invalid artifact type', async () => {
        const res = await request(makeApp()).get('/attachments/unknown_type/some-uuid');
        expect(res.status).toBe(400);
    });
});

// ── POST /:type/:id ───────────────────────────────────────────────────────────

describe('POST /attachments/:type/:id', () => {
    test('resolves numeric Tuleap artifact id before uploading attachment', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-4222-8222-222222222222' }] })
            .mockResolvedValueOnce({
                rows: [{ id: 'att-1', original_name: 'test.png', mime_type: 'image/png', size_bytes: 2048, created_at: '2026-06-15' }],
            });

        const res = await request(makeApp())
            .post('/attachments/user_story/52')
            .attach('file', Buffer.from('data'), 'test.png');

        expect(res.status).toBe(201);
        expect(storage.uploadArtifactFile).toHaveBeenCalledWith(
            expect.stringContaining('user_story/22222222-2222-4222-8222-222222222222/'),
            expect.any(Buffer),
            'image/png'
        );
        expect(mockQuery.mock.calls[0][0]).toMatch(/FROM user_stories/);
        expect(mockQuery.mock.calls[0][1]).toEqual([52]);
        expect(mockQuery.mock.calls[1][1]).toEqual(expect.arrayContaining([
            'user_story',
            '22222222-2222-4222-8222-222222222222',
        ]));
    });
});

// ── GET /file/:id/url ─────────────────────────────────────────────────────────

describe('GET /attachments/file/:id/url', () => {
    test('returns signed URL for known attachment', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'att-1', storage_path: 'bug/uuid/file.png', original_name: 'file.png', mime_type: 'image/png', size_bytes: 512 }],
        });
        const res = await request(makeApp()).get('/attachments/file/att-1/url');
        expect(res.status).toBe(200);
        expect(res.body.url).toBe('https://signed.url/file');
    });

    test('returns 404 for unknown attachment', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).get('/attachments/file/missing-id/url');
        expect(res.status).toBe(404);
    });
});

// ── DELETE /file/:id ──────────────────────────────────────────────────────────

describe('DELETE /attachments/file/:id', () => {
    test('allows uploader to delete own attachment', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'att-1', storage_path: 'bug/uuid/file.png', uploaded_by: 'user-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).delete('/attachments/file/att-1');
        expect(res.status).toBe(200);
        expect(storage.deleteArtifactFile).toHaveBeenCalledWith('bug/uuid/file.png');
    });

    test('forbids non-uploader from deleting', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'att-1', storage_path: 'bug/uuid/file.png', uploaded_by: 'other-user' }] });
        const res = await request(makeApp('user')).delete('/attachments/file/att-1');
        expect(res.status).toBe(403);
    });

    test('allows admin to delete any attachment', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'att-1', storage_path: 'bug/uuid/file.png', uploaded_by: 'other-user' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp('admin')).delete('/attachments/file/att-1');
        expect(res.status).toBe(200);
    });
});

// ── adoptStagedAttachments ────────────────────────────────────────────────────

describe('adoptStagedAttachments', () => {
    test('moves files from tmp to permanent path and inserts DB rows', async () => {
        storage.listArtifactFiles.mockResolvedValueOnce([
            { name: 'abc123_photo.jpg', metadata: { mimetype: 'image/jpeg', size: 512 } },
        ]);
        storage.downloadArtifactFile.mockResolvedValueOnce(new Blob(['img'], { type: 'image/jpeg' }));
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const { adoptStagedAttachments } = require('../src/routes/artifactAttachments');
        await adoptStagedAttachments('bug', 'bug-uuid', 'temp-id', 'user-1');

        expect(storage.uploadArtifactFile).toHaveBeenCalledWith(
            'bug/bug-uuid/abc123_photo.jpg', expect.any(Buffer), 'image/jpeg'
        );
        expect(storage.deleteArtifactFile).toHaveBeenCalledWith('tmp/temp-id/abc123_photo.jpg');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO artifact_attachments'),
            expect.arrayContaining(['bug', 'bug-uuid'])
        );
    });

    test('does nothing when temp_id is null', async () => {
        const { adoptStagedAttachments } = require('../src/routes/artifactAttachments');
        await adoptStagedAttachments('bug', 'bug-uuid', null, 'user-1');
        expect(storage.listArtifactFiles).not.toHaveBeenCalled();
    });

    test('does nothing when no files in staging', async () => {
        storage.listArtifactFiles.mockResolvedValueOnce([]);
        const { adoptStagedAttachments } = require('../src/routes/artifactAttachments');
        await adoptStagedAttachments('bug', 'bug-uuid', 'temp-id', 'user-1');
        expect(storage.uploadArtifactFile).not.toHaveBeenCalled();
    });
});
