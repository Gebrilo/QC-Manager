/**
 * Tuleap Webhook API Routes
 * Receives processed webhook data from n8n for bugs, test cases, and tasks
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const pool = db.pool;

function findDuplicateValues(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const valueToKeys = {};
    for (const [k, v] of Object.entries(obj)) {
        if (!valueToKeys[v]) valueToKeys[v] = [];
        valueToKeys[v].push(k);
    }
    return Object.entries(valueToKeys)
        .filter(([, keys]) => keys.length > 1)
        .map(([value, keys]) => ({ value, keys }));
}

const { fromTuleap } = require('../services/tuleapTransformEngine');
const { dispatchAction: dispatchBug } = require('../services/persisters/bug');
const { dispatchAction: dispatchTask } = require('../services/persisters/task');
const { dispatchAction: dispatchUserStory } = require('../services/persisters/user_story');
const { dispatchAction: dispatchTestCase } = require('../services/persisters/test_case');
const { reconcileDeletes } = require('../services/tuleapReconcileDeletes');
const { normalize } = require('../services/tuleapValueNormalizer');



// =====================================================
// HELPER: Find-or-create QC project + sync config from Tuleap project data
// Returns { project, syncConfig, createdProject, createdConfig }
// =====================================================
async function provisionTuleapProject({ tuleap_project_id, tuleap_project_name, tuleap_short_name, tuleap_tracker_id, tracker_type = 'task' }) {
    if (!tuleap_project_id) return null;

    // Find or create QC project
    let project, createdProject = false;
    const existing = await pool.query(
        'SELECT * FROM projects WHERE tuleap_project_id = $1 AND deleted_at IS NULL LIMIT 1',
        [tuleap_project_id]
    );
    if (existing.rows.length > 0) {
        project = existing.rows[0];
    } else {
        const res = await pool.query(
            `INSERT INTO projects (project_name, tuleap_project_id, tuleap_short_name, status, created_by)
             VALUES ($1, $2, $3, 'active', 'tuleap-sync')
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [tuleap_project_name || `Tuleap Project ${tuleap_project_id}`, tuleap_project_id, tuleap_short_name || null]
        );
        project = res.rows[0];
        createdProject = true;
    }
    if (!project) return null;

    // Find or create sync config for this tracker (if tracker info provided)
    let syncConfig = null, createdConfig = false;
    if (tuleap_tracker_id) {
        const existingConfig = await pool.query(
            'SELECT * FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND tuleap_project_id = $2 AND is_active = true LIMIT 1',
            [tuleap_tracker_id, tuleap_project_id]
        );
        if (existingConfig.rows.length > 0) {
            syncConfig = existingConfig.rows[0];
        } else {
            const configRes = await pool.query(
                `INSERT INTO tuleap_sync_config (tuleap_tracker_id, tuleap_project_id, qc_project_id, tracker_type, is_active)
                 VALUES ($1, $2, $3, $4, true)
                 ON CONFLICT DO NOTHING
                 RETURNING *`,
                [tuleap_tracker_id, tuleap_project_id, project.id, tracker_type]
            );
            syncConfig = configRes.rows[0];
            createdConfig = true;
        }
    }

    return { project, syncConfig, createdProject, createdConfig };
}

// =====================================================
// POST /tuleap-webhook/project
// Receive Tuleap project creation/update webhook
// Payload format: { event_name, project_id, name, path, owner_email, owner_name }
// =====================================================
router.post('/project', async (req, res) => {
    try {
        const body = req.body;

        // Support both direct JSON and form-encoded payload wrapping
        let payload = body;
        if (body.payload) {
            payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
        }

        const tuleap_project_id = payload.project_id;
        const tuleap_project_name = payload.name;
        const tuleap_short_name = payload.path;
        const event_name = payload.event_name || 'project_sync';

        if (!tuleap_project_id) {
            return res.status(400).json({ success: false, error: 'project_id is required' });
        }

        const result = await provisionTuleapProject({
            tuleap_project_id,
            tuleap_project_name,
            tuleap_short_name,
        });

        if (!result) {
            return res.status(500).json({ success: false, error: 'Failed to provision project' });
        }

        console.log(`Tuleap project ${event_name}: ${tuleap_project_name} (${tuleap_project_id}) → QC project ${result.project.id} (created: ${result.createdProject})`);

        return res.status(result.createdProject ? 201 : 200).json({
            success: true,
            action: result.createdProject ? 'created' : 'exists',
            data: result.project
        });
    } catch (error) {
        console.error('Error processing project webhook:', error);
        res.status(500).json({ success: false, error: 'Failed to process project webhook', message: error.message });
    }
});



// =====================================================
// HELPER: Log webhook to database
// =====================================================
async function logWebhook(data) {
    const {
        tuleap_artifact_id,
        tuleap_tracker_id,
        artifact_type,
        action,
        payload_hash,
        raw_payload,
        processing_status = 'received',
        processing_result = null,
        error_message = null
    } = data;

    try {
        await pool.query(`
            INSERT INTO tuleap_webhook_log (
                tuleap_artifact_id, tuleap_tracker_id, artifact_type, action,
                payload_hash, raw_payload, processing_status, processing_result, error_message, processed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (tuleap_artifact_id, payload_hash) DO UPDATE SET
                processing_status = EXCLUDED.processing_status,
                processing_result = EXCLUDED.processing_result,
                error_message = EXCLUDED.error_message,
                processed_at = NOW()
        `, [
            tuleap_artifact_id, tuleap_tracker_id, artifact_type, action,
            payload_hash, raw_payload, processing_status, processing_result, error_message,
            processing_status === 'received' ? null : new Date()
        ]);
    } catch (err) {
        console.error('Error logging webhook:', err);
    }
}



// =====================================================
// GET /tuleap-webhook/task-history
// List archived/rejected tasks
// =====================================================
router.get('/task-history', async (req, res) => {
    try {
        const { project_id, action, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT
                h.*,
                p.project_name
            FROM tuleap_task_history h
            LEFT JOIN projects p ON h.project_id = p.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (project_id) {
            query += ` AND h.project_id = $${paramIndex}`;
            params.push(project_id);
            paramIndex++;
        }

        if (action) {
            query += ` AND h.action = $${paramIndex}`;
            params.push(action);
            paramIndex++;
        }

        query += ` ORDER BY h.created_at DESC`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) FROM tuleap_task_history WHERE 1=1`;
        const countParams = [];
        let countIndex = 1;
        if (project_id) {
            countQuery += ` AND project_id = $${countIndex}`;
            countParams.push(project_id);
            countIndex++;
        }
        if (action) {
            countQuery += ` AND action = $${countIndex}`;
            countParams.push(action);
        }
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            count: result.rows.length,
            total: parseInt(countResult.rows[0].count),
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching task history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch task history',
            message: error.message
        });
    }
});

// =====================================================
// GET /tuleap-webhook/config
// Get sync configurations
// =====================================================
router.get('/config', async (req, res) => {
    try {
        const { tracker_type, is_active } = req.query;

        let query = `
            SELECT
                c.*,
                p.project_name as qc_project_name
            FROM tuleap_sync_config c
            LEFT JOIN projects p ON c.qc_project_id = p.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (tracker_type) {
            query += ` AND c.tracker_type = $${paramIndex}`;
            params.push(tracker_type);
            paramIndex++;
        }

        if (is_active !== undefined) {
            query += ` AND c.is_active = $${paramIndex}`;
            params.push(is_active === 'true');
        }

        query += ` ORDER BY c.created_at DESC`;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching sync config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sync configuration',
            message: error.message
        });
    }
});

// =====================================================
// GET /tuleap-webhook/config/unconfigured
// Returns tracker_ids from webhook_log that have no matching sync config
// =====================================================
router.get('/config/unconfigured', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                wl.tuleap_tracker_id,
                MAX(wl.tuleap_artifact_id) as latest_artifact_id,
                MAX(wl.created_at) as latest_attempt,
                COUNT(*) as attempt_count
            FROM tuleap_webhook_log wl
            WHERE wl.tuleap_tracker_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM tuleap_sync_config c
                WHERE c.tuleap_tracker_id = wl.tuleap_tracker_id AND c.is_active = true
              )
            GROUP BY wl.tuleap_tracker_id
            ORDER BY latest_attempt DESC
        `);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows,
        });
    } catch (error) {
        console.error('Error fetching unconfigured trackers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch unconfigured trackers',
            message: error.message,
        });
    }
});

// =====================================================
// POST /tuleap-webhook/config
// Create/update sync configuration
// =====================================================
router.post('/config', async (req, res) => {
    try {
        const {
            tuleap_project_id,
            tuleap_tracker_id,
            tuleap_base_url,
            tracker_type,
            qc_project_id,
            field_mappings = {},
            status_mappings = {},
            artifact_fields = {},
            status_value_map = {},
            is_active = true
        } = req.body;

        if (!tuleap_project_id || !tuleap_tracker_id || !tracker_type) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_project_id, tuleap_tracker_id, and tracker_type are required'
            });
        }

        const dupeCheck = findDuplicateValues(artifact_fields);
        if (dupeCheck.length > 0) {
            return res.status(400).json({
                success: false,
                error: `artifact_fields has duplicate mappings: ${dupeCheck.map(d => `"${d.value}" mapped from keys: ${d.keys.map(k => `"${k}"`).join(', ')}`).join('; ')}`,
                duplicates: dupeCheck,
            });
        }

        const result = await pool.query(`
            INSERT INTO tuleap_sync_config (
                tuleap_project_id, tuleap_tracker_id, tuleap_base_url, tracker_type,
                qc_project_id, field_mappings, status_mappings, artifact_fields, status_value_map, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (tuleap_project_id, tuleap_tracker_id) DO UPDATE SET
                tuleap_base_url = EXCLUDED.tuleap_base_url,
                tracker_type = EXCLUDED.tracker_type,
                qc_project_id = EXCLUDED.qc_project_id,
                field_mappings = EXCLUDED.field_mappings,
                status_mappings = EXCLUDED.status_mappings,
                artifact_fields = EXCLUDED.artifact_fields,
                status_value_map = EXCLUDED.status_value_map,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
            RETURNING *
        `, [
            tuleap_project_id, tuleap_tracker_id, tuleap_base_url, tracker_type,
            qc_project_id, field_mappings, status_mappings, artifact_fields, status_value_map, is_active
        ]);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error saving sync config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save sync configuration',
            message: error.message
        });
    }
});

// =====================================================
// PUT /tuleap-webhook/config/:id
// Update sync configuration
// =====================================================
router.put('/config/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (req.body.artifact_fields !== undefined) {
            const dupeCheck = findDuplicateValues(req.body.artifact_fields);
            if (dupeCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `artifact_fields has duplicate mappings: ${dupeCheck.map(d => `"${d.value}" mapped from keys: ${d.keys.map(k => `"${k}"`).join(', ')}`).join('; ')}`,
                    duplicates: dupeCheck,
                });
            }
            updates.push(`artifact_fields = $${paramIdx++}`);
            values.push(JSON.stringify(req.body.artifact_fields));
        }
        if (req.body.status_value_map !== undefined) {
            updates.push(`status_value_map = $${paramIdx++}`);
            values.push(JSON.stringify(req.body.status_value_map));
        }
        if (req.body.tracker_type !== undefined) {
            updates.push(`tracker_type = $${paramIdx++}`);
            values.push(req.body.tracker_type);
        }
        if (req.body.tuleap_tracker_id !== undefined) {
            updates.push(`tuleap_tracker_id = $${paramIdx++}`);
            values.push(req.body.tuleap_tracker_id);
        }
        if (req.body.tuleap_project_id !== undefined) {
            updates.push(`tuleap_project_id = $${paramIdx++}`);
            values.push(req.body.tuleap_project_id);
        }
        if (req.body.is_active !== undefined) {
            updates.push(`is_active = $${paramIdx++}`);
            values.push(req.body.is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await pool.query(
            `UPDATE tuleap_sync_config SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Config not found' });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating sync config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update sync configuration',
            message: error.message
        });
    }
});

// =====================================================
// DELETE /tuleap-webhook/config/:id
// Soft-delete sync configuration
// =====================================================
router.delete('/config/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE tuleap_sync_config SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Config not found' });
        }
        return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error deleting sync config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete sync configuration',
            message: error.message
        });
    }
});

// =====================================================
// POST /tuleap-webhook/config/test-connection
// Validate a Tuleap tracker by calling the Tuleap API
// =====================================================
router.post('/config/test-connection', async (req, res) => {
    try {
        const { tuleap_base_url, tuleap_tracker_id, access_key } = req.body;

        if (!tuleap_tracker_id) {
            return res.status(400).json({ success: false, error: 'tuleap_tracker_id is required' });
        }

        const { createTuleapClient } = require('../services/tuleapClient');
        const client = createTuleapClient({
            baseURL: tuleap_base_url || process.env.TULEAP_BASE_URL,
            accessKey: access_key || process.env.TULEAP_ACCESS_KEY
        });
        const response = await client.get(`/trackers/${tuleap_tracker_id}`);
        const tracker = response.data;
        const fields = (tracker.fields || []).map(f => ({
            field_id: f.field_id,
            name: f.name,
            label: f.label,
            type: f.type,
            values: (Array.isArray(f.values) ? f.values : []).map(v => ({ id: v.id, label: v.label })),
        }));

        return res.json({
            success: true,
            tracker: {
                id: tracker.id,
                name: tracker.name,
                item_name: tracker.item_name,
                fields,
            },
        });
    } catch (err) {
        console.error('Error testing Tuleap connection:', err);
        return res.status(err.status || 502).json({
            success: false,
            error: err.message,
            tuleap_status: err.status,
        });
    }
});

// =====================================================
// GET /tuleap-webhook/config/discover/:trackerId
// Auto-discover field mappings by fetching tracker schema
// =====================================================
router.get('/config/discover/:trackerId', async (req, res) => {
    try {
        const { trackerId } = req.params;

        const { defaultRegistry } = require('../services/tuleapFieldRegistry');
        const fields = await defaultRegistry._load(trackerId);
        const fieldList = [];
        for (const [name, field] of fields) {
            fieldList.push({
                field_id: field.field_id,
                name: field.name,
                label: field.label,
                type: field.type,
                values: (Array.isArray(field.values) ? field.values : []).map(v => ({ id: v.id, label: v.label })),
            });
        }

        // Suggest mappings based on name similarity with base field mappings
        const { BASE_FIELD_MAPPINGS } = require('../services/tuleapTransformEngine');
        const suggestions = {};
        const allBaseMappings = { ...BASE_FIELD_MAPPINGS.bug, ...BASE_FIELD_MAPPINGS.task, ...BASE_FIELD_MAPPINGS.user_story, ...BASE_FIELD_MAPPINGS.test_case };

        for (const [tuleapName, field] of fields) {
            const unifiedName = allBaseMappings[tuleapName];
            if (unifiedName) {
                suggestions[tuleapName] = unifiedName;
            } else {
                // Try fuzzy match on label
                const label = (field.label || '').toLowerCase();
                const knownUnifiedNames = [...new Set(Object.values(allBaseMappings))];
                for (const unified of knownUnifiedNames) {
                    if (label.includes(unified.replace('_', ' '))) {
                        suggestions[tuleapName] = unified;
                        break;
                    }
                }
            }
        }

        return res.json({
            tracker_id: Number(trackerId),
            fields: fieldList,
            suggested_mappings: suggestions,
        });
    } catch (err) {
        console.error('Error discovering tracker fields:', err);
        return res.status(err.status || 500).json({
            success: false,
            error: err.message,
            tuleap_status: err.status,
        });
    }
});

// =====================================================
// GET /tuleap-webhook/resources
// Get resources for mapping (used by n8n to lookup assignees)
// =====================================================
router.get('/resources', async (req, res) => {
    try {
        const { name, email } = req.query;

        let query = `SELECT id, resource_name, email FROM resources WHERE deleted_at IS NULL`;
        const params = [];

        if (name) {
            query += ` AND LOWER(resource_name) = LOWER($1)`;
            params.push(name);
        } else if (email) {
            query += ` AND LOWER(email) = LOWER($1)`;
            params.push(email);
        }

        query += ` ORDER BY resource_name`;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching resources:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch resources',
            message: error.message
        });
    }
});



// =====================================================
// POST /tuleap-webhook/unified
// Unified webhook handler for all Tuleap artifact types
// Receives raw Tuleap artifact payload and transforms it
// =====================================================
router.post('/unified', async (req, res) => {
    try {
        const { tracker_id, artifact, project, raw_payload, action = 'sync' } = req.body;

        if (!tracker_id) {
            return res.status(400).json({ success: false, error: 'tracker_id is required' });
        }

        let configRes = await pool.query(
            'SELECT * FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND is_active = true LIMIT 1',
            [tracker_id]
        );
        let syncConfig = configRes.rows[0];

        if (!syncConfig) {
            return res.status(404).json({
                success: false,
                error: 'Unconfigured',
                tracker_id,
                tuleap_project_id: project?.id || req.body.tuleap_project_id || null,
            });
        }

        let tuleapValues = {};
        if (artifact && Array.isArray(artifact.values)) {
            tuleapValues = normalize(artifact, null);
        } else if (raw_payload && typeof raw_payload === 'object') {
            tuleapValues = raw_payload;
        }

        const unified = fromTuleap(tuleapValues, syncConfig);

        unified.project_id = syncConfig.qc_project_id;
        if (!unified.tuleap) unified.tuleap = {};
        unified.tuleap.project_id = syncConfig.tuleap_project_id;
        unified.tuleap.tracker_id = syncConfig.tuleap_tracker_id;
        if (artifact && artifact.id) {
            unified.tuleap.artifact_id = artifact.id;
        }
        if (req.body.tuleap_url) {
            unified.tuleap.url = req.body.tuleap_url;
        }

        unified.action = action;

        const payloadHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
        const tuleapArtifactId = artifact && artifact.id ? artifact.id : null;
        await pool.query(`
            INSERT INTO tuleap_webhook_log (
                tuleap_artifact_id, tuleap_tracker_id, artifact_type, action,
                payload_hash, raw_payload, processing_status, processed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (tuleap_artifact_id, payload_hash) DO UPDATE SET
                processing_status = 'duplicate',
                processed_at = NOW()
        `, [
            tuleapArtifactId, tracker_id, syncConfig.tracker_type || 'unknown', action,
            payloadHash, JSON.stringify(req.body), 'received', null
        ]);

        const validBugActions = ['sync', 'delete'];
        const validTaskActions = ['sync', 'delete', 'reject', 'archive'];
        const validUserStoryActions = ['sync', 'delete'];
        const validTestCaseActions = ['sync', 'delete'];
        const isBug = syncConfig.tracker_type === 'bug';
        const isTask = syncConfig.tracker_type === 'task';
        const isUserStory = syncConfig.tracker_type === 'user_story';
        const isTestCase = syncConfig.tracker_type === 'test_case';

        if (isBug && !validBugActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type 'bug'. Allowed: sync, delete` });
        }
        if (isTask && !validTaskActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type 'task'. Allowed: sync, delete, reject, archive` });
        }
        if (isUserStory && !validUserStoryActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type 'user_story'. Allowed: sync, delete` });
        }
        if (isTestCase && !validTestCaseActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type 'test_case'. Allowed: sync, delete` });
        }
        if (!isBug && !isTask && !isUserStory && !isTestCase && !validBugActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type '${syncConfig.tracker_type}'. Allowed: sync, delete` });
        }

        if (isBug) {
            const result = await dispatchBug(unified, syncConfig, { query: pool.query.bind(pool) });

            await pool.query(
                "UPDATE tuleap_webhook_log SET processing_status = 'processed', processed_at = NOW() WHERE tuleap_artifact_id = $1 AND payload_hash = $2",
                [tuleapArtifactId, payloadHash]
            );

            const statusCode = result.action === 'created' ? 201 : 200;
            return res.status(statusCode).json({
                success: true,
                artifact_type: syncConfig.tracker_type,
                tracker_id,
                action: result.action,
                id: result.id,
                unified,
            });
        }

        if (isTask) {
            const result = await dispatchTask(unified, syncConfig, { query: pool.query.bind(pool) });

            await pool.query(
                "UPDATE tuleap_webhook_log SET processing_status = 'processed', processed_at = NOW() WHERE tuleap_artifact_id = $1 AND payload_hash = $2",
                [tuleapArtifactId, payloadHash]
            );

            const statusCode = ['created', 'revived'].includes(result.action) ? 201 : 200;
            return res.status(statusCode).json({
                success: true,
                artifact_type: syncConfig.tracker_type,
                tracker_id,
                action: result.action,
                id: result.id,
                message: result.message,
                unified,
            });
        }

         if (isUserStory) {
             const result = await dispatchUserStory(unified, syncConfig, { query: pool.query.bind(pool) });

             await pool.query(
                 "UPDATE tuleap_webhook_log SET processing_status = 'processed', processed_at = NOW() WHERE tuleap_artifact_id = $1 AND payload_hash = $2",
                 [tuleapArtifactId, payloadHash]
             );

             const statusCode = ['created', 'revived'].includes(result.action) ? 201 : 200;
             return res.status(statusCode).json({
                 success: true,
                 artifact_type: syncConfig.tracker_type,
                 tracker_id,
                 action: result.action,
                 id: result.id,
                 unified,
             });
         }

         if (isTestCase) {
             const result = await dispatchTestCase(unified, syncConfig, { query: pool.query.bind(pool) });

             await pool.query(
                 "UPDATE tuleap_webhook_log SET processing_status = 'processed', processed_at = NOW() WHERE tuleap_artifact_id = $1 AND payload_hash = $2",
                 [tuleapArtifactId, payloadHash]
             );

             const statusCode = ['created', 'revived'].includes(result.action) ? 201 : 200;
             return res.status(statusCode).json({
                 success: true,
                 artifact_type: syncConfig.tracker_type,
                 tracker_id,
                 action: result.action,
                 id: result.id,
                 message: result.message,
                 unified,
             });
         }

        return res.status(200).json({
            success: true,
            artifact_type: syncConfig.tracker_type,
            tracker_id,
            action,
            unified
        });
    } catch (error) {
        console.error('Error processing unified webhook:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, error: 'Failed to process unified webhook', message: error.message });
    }
});

// =====================================================
// POST /tuleap-webhook/reconcile-deletes
// Receive a complete present-artifact-id list from n8n's reconcile workflow
// and soft-delete QC rows whose Tuleap counterpart has gone missing for >= 2 cycles.
// =====================================================
router.post('/reconcile-deletes', async (req, res) => {
    try {
        const { tuleap_tracker_id, qc_project_id, tracker_type, present_artifact_ids, page_count, truncated } = req.body;

        if (!tuleap_tracker_id || !qc_project_id || !tracker_type || !Array.isArray(present_artifact_ids)) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_tracker_id, qc_project_id, tracker_type, and present_artifact_ids[] are required',
            });
        }

        if (truncated) {
            console.warn(`[reconcile-deletes] paginate_truncated tracker_id=${tuleap_tracker_id} pages=${page_count} — refusing to diff (would false-positive)`);
            return res.status(202).json({
                success: true,
                aborted: true,
                abortedReason: 'pagination_truncated',
                tuleap_tracker_id,
            });
        }

        const dispatchByType = {
            bug: dispatchBug,
            task: dispatchTask,
            user_story: dispatchUserStory,
            test_case: dispatchTestCase,
        };

        if (!dispatchByType[tracker_type]) {
            return res.status(400).json({ success: false, error: `Unsupported tracker_type: ${tracker_type}` });
        }

        const result = await reconcileDeletes({
            presentIds: present_artifact_ids,
            qcProjectId: qc_project_id,
            trackerType: tracker_type,
            pool,
            dispatchByType,
            maxMissingPerCycle: parseInt(process.env.TULEAP_RECONCILE_MAX_MISSING || '50', 10),
            confirmThreshold: parseInt(process.env.TULEAP_RECONCILE_CONFIRM_THRESHOLD || '2', 10),
        });

        if (result.aborted) {
            console.warn(`[reconcile-deletes] aborted tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} reason="${result.abortedReason}"`);
        }
        if (result.suspected.length > 0) {
            console.log(`[reconcile-deletes] suspected_missing tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} count=${result.suspected.length} ids=${JSON.stringify(result.suspected)}`);
        }
        if (result.confirmedDeletes.length > 0) {
            console.log(`[reconcile-deletes] confirmed_deletes tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} count=${result.confirmedDeletes.length} ids=${JSON.stringify(result.confirmedDeletes)}`);
        }
        if (result.recovered.length > 0) {
            console.log(`[reconcile-deletes] recovered tracker_id=${tuleap_tracker_id} tracker_type=${tracker_type} count=${result.recovered.length} ids=${JSON.stringify(result.recovered)}`);
        }

        return res.status(200).json({
            success: true,
            tuleap_tracker_id,
            tracker_type,
            qc_project_id,
            present_count: present_artifact_ids.length,
            ...result,
        });
    } catch (error) {
        console.error('[reconcile-deletes] unhandled_error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to reconcile deletes',
            message: error.message,
        });
    }
});

module.exports = router;
