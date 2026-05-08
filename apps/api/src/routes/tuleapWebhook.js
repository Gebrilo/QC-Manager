/**
 * Tuleap Webhook API Routes
 * Receives processed webhook data from n8n for bugs, test cases, and tasks
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const pool = db.pool;
const { auditLog } = require('../middleware/audit');
const { fromTuleap } = require('../services/tuleapTransformEngine');
const { dispatchAction: dispatchBug } = require('../services/persisters/bug');
const { dispatchAction: dispatchTask } = require('../services/persisters/task');
const { normalize } = require('../services/tuleapValueNormalizer');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeUuidArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(v => typeof v === 'string' && UUID_REGEX.test(v));
}

// =====================================================
// HELPER: Map Tuleap status labels to QC-Manager task statuses
// Valid QC statuses: 'Backlog', 'In Progress', 'Done', 'Cancelled'
// =====================================================
function mapTuleapStatus(tuleapStatus) {
    if (!tuleapStatus) return 'Backlog';

    const normalized = tuleapStatus.trim().toLowerCase();

    const statusMap = {
        // → Done
        'done': 'Done',
        'closed': 'Done',
        'fixed': 'Done',
        'resolved': 'Done',
        'verified': 'Done',
        'complete': 'Done',
        'completed': 'Done',
        // → In Progress
        'in progress': 'In Progress',
        'ongoing': 'In Progress',
        'on going': 'In Progress',
        'doing': 'In Progress',
        'in review': 'In Progress',
        'review': 'In Progress',
        // → Cancelled
        'cancelled': 'Cancelled',
        'canceled': 'Cancelled',
        'rejected': 'Cancelled',
        "won't fix": 'Cancelled',
        'wont fix': 'Cancelled',
        'invalid': 'Cancelled',
        'abandoned': 'Cancelled',
        // → Backlog (default for todo/open/unknown)
        'todo': 'Backlog',
        'to do': 'Backlog',
        'open': 'Backlog',
        'new': 'Backlog',
        'backlog': 'Backlog',
        'pending': 'Backlog',
        // blocked tasks remain In Progress — they're still being worked on
        'blocked': 'In Progress',
    };

    return statusMap[normalized] || 'Backlog';
}

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
// HELPER: Generate next task ID
// =====================================================
async function generateTaskId() {
    const result = await pool.query(`
        SELECT task_id FROM tasks
        WHERE task_id LIKE 'TSK-%'
        ORDER BY task_id DESC
        LIMIT 1
    `);

    if (result.rows.length === 0) {
        return 'TSK-001';
    }

    const lastId = result.rows[0].task_id;
    const num = parseInt(lastId.replace('TSK-', ''), 10);
    return `TSK-${String(num + 1).padStart(3, '0')}`;
}

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
// POST /tuleap-webhook/bug
// Receive processed bug from n8n
// =====================================================
router.post('/bug', async (req, res) => {
    try {
        const {
            tuleap_artifact_id,
            tuleap_tracker_id,
            tuleap_url,
            title,
            description,
            status = 'Open',
            severity = 'medium',
            priority = 'medium',
            bug_type,
            component,
            project_id,
            linked_test_case_ids: rawTestCaseIds = [],
            linked_test_execution_ids: rawTestExecIds = [],
            reported_by,
            updated_by,
            assigned_to,
            reported_date,
            raw_tuleap_payload,
            source = 'EXPLORATORY',
            submitted_by_email = null,
            submitted_by_username = null,
        } = req.body;

        if (!tuleap_artifact_id || !title) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_artifact_id and title are required'
            });
        }

        const linked_test_case_ids = sanitizeUuidArray(rawTestCaseIds);

        const payload_hash = crypto.createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        await logWebhook({
            tuleap_artifact_id,
            tuleap_tracker_id,
            artifact_type: 'bug',
            action: req.body.action || 'sync',
            payload_hash,
            raw_payload: raw_tuleap_payload
        });

        let syncConfig = null;
        if (tuleap_tracker_id) {
            const configRes = await pool.query(
                'SELECT * FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND is_active = true LIMIT 1',
                [tuleap_tracker_id]
            );
            syncConfig = configRes.rows[0] || null;
        }
        if (!syncConfig && project_id) {
            const configRes = await pool.query(
                "SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'bug' AND is_active = true LIMIT 1",
                [project_id]
            );
            syncConfig = configRes.rows[0] || null;
        }
        if (!syncConfig) {
            syncConfig = {
                tracker_type: 'bug',
                qc_project_id: project_id,
                tuleap_project_id: null,
                tuleap_tracker_id: tuleap_tracker_id,
            };
        }

        const action = req.body.action || 'sync';
        const links = linked_test_case_ids.map(id => ({ type: 'test_case', target_artifact_id: id }));

        const unified = {
            artifact_type: 'bug',
            action,
            project_id: project_id || syncConfig.qc_project_id,
            common: {
                title,
                description,
                status,
                assigned_to,
                priority,
                links: links.length > 0 ? links : undefined,
            },
            fields: {
                severity,
                bug_type,
                component,
                environment: req.body.environment,
                service_name: req.body.service_name,
            },
            tuleap: {
                project_id: syncConfig.tuleap_project_id,
                tracker_id: tuleap_tracker_id,
                artifact_id: tuleap_artifact_id,
                url: tuleap_url,
            },
            reported_by,
            updated_by,
            reported_date,
            raw_payload: raw_tuleap_payload,
        };

        const result = await dispatchBug(unified, syncConfig, { query: pool.query.bind(pool) });

        const actionLabel = result.action;
        await logWebhook({
            tuleap_artifact_id,
            tuleap_tracker_id,
            artifact_type: 'bug',
            action,
            payload_hash,
            raw_payload: raw_tuleap_payload,
            processing_status: 'processed',
            processing_result: `Bug ${actionLabel}: ${result.id || tuleap_artifact_id}`
        });

        if (result.data) {
            await auditLog('bugs', result.id, actionLabel === 'created' ? 'CREATE' : 'UPDATE', result.data, null);
        }

        const statusCode = actionLabel === 'created' ? 201 : 200;
        res.status(statusCode).json({
            success: true,
            action: actionLabel,
            data: result.data || { id: result.id },
        });
    } catch (error) {
        console.error('Error processing bug webhook:', error);
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            error: 'Failed to process bug webhook',
            message: error.message
        });
    }
});

// =====================================================
// POST /tuleap-webhook/test-case
// Receive processed test case from n8n
// =====================================================
router.post('/test-case', async (req, res) => {
    try {
        const {
            tuleap_artifact_id,
            title,
            description,
            priority = 'medium',
            category = 'other',
            status = 'active',
            project_id,
            tags = [],
            raw_tuleap_payload
        } = req.body;

        if (!tuleap_artifact_id || !title) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_artifact_id and title are required'
            });
        }

        // Generate payload hash
        const payload_hash = crypto.createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        // Log webhook
        await logWebhook({
            tuleap_artifact_id,
            artifact_type: 'test_case',
            action: 'sync',
            payload_hash,
            raw_payload: raw_tuleap_payload
        });

        // Check if test case exists (by external ID in tags or a dedicated field)
        // For now, we'll use a simple approach - store tuleap ID in tags
        const tuleapTag = `tuleap:${tuleap_artifact_id}`;
        const existingRes = await pool.query(
            `SELECT id FROM test_case WHERE $1 = ANY(tags)`,
            [tuleapTag]
        );

        let testCase;
        let isUpdate = existingRes.rows.length > 0;

        if (isUpdate) {
            // Update existing test case
            const existingId = existingRes.rows[0].id;
            const result = await pool.query(`
                UPDATE test_case SET
                    title = $1, description = $2, priority = $3, category = $4,
                    status = $5, updated_at = NOW()
                WHERE id = $6
                RETURNING *
            `, [title, description, priority, category, status, existingId]);
            testCase = result.rows[0];
        } else {
            // Create new test case
            const test_case_id = `TC-${String(Date.now()).slice(-6)}`;
            const allTags = [...tags, tuleapTag];
            const result = await pool.query(`
                INSERT INTO test_case (
                    test_case_id, title, description, priority, category, status, project_id, tags
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [test_case_id, title, description, priority, category, status, project_id, allTags]);
            testCase = result.rows[0];
        }

        // Update webhook log
        await logWebhook({
            tuleap_artifact_id,
            artifact_type: 'test_case',
            action: isUpdate ? 'update' : 'create',
            payload_hash,
            raw_payload: raw_tuleap_payload,
            processing_status: 'processed',
            processing_result: `Test case ${isUpdate ? 'updated' : 'created'}: ${testCase.test_case_id}`
        });

        res.status(isUpdate ? 200 : 201).json({
            success: true,
            action: isUpdate ? 'updated' : 'created',
            data: testCase
        });
    } catch (error) {
        console.error('Error processing test case webhook:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process test case webhook',
            message: error.message
        });
    }
});

// =====================================================
// POST /tuleap-webhook/user-story
// Receive processed User Story from n8n — upsert by tuleap_artifact_id
// =====================================================
router.post('/user-story', async (req, res) => {
    try {
        const {
            tuleap_artifact_id,
            title,
            description         = null,
            acceptance_criteria = null,
            status              = 'Draft',
            requirement_version = null,
            priority            = null,
            ba_author           = null,
            project_id          = null,
            raw_tuleap_payload  = null,
        } = req.body;

        if (!tuleap_artifact_id || !title) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_artifact_id and title are required',
            });
        }

        const payload_hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        await pool.query(
            `INSERT INTO tuleap_webhook_log
               (tuleap_artifact_id, artifact_type, action, payload_hash, raw_payload, processing_status)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tuleap_artifact_id, payload_hash) DO NOTHING`,
            [tuleap_artifact_id, 'user_story', 'sync', payload_hash, raw_tuleap_payload, 'received']
        );

        const existing = await pool.query(
            `SELECT id FROM user_stories WHERE tuleap_artifact_id = $1`,
            [tuleap_artifact_id]
        );
        const isUpdate = existing.rows.length > 0;

        let story;
        if (isUpdate) {
            const result = await pool.query(
                `UPDATE user_stories SET
                    title = $1, description = $2, acceptance_criteria = $3,
                    status = $4, requirement_version = $5, priority = $6,
                    ba_author = $7, raw_tuleap_payload = $8,
                    last_sync_at = NOW(), updated_at = NOW()
                 WHERE tuleap_artifact_id = $9
                 RETURNING *`,
                [title, description, acceptance_criteria, status,
                 requirement_version, priority, ba_author,
                 raw_tuleap_payload, tuleap_artifact_id]
            );
            story = result.rows[0];
        } else {
            const result = await pool.query(
                `INSERT INTO user_stories
                   (tuleap_artifact_id, title, description, acceptance_criteria,
                    status, requirement_version, priority, ba_author,
                    project_id, raw_tuleap_payload)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [tuleap_artifact_id, title, description, acceptance_criteria,
                 status, requirement_version, priority, ba_author,
                 project_id, raw_tuleap_payload]
            );
            story = result.rows[0];
        }

        await pool.query(
            `UPDATE tuleap_webhook_log SET
                processing_status = $1, processing_result = $2, processed_at = NOW()
             WHERE tuleap_artifact_id = $3 AND payload_hash = $4`,
            ['processed',
             `User story ${isUpdate ? 'updated' : 'created'}: ${story.id}`,
             tuleap_artifact_id, payload_hash]
        );

        return res.status(isUpdate ? 200 : 201).json({
            success: true,
            action: isUpdate ? 'updated' : 'created',
            data: story,
        });
    } catch (error) {
        console.error('Error processing user story webhook:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process user story webhook',
            message: error.message,
        });
    }
});

// =====================================================
// POST /tuleap-webhook/task
// Thin shim: translate legacy payload → unified → dispatchTask()
// Handles: create, update, delete, reject, archive
// =====================================================
router.post('/task', async (req, res) => {
    try {
        const {
            action,
            tuleap_artifact_id,
            tuleap_url,
            task_name,
            notes,
            tuleap_status,
            resource1_id,
            new_assignee_name,
            action_reason,
            raw_tuleap_payload,
            project_id: bodyProjectId,
        } = req.body;

        if (!tuleap_artifact_id) {
            return res.status(400).json({ success: false, error: 'tuleap_artifact_id is required' });
        }

        const mappedStatus = mapTuleapStatus(tuleap_status);
        const unifiedAction = action === 'create' || action === 'update' ? 'sync' : (action || 'sync');

        const payload_hash = crypto.createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        await logWebhook({
            tuleap_artifact_id,
            artifact_type: 'task',
            action: unifiedAction,
            payload_hash,
            raw_payload: raw_tuleap_payload
        });

        let syncConfig = null;
        if (req.body.tuleap_tracker_id) {
            const configRes = await pool.query(
                'SELECT * FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND is_active = true LIMIT 1',
                [req.body.tuleap_tracker_id]
            );
            syncConfig = configRes.rows[0] || null;
        }
        if (!syncConfig && bodyProjectId) {
            const configRes = await pool.query(
                "SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'task' AND is_active = true LIMIT 1",
                [bodyProjectId]
            );
            syncConfig = configRes.rows[0] || null;
        }
        if (!syncConfig) {
            syncConfig = {
                tracker_type: 'task',
                qc_project_id: bodyProjectId,
                tuleap_project_id: req.body.tuleap_project_id || null,
                tuleap_tracker_id: req.body.tuleap_tracker_id || null,
            };
        }

        const unified = {
            artifact_type: 'task',
            action: unifiedAction,
            project_id: bodyProjectId || syncConfig.qc_project_id,
            common: {
                title: task_name,
                description: notes,
                status: mappedStatus,
                assigned_to: resource1_id,
            },
            fields: {
                new_assignee_name: new_assignee_name,
                action_reason: action_reason,
            },
            tuleap: {
                project_id: req.body.tuleap_project_id || syncConfig.tuleap_project_id,
                tracker_id: req.body.tuleap_tracker_id || syncConfig.tuleap_tracker_id,
                artifact_id: tuleap_artifact_id,
                url: tuleap_url,
            },
            raw_payload: raw_tuleap_payload,
        };

        const result = await dispatchTask(unified, syncConfig, { query: pool.query.bind(pool) });

        const statusCode = ['created', 'revived'].includes(result.action) ? 201 : 200;

        await logWebhook({
            tuleap_artifact_id,
            artifact_type: 'task',
            action: unifiedAction,
            payload_hash,
            raw_payload: raw_tuleap_payload,
            processing_status: 'processed',
            processing_result: `Task ${result.action}: ${result.id || tuleap_artifact_id}`
        });

        if (result.data) {
            await auditLog('tasks', result.id, result.action === 'created' ? 'CREATE' : 'UPDATE', result.data, null);
        }

        res.status(statusCode).json({
            success: true,
            action: result.action,
            data: result.data || { id: result.id },
            message: result.message,
        });
    } catch (error) {
        console.error('Error processing task webhook:', error);
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            error: 'Failed to process task webhook',
            message: error.message
        });
    }
});

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
            values: (f.values || []).map(v => ({ id: v.id, label: v.label })),
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
                values: (field.values || []).map(v => ({ id: v.id, label: v.label })),
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
// POST /tuleap-webhook/bug-deletion-sync
// Bulk deletion sync: receives list of active Tuleap artifact IDs,
// soft-deletes any QC bugs not in the list (orphaned bugs).
// Called by n8n polling workflow.
// =====================================================
router.post('/bug-deletion-sync', async (req, res) => {
    const client = await pool.connect();
    try {
        const { tuleap_tracker_id, active_tuleap_artifact_ids } = req.body;

        if (!tuleap_tracker_id) {
            return res.status(400).json({ success: false, error: 'tuleap_tracker_id is required' });
        }

        // Guard clause: empty list likely means Tuleap API failure — refuse to mass-delete
        if (!Array.isArray(active_tuleap_artifact_ids)) {
            return res.status(400).json({ success: false, error: 'active_tuleap_artifact_ids must be an array' });
        }
        if (active_tuleap_artifact_ids.length === 0) {
            console.warn(`[bug-deletion-sync] Received empty artifact list for tracker ${tuleap_tracker_id} — likely API failure, skipping`);
            await logWebhook({
                tuleap_artifact_id: 0,
                tuleap_tracker_id,
                artifact_type: 'bug',
                action: 'deletion_sync',
                payload_hash: 'guard-empty-list',
                processing_status: 'skipped',
                processing_result: 'Empty artifact list received — refusing to delete'
            });
            return res.status(400).json({
                success: false,
                error: 'Empty artifact list — refusing to delete all bugs (likely Tuleap API failure)'
            });
        }

        await client.query('BEGIN');

        // Find bugs in this tracker that are NOT in the active list
        const orphansRes = await client.query(`
            SELECT id, bug_id, tuleap_artifact_id, title
            FROM bugs
            WHERE tuleap_tracker_id = $1
              AND deleted_at IS NULL
              AND tuleap_artifact_id != ALL($2::integer[])
        `, [tuleap_tracker_id, active_tuleap_artifact_ids]);

        if (orphansRes.rows.length === 0) {
            await client.query('COMMIT');
            return res.json({ success: true, action: 'noop', deleted_count: 0, deleted_bugs: [] });
        }

        // Soft-delete all orphans in one batch
        const orphanIds = orphansRes.rows.map(b => b.id);
        await client.query(`
            UPDATE bugs SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = ANY($1)
        `, [orphanIds]);

        // Audit log each deletion
        for (const bug of orphansRes.rows) {
            await auditLog('bugs', bug.id, 'DELETE', { ...bug, deleted_at: new Date(), deletion_source: 'tuleap_sync' }, bug);
        }

        await client.query('COMMIT');

        const deletedBugs = orphansRes.rows.map(b => ({ id: b.id, bug_id: b.bug_id, tuleap_artifact_id: b.tuleap_artifact_id, title: b.title }));

        await logWebhook({
            tuleap_artifact_id: 0,
            tuleap_tracker_id,
            artifact_type: 'bug',
            action: 'deletion_sync',
            payload_hash: `sync-${Date.now()}`,
            processing_status: 'processed',
            processing_result: `Deleted ${deletedBugs.length} orphaned bug(s) from tracker ${tuleap_tracker_id}`
        });

        console.log(`[bug-deletion-sync] Soft-deleted ${deletedBugs.length} orphaned bug(s) from tracker ${tuleap_tracker_id}`);

        res.json({ success: true, action: 'synced', deleted_count: deletedBugs.length, deleted_bugs: deletedBugs });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in bug deletion sync:', error);
        res.status(500).json({ success: false, error: 'Failed to sync bug deletions', message: error.message });
    } finally {
        client.release();
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
            return res.status(404).json({ success: false, error: 'No sync config found for this tracker', tracker_id });
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
        const isBug = syncConfig.tracker_type === 'bug';
        const isTask = syncConfig.tracker_type === 'task';

        if (isBug && !validBugActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type 'bug'. Allowed: sync, delete` });
        }
        if (isTask && !validTaskActions.includes(action)) {
            return res.status(400).json({ success: false, error: `Action '${action}' is not supported for artifact_type 'task'. Allowed: sync, delete, reject, archive` });
        }
        if (!isBug && !isTask && !validBugActions.includes(action)) {
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

module.exports = router;
