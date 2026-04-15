const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const AVATARS_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');

if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename: (req, _file, cb) => {
        const ext = _file.mimetype === 'image/png' ? 'png'
                  : _file.mimetype === 'image/gif' ? 'gif'
                  : _file.mimetype === 'image/webp' ? 'webp'
                  : 'jpg';
        cb(null, `avatar-${req.user.id}.${ext}`);
    },
});

const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_SIZE_BYTES },
});

router.post('/avatar', requireAuth, (req, res, next) => {
    upload.single('avatar')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        try {
            await db.query(
                'UPDATE app_user SET avatar_url = $1, avatar_type = $2, updated_at = NOW() WHERE id = $3',
                [avatarUrl, 'upload', req.user.id]
            );
            res.json({ avatar_url: avatarUrl, avatar_type: 'upload' });
        } catch (dbErr) {
            fs.unlink(req.file.path, () => {});
            next(dbErr);
        }
    });
});

router.delete('/avatar', requireAuth, async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT avatar_url FROM app_user WHERE id = $1',
            [req.user.id]
        );
        const current = result.rows[0]?.avatar_url;
        if (current && current.startsWith('/uploads/avatars/')) {
            const filePath = path.join(__dirname, '..', '..', current.replace('/uploads/', 'uploads/'));
            fs.unlink(filePath, () => {});
        }

        await db.query(
            'UPDATE app_user SET avatar_url = NULL, avatar_type = $1, updated_at = NOW() WHERE id = $2',
            ['initials', req.user.id]
        );
        res.json({ avatar_url: null, avatar_type: 'initials' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
