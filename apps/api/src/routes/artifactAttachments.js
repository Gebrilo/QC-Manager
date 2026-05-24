'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const storage = require('../config/storage');
const { requireAuth } = require('../middleware/authMiddleware');

const ALLOWED_MIMES = [
    'application/pdf',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/zip',
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`File type ${file.mimetype} not allowed`));
    },
});

const VALID_TYPES = ['bug', 'user_story', 'task'];

router.post('/staged', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
        const { temp_id } = req.body;
        if (!temp_id) return res.status(400).json({ error: 'temp_id is required' });
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        await storage.ensureArtifactBucketExists();
        const uniqueName = `${uuidv4()}_${req.file.originalname}`;
        const storagePath = `tmp/${temp_id}/${uniqueName}`;
        await storage.uploadArtifactFile(storagePath, req.file.buffer, req.file.mimetype);

        res.status(201).json({
            storagePath,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
        });
    } catch (err) {
        if (err.message && err.message.includes('not allowed')) return res.status(400).json({ error: err.message });
        next(err);
    }
});

router.delete('/staged', requireAuth, async (req, res, next) => {
    try {
        const { storagePath } = req.body;
        if (!storagePath || !storagePath.startsWith('tmp/')) {
            return res.status(400).json({ error: 'Invalid staged file path' });
        }
        await storage.deleteArtifactFile(storagePath);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.get('/file/:id/url', requireAuth, async (req, res, next) => {
    try {
        const result = await db.pool.query(
            `SELECT id, storage_path, original_name, mime_type, size_bytes FROM artifact_attachments WHERE id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
        const file = result.rows[0];
        const url = await storage.createArtifactSignedUrl(file.storage_path, 300);
        res.json({ url, originalName: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes });
    } catch (err) { next(err); }
});

router.delete('/file/:id', requireAuth, async (req, res, next) => {
    try {
        const result = await db.pool.query(
            `SELECT id, storage_path, uploaded_by FROM artifact_attachments WHERE id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
        const file = result.rows[0];
        const { id: userId, role } = req.user;
        if (role !== 'admin' && role !== 'manager' && file.uploaded_by !== userId) {
            return res.status(403).json({ error: 'You can only delete your own attachments' });
        }
        await storage.deleteArtifactFile(file.storage_path);
        await db.pool.query(`DELETE FROM artifact_attachments WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.get('/:artifactType/:artifactId', requireAuth, async (req, res, next) => {
    try {
        const { artifactType, artifactId } = req.params;
        if (!VALID_TYPES.includes(artifactType)) return res.status(400).json({ error: 'Invalid artifact type' });
        const result = await db.pool.query(
            `SELECT aa.id, aa.original_name, aa.mime_type, aa.size_bytes, aa.created_at,
                    u.name AS uploaded_by_name
             FROM artifact_attachments aa
             LEFT JOIN app_user u ON u.id = aa.uploaded_by
             WHERE aa.artifact_type = $1 AND aa.artifact_id = $2
             ORDER BY aa.created_at ASC`,
            [artifactType, artifactId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

router.post('/:artifactType/:artifactId', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
        const { artifactType, artifactId } = req.params;
        if (!VALID_TYPES.includes(artifactType)) return res.status(400).json({ error: 'Invalid artifact type' });
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        await storage.ensureArtifactBucketExists();
        const uniqueName = `${uuidv4()}_${req.file.originalname}`;
        const storagePath = `${artifactType}/${artifactId}/${uniqueName}`;
        await storage.uploadArtifactFile(storagePath, req.file.buffer, req.file.mimetype);

        const result = await db.pool.query(
            `INSERT INTO artifact_attachments
               (artifact_type, artifact_id, original_name, filename, mime_type, size_bytes, storage_path, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, original_name, mime_type, size_bytes, created_at`,
            [artifactType, artifactId, req.file.originalname, uniqueName, req.file.mimetype, req.file.size, storagePath, req.user.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.message && err.message.includes('not allowed')) return res.status(400).json({ error: err.message });
        next(err);
    }
});

async function adoptStagedAttachments(artifactType, artifactId, tempId, uploadedBy) {
    if (!tempId) return;
    await storage.ensureArtifactBucketExists();
    const files = await storage.listArtifactFiles(`tmp/${tempId}`);
    if (!files || files.length === 0) return;

    for (const file of files) {
        if (!file.name || file.name.endsWith('/')) continue;
        const oldPath = `tmp/${tempId}/${file.name}`;
        const newPath = `${artifactType}/${artifactId}/${file.name}`;
        const blob = await storage.downloadArtifactFile(oldPath);
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.metadata?.mimetype || 'application/octet-stream';
        const sizeBytes = file.metadata?.size || buffer.length;
        await storage.uploadArtifactFile(newPath, buffer, mimeType);
        await storage.deleteArtifactFile(oldPath);
        const originalName = file.name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/, '');
        await db.pool.query(
            `INSERT INTO artifact_attachments
               (artifact_type, artifact_id, original_name, filename, mime_type, size_bytes, storage_path, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [artifactType, artifactId, originalName, file.name, mimeType, sizeBytes, newPath, uploadedBy || null]
        );
    }
}

module.exports = router;
module.exports.adoptStagedAttachments = adoptStagedAttachments;
