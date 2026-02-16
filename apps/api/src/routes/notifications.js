const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

// List notifications for the current user
router.get('/', async (req, res, next) => {
    try {
        const { unread_only, limit = 50 } = req.query;

        let query = `
            SELECT id, type, title, message, read, metadata, created_at
            FROM notification
            WHERE user_id = $1
        `;
        const params = [req.user.id];

        if (unread_only === 'true') {
            query += ' AND read = false';
        }

        query += ' ORDER BY created_at DESC LIMIT $2';
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        // Also get unread count
        const countResult = await db.query(
            'SELECT COUNT(*) as count FROM notification WHERE user_id = $1 AND read = false',
            [req.user.id]
        );

        res.json({
            notifications: result.rows,
            unread_count: parseInt(countResult.rows[0].count),
        });
    } catch (err) {
        next(err);
    }
});

// Mark a single notification as read
router.patch('/:id/read', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'UPDATE notification SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// Mark all notifications as read
router.patch('/read-all', async (req, res, next) => {
    try {
        await db.query(
            'UPDATE notification SET read = true WHERE user_id = $1 AND read = false',
            [req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Delete a notification
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'DELETE FROM notification WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// Helper: Create a notification (used by other routes)
async function createNotification(userId, type, title, message, metadata = {}) {
    try {
        await db.query(
            `INSERT INTO notification (user_id, type, title, message, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, type, title, message, JSON.stringify(metadata)]
        );
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
}

// Helper: Notify all admins
async function notifyAdmins(type, title, message, metadata = {}) {
    try {
        const admins = await db.query("SELECT id FROM app_user WHERE role = 'admin' AND active = true");
        for (const admin of admins.rows) {
            await createNotification(admin.id, type, title, message, metadata);
        }
    } catch (err) {
        console.error('Failed to notify admins:', err.message);
    }
}

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyAdmins = notifyAdmins;
