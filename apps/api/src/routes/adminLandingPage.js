const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auditLog } = require('../middleware/audit');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const {
    changelogCreateSchema,
    changelogUpdateSchema,
    featureCreateSchema,
    featureUpdateSchema,
    landingConfigSchema,
    roadmapCreateSchema,
    roadmapUpdateSchema,
} = require('../schemas/landingPage');

const CONFIG_FIELDS = [
    'hero_title',
    'hero_subtitle',
    'hero_cta_label',
    'hero_cta_url',
    'hero_secondary_cta_label',
    'hero_secondary_cta_url',
    'marketing_intro_title',
    'marketing_intro_description',
    'show_features',
    'show_roadmap',
    'show_changelog',
    'show_footer_cta',
    'footer_cta_title',
    'footer_cta_description',
    'footer_cta_label',
    'footer_cta_url',
    'is_public',
];

const FEATURE_FIELDS = ['title', 'description', 'icon_key', 'display_order', 'is_active'];
const ROADMAP_FIELDS = [
    'title',
    'description',
    'status',
    'priority',
    'target_date',
    'completion_date',
    'display_order',
    'is_public',
    'source_reference',
];
const CHANGELOG_FIELDS = [
    'version_number',
    'title',
    'content_markdown',
    'published_at',
    'is_published',
    'generated_by_ai',
    'source',
    'source_reference',
];

router.use(requireAuth, requirePermission('qc.admin.landing_page.manage'));

function actorEmail(req) {
    return req.user?.email || req.user?.id || 'system';
}

function validationError(res, parsed) {
    return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues.map(issue => ({
            path: issue.path,
            message: issue.message,
        })),
    });
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function writableEntries(data, fields) {
    return fields
        .filter(field => hasOwn(data, field) && data[field] !== undefined)
        .map(field => [field, data[field]]);
}

async function ensureConfigRow() {
    const existing = await db.query(`
        SELECT *
        FROM landing_page_config
        ORDER BY created_at ASC
        LIMIT 1
    `);
    if (existing.rows[0]) return existing.rows[0];

    const created = await db.query(`
        INSERT INTO landing_page_config (created_by, updated_by)
        VALUES ('system', 'system')
        RETURNING *
    `);
    return created.rows[0];
}

async function insertRow(tableName, data, fields, actor) {
    const entries = writableEntries(data, fields);
    const columns = entries.map(([field]) => field);
    const values = entries.map(([, value]) => value);

    columns.push('created_by', 'updated_by');
    values.push(actor, actor);

    const placeholders = values.map((_, index) => `$${index + 1}`);
    const result = await db.query(
        `INSERT INTO ${tableName} (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values
    );
    return result.rows[0];
}

async function updateRow(tableName, id, data, fields, actor) {
    const entries = writableEntries(data, fields);
    if (entries.length === 0) return null;

    const setClauses = [];
    const values = [];
    entries.forEach(([field, value], index) => {
        setClauses.push(`${field} = $${index + 1}`);
        values.push(value);
    });

    setClauses.push(`updated_at = NOW()`);
    values.push(actor);
    setClauses.push(`updated_by = $${values.length}`);
    values.push(id);

    const result = await db.query(
        `UPDATE ${tableName}
         SET ${setClauses.join(', ')}
         WHERE id = $${values.length}
         RETURNING *`,
        values
    );
    return result.rows[0] || null;
}

async function getRow(tableName, id) {
    const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
    return result.rows[0] || null;
}

async function deleteRow(tableName, id) {
    const result = await db.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING *`, [id]);
    return result.rows[0] || null;
}

router.get('/config', async (_req, res, next) => {
    try {
        res.json(await ensureConfigRow());
    } catch (err) {
        next(err);
    }
});

router.put('/config', async (req, res, next) => {
    try {
        const parsed = landingConfigSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);

        const existing = await ensureConfigRow();
        const entries = writableEntries(parsed.data, CONFIG_FIELDS);
        const values = entries.map(([, value]) => value);
        const setClauses = entries.map(([field], index) => `${field} = $${index + 1}`);

        values.push(actorEmail(req));
        setClauses.push(`updated_at = NOW()`);
        setClauses.push(`updated_by = $${values.length}`);
        values.push(existing.id);

        const result = await db.query(
            `UPDATE landing_page_config
             SET ${setClauses.join(', ')}
             WHERE id = $${values.length}
             RETURNING *`,
            values
        );
        const updated = result.rows[0];
        await auditLog('landing_page_config', updated.id, 'UPDATE', updated, existing, actorEmail(req));
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

router.get('/features', async (_req, res, next) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM landing_page_features
            ORDER BY display_order ASC, created_at ASC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.post('/features', async (req, res, next) => {
    try {
        const parsed = featureCreateSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);

        const created = await insertRow('landing_page_features', parsed.data, FEATURE_FIELDS, actorEmail(req));
        await auditLog('landing_page_features', created.id, 'CREATE', created, null, actorEmail(req));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
});

router.get('/features/:id', async (req, res, next) => {
    try {
        const row = await getRow('landing_page_features', req.params.id);
        if (!row) return res.status(404).json({ error: 'Feature not found' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

router.put('/features/:id', async (req, res, next) => {
    try {
        const parsed = featureUpdateSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);
        if (writableEntries(parsed.data, FEATURE_FIELDS).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const existing = await getRow('landing_page_features', req.params.id);
        if (!existing) return res.status(404).json({ error: 'Feature not found' });

        const updated = await updateRow('landing_page_features', req.params.id, parsed.data, FEATURE_FIELDS, actorEmail(req));
        await auditLog('landing_page_features', updated.id, 'UPDATE', updated, existing, actorEmail(req));
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

router.delete('/features/:id', async (req, res, next) => {
    try {
        const deleted = await deleteRow('landing_page_features', req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Feature not found' });
        await auditLog('landing_page_features', deleted.id, 'DELETE', null, deleted, actorEmail(req));
        res.json({ success: true, id: deleted.id });
    } catch (err) {
        next(err);
    }
});

router.get('/roadmap', async (_req, res, next) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM roadmap_items
            ORDER BY
                CASE status
                    WHEN 'in_progress' THEN 1
                    WHEN 'planned' THEN 2
                    WHEN 'completed' THEN 3
                    ELSE 4
                END,
                display_order ASC,
                created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.post('/roadmap', async (req, res, next) => {
    try {
        const parsed = roadmapCreateSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);

        const created = await insertRow('roadmap_items', parsed.data, ROADMAP_FIELDS, actorEmail(req));
        await auditLog('roadmap_items', created.id, 'CREATE', created, null, actorEmail(req));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
});

router.get('/roadmap/:id', async (req, res, next) => {
    try {
        const row = await getRow('roadmap_items', req.params.id);
        if (!row) return res.status(404).json({ error: 'Roadmap item not found' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

router.put('/roadmap/:id', async (req, res, next) => {
    try {
        const parsed = roadmapUpdateSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);
        if (writableEntries(parsed.data, ROADMAP_FIELDS).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const existing = await getRow('roadmap_items', req.params.id);
        if (!existing) return res.status(404).json({ error: 'Roadmap item not found' });

        const updated = await updateRow('roadmap_items', req.params.id, parsed.data, ROADMAP_FIELDS, actorEmail(req));
        await auditLog('roadmap_items', updated.id, 'UPDATE', updated, existing, actorEmail(req));
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

router.delete('/roadmap/:id', async (req, res, next) => {
    try {
        const deleted = await deleteRow('roadmap_items', req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Roadmap item not found' });
        await auditLog('roadmap_items', deleted.id, 'DELETE', null, deleted, actorEmail(req));
        res.json({ success: true, id: deleted.id });
    } catch (err) {
        next(err);
    }
});

router.get('/changelog', async (_req, res, next) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM changelog_entries
            ORDER BY published_at DESC NULLS LAST, created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.post('/changelog', async (req, res, next) => {
    try {
        const parsed = changelogCreateSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);

        const created = await insertRow('changelog_entries', parsed.data, CHANGELOG_FIELDS, actorEmail(req));
        await auditLog('changelog_entries', created.id, 'CREATE', created, null, actorEmail(req));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
});

router.get('/changelog/:id', async (req, res, next) => {
    try {
        const row = await getRow('changelog_entries', req.params.id);
        if (!row) return res.status(404).json({ error: 'Changelog entry not found' });
        res.json(row);
    } catch (err) {
        next(err);
    }
});

router.put('/changelog/:id', async (req, res, next) => {
    try {
        const parsed = changelogUpdateSchema.safeParse(req.body);
        if (!parsed.success) return validationError(res, parsed);
        if (writableEntries(parsed.data, CHANGELOG_FIELDS).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const existing = await getRow('changelog_entries', req.params.id);
        if (!existing) return res.status(404).json({ error: 'Changelog entry not found' });

        const updated = await updateRow('changelog_entries', req.params.id, parsed.data, CHANGELOG_FIELDS, actorEmail(req));
        await auditLog('changelog_entries', updated.id, 'UPDATE', updated, existing, actorEmail(req));
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

router.delete('/changelog/:id', async (req, res, next) => {
    try {
        const deleted = await deleteRow('changelog_entries', req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Changelog entry not found' });
        await auditLog('changelog_entries', deleted.id, 'DELETE', null, deleted, actorEmail(req));
        res.json({ success: true, id: deleted.id });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
