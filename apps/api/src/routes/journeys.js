const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const {
    createJourneySchema, updateJourneySchema,
    createChapterSchema, updateChapterSchema,
    createQuestSchema, updateQuestSchema,
    createTaskSchema, updateTaskSchema,
    completeTaskSchema,
} = require('../schemas/journey');

// ============================================================================
// Admin Endpoints — Journey CRUD
// ============================================================================

// GET /journeys — List all journeys with counts
router.get('/', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT j.*,
                (SELECT COUNT(*) FROM journey_chapters jc WHERE jc.journey_id = j.id) AS chapter_count,
                (SELECT COUNT(*) FROM journey_quests jq
                    JOIN journey_chapters jc2 ON jq.chapter_id = jc2.id
                    WHERE jc2.journey_id = j.id) AS quest_count,
                (SELECT COUNT(*) FROM journey_tasks jt
                    JOIN journey_quests jq2 ON jt.quest_id = jq2.id
                    JOIN journey_chapters jc3 ON jq2.chapter_id = jc3.id
                    WHERE jc3.journey_id = j.id) AS task_count
            FROM journeys j
            WHERE j.deleted_at IS NULL
            ORDER BY j.sort_order, j.created_at
        `);
        res.json(result.rows);
    } catch (err) { next(err); }
});

// GET /journeys/:id — Full nested tree
router.get('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const journey = await db.query(`SELECT * FROM journeys WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (journey.rows.length === 0) return res.status(404).json({ error: 'Journey not found' });

        const chapters = await db.query(`SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [id]);
        const chapterIds = chapters.rows.map(c => c.id);

        let quests = [];
        let tasks = [];
        if (chapterIds.length > 0) {
            quests = (await db.query(`SELECT * FROM journey_quests WHERE chapter_id = ANY($1) ORDER BY sort_order`, [chapterIds])).rows;
            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(`SELECT * FROM journey_tasks WHERE quest_id = ANY($1) ORDER BY sort_order`, [questIds])).rows;
            }
        }

        // Nest the tree
        const tree = {
            ...journey.rows[0],
            chapters: chapters.rows.map(ch => ({
                ...ch,
                quests: quests.filter(q => q.chapter_id === ch.id).map(q => ({
                    ...q,
                    tasks: tasks.filter(t => t.quest_id === q.id),
                })),
            })),
        };
        res.json(tree);
    } catch (err) { next(err); }
});

// POST /journeys — Create journey
router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const data = createJourneySchema.parse(req.body);
        const result = await db.query(
            `INSERT INTO journeys (slug, title, description, is_active, auto_assign_on_activation, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [data.slug, data.title, data.description, data.is_active, data.auto_assign_on_activation, data.sort_order]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

// PATCH /journeys/:id — Update journey
router.patch('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateJourneySchema.parse(req.body);

        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined) {
                fields.push(`${key} = $${idx++}`);
                values.push(val);
            }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        fields.push(`updated_at = NOW()`);
        values.push(id);
        const result = await db.query(
            `UPDATE journeys SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
            values
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Journey not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// DELETE /journeys/:id — Soft delete
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `UPDATE journeys SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Journey not found' });
        res.json({ success: true, message: 'Journey deleted' });
    } catch (err) { next(err); }
});

// ============================================================================
// Admin Endpoints — Chapter CRUD
// ============================================================================

router.post('/:journeyId/chapters', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { journeyId } = req.params;
        const data = createChapterSchema.parse(req.body);
        const result = await db.query(
            `INSERT INTO journey_chapters (journey_id, slug, title, description, sort_order, is_mandatory)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [journeyId, data.slug, data.title, data.description, data.sort_order, data.is_mandatory]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

router.patch('/chapters/:id', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateChapterSchema.parse(req.body);
        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined) { fields.push(`${key} = $${idx++}`); values.push(val); }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const result = await db.query(`UPDATE journey_chapters SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Chapter not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/chapters/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const result = await db.query(`DELETE FROM journey_chapters WHERE id = $1 RETURNING *`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Chapter not found' });
        res.json({ success: true, message: 'Chapter deleted' });
    } catch (err) { next(err); }
});

// ============================================================================
// Admin Endpoints — Quest CRUD
// ============================================================================

router.post('/chapters/:chapterId/quests', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        const data = createQuestSchema.parse(req.body);
        const result = await db.query(
            `INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [chapterId, data.slug, data.title, data.description, data.sort_order, data.is_mandatory]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

router.patch('/quests/:id', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateQuestSchema.parse(req.body);
        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined) { fields.push(`${key} = $${idx++}`); values.push(val); }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const result = await db.query(`UPDATE journey_quests SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Quest not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/quests/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const result = await db.query(`DELETE FROM journey_quests WHERE id = $1 RETURNING *`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Quest not found' });
        res.json({ success: true, message: 'Quest deleted' });
    } catch (err) { next(err); }
});

// ============================================================================
// Admin Endpoints — Task CRUD
// ============================================================================

router.post('/quests/:questId/tasks', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { questId } = req.params;
        const data = createTaskSchema.parse(req.body);
        const result = await db.query(
            `INSERT INTO journey_tasks (quest_id, slug, title, description, instructions, validation_type, validation_config, sort_order, is_mandatory, estimated_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [questId, data.slug, data.title, data.description, data.instructions, data.validation_type, JSON.stringify(data.validation_config), data.sort_order, data.is_mandatory, data.estimated_minutes]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

router.patch('/tasks/:id', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateTaskSchema.parse(req.body);
        const fields = [];
        const values = [];
        let idx = 1;
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined) {
                if (key === 'validation_config') {
                    fields.push(`${key} = $${idx++}`);
                    values.push(JSON.stringify(val));
                } else {
                    fields.push(`${key} = $${idx++}`);
                    values.push(val);
                }
            }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const result = await db.query(`UPDATE journey_tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/tasks/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const result = await db.query(`DELETE FROM journey_tasks WHERE id = $1 RETURNING *`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
        res.json({ success: true, message: 'Task deleted' });
    } catch (err) { next(err); }
});

// ============================================================================
// Admin — Assign journey to user
// ============================================================================

router.post('/:id/assign/:userId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const result = await db.query(
            `INSERT INTO user_journey_assignments (user_id, journey_id) VALUES ($1, $2)
             ON CONFLICT (user_id, journey_id) DO NOTHING RETURNING *`,
            [userId, id]
        );
        if (result.rows.length === 0) {
            return res.json({ message: 'Journey already assigned' });
        }
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

module.exports = router;
