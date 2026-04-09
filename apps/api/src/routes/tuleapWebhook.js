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
        // → Backlog (default for todo/open/blocked/unknown)
        'todo': 'Backlog',
        'to do': 'Backlog',
        'open': 'Backlog',
        'new': 'Backlog',
        'backlog': 'Backlog',
        'pending': 'Backlog',
        'blocked': 'Backlog',
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
            source = 'EXPLORATORY'
        } = req.body;

        if (!tuleap_artifact_id || !title) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_artifact_id and title are required'
            });
        }

        const linked_test_case_ids = sanitizeUuidArray(rawTestCaseIds);
        const linked_test_execution_ids = sanitizeUuidArray(rawTestExecIds);

        const computedSource = linked_test_case_ids.length > 0 || linked_test_execution_ids.length > 0
            ? 'TEST_CASE'
            : 'EXPLORATORY';
        const finalSource = source || computedSource;

        // Generate payload hash for idempotency
        const payload_hash = crypto.createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        // Log webhook received
        await logWebhook({
            tuleap_artifact_id,
            tuleap_tracker_id,
            artifact_type: 'bug',
            action: req.body.action || 'sync',
            payload_hash,
            raw_payload: raw_tuleap_payload
        });

        const action = req.body.action || 'sync';

        // Handle delete action (Tuleap artifact was deleted)
        if (action === 'delete') {
            const existingRes = await pool.query(
                'SELECT * FROM bugs WHERE tuleap_artifact_id = $1',
                [tuleap_artifact_id]
            );

            if (existingRes.rows.length > 0 && !existingRes.rows[0].deleted_at) {
                const existing = existingRes.rows[0];
                await pool.query(
                    `UPDATE bugs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
                    [existing.id]
                );
                await auditLog('bugs', existing.id, 'DELETE', { ...existing, deleted_at: new Date() }, existing);

                await logWebhook({
                    tuleap_artifact_id,
                    tuleap_tracker_id,
                    artifact_type: 'bug',
                    action: 'delete',
                    payload_hash,
                    raw_payload: raw_tuleap_payload,
                    processing_status: 'processed',
                    processing_result: `Bug deleted from Tuleap: ${existing.bug_id}`
                });

                return res.json({ success: true, action: 'deleted', data: { bug_id: existing.bug_id } });
            }

            await logWebhook({
                tuleap_artifact_id,
                tuleap_tracker_id,
                artifact_type: 'bug',
                action: 'delete',
                payload_hash,
                raw_payload: raw_tuleap_payload,
                processing_status: 'processed',
                processing_result: `Bug not found or already deleted: ${tuleap_artifact_id}`
            });

            return res.json({ success: true, action: 'noop', message: 'Bug not found or already deleted' });
        }

        // Check if bug exists (including soft-deleted)
        const existingRes = await pool.query(
            'SELECT id, deleted_at FROM bugs WHERE tuleap_artifact_id = $1',
            [tuleap_artifact_id]
        );

        let bug;
        let isUpdate = existingRes.rows.length > 0;

        // Skip updates for soft-deleted bugs (manually deleted by admin)
        if (isUpdate && existingRes.rows[0].deleted_at) {
            await logWebhook({
                tuleap_artifact_id,
                tuleap_tracker_id,
                artifact_type: 'bug',
                action: 'sync',
                payload_hash,
                raw_payload: raw_tuleap_payload,
                processing_status: 'skipped',
                processing_result: `Bug ${tuleap_artifact_id} is soft-deleted locally, skipping sync`
            });
            return res.json({ success: true, action: 'skipped', message: 'Bug is soft-deleted locally' });
        }

        if (isUpdate) {
            // Update existing bug
            const existingId = existingRes.rows[0].id;
            const result = await pool.query(`
                UPDATE bugs SET
                    title = $1, description = $2, status = $3, severity = $4, priority = $5,
                    bug_type = $6, component = $7, assigned_to = $8,
                    linked_test_case_ids = $9, linked_test_execution_ids = $10,
                    raw_tuleap_payload = $11, source = $12,
                    updated_by = $13,
                    last_sync_at = NOW(), updated_at = NOW()
                WHERE id = $14
                RETURNING *
            `, [
                title, description, status, severity, priority,
                bug_type, component, assigned_to,
                linked_test_case_ids, linked_test_execution_ids,
                raw_tuleap_payload, finalSource,
                updated_by || null,
                existingId
            ]);
            bug = result.rows[0];
            await auditLog('bugs', bug.id, 'UPDATE', bug, null);
        } else {
            // Create new bug — resolve reporter to a resource (set once, immutable)
            let ownerResourceId = null;
            if (reported_by) {
                const reporterClean = (reported_by || '').trim();
                const reporterName = reporterClean.includes('(') ? reporterClean.split(' (')[0].trim() : reporterClean;
                const resourceRes = await pool.query(
                    `SELECT id FROM resources
                     WHERE deleted_at IS NULL
                       AND (LOWER(email) = LOWER($1)
                            OR LOWER(resource_name) = LOWER($1)
                            OR LOWER(resource_name) = LOWER($2))
                     LIMIT 1`,
                    [reported_by, reporterName]
                );
                if (resourceRes.rows.length > 0) {
                    ownerResourceId = resourceRes.rows[0].id;
                }
            }

            const bug_id = `TLP-${tuleap_artifact_id}`;
            const result = await pool.query(`
                INSERT INTO bugs (
                    tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
                    bug_id, title, description, status, severity, priority,
                    bug_type, component, project_id,
                    linked_test_case_ids, linked_test_execution_ids,
                    reported_by, assigned_to, reported_date, raw_tuleap_payload, source,
                    owner_resource_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                RETURNING *
            `, [
                tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
                bug_id, title, description, status, severity, priority,
                bug_type, component, project_id,
                linked_test_case_ids, linked_test_execution_ids,
                reported_by, assigned_to, reported_date || new Date(), raw_tuleap_payload, finalSource,
                ownerResourceId
            ]);
            bug = result.rows[0];
            await auditLog('bugs', bug.id, 'CREATE', bug, null);
        }

        // Update webhook log
        await logWebhook({
            tuleap_artifact_id,
            tuleap_tracker_id,
            artifact_type: 'bug',
            action: isUpdate ? 'update' : 'create',
            payload_hash,
            raw_payload: raw_tuleap_payload,
            processing_status: 'processed',
            processing_result: `Bug ${isUpdate ? 'updated' : 'created'}: ${bug.bug_id}`
        });

        res.status(isUpdate ? 200 : 201).json({
            success: true,
            action: isUpdate ? 'updated' : 'created',
            data: bug
        });
    } catch (error) {
        console.error('Error processing bug webhook:', error);
        res.status(500).json({
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
// POST /tuleap-webhook/task
// Receive processed task from n8n
// Handles: create, update, reject, archive
// =====================================================
router.post('/task', async (req, res) => {
    try {
        const {
            action,  // 'create', 'update', 'delete', 'reject', 'archive'
            tuleap_artifact_id,
            tuleap_url,
            task_name,
            notes,
            tuleap_status,
            resource1_id,
            new_assignee_name,
            action_reason,
            raw_tuleap_payload,
            // Tuleap project metadata — used for auto-provisioning when project_id is null
            tuleap_project_id,
            tuleap_project_name,
            tuleap_tracker_id,
        } = req.body;

        // Auto-provision QC project + sync config when no project_id supplied
        let project_id = req.body.project_id;
        if (!project_id && tuleap_project_id && action !== 'delete') {
            const provisioned = await provisionTuleapProject({
                tuleap_project_id,
                tuleap_project_name,
                tuleap_short_name: null,
                tuleap_tracker_id,
                tracker_type: 'task',
            });
            if (provisioned?.project) {
                project_id = provisioned.project.id;
                console.log(`Auto-provisioned project ${provisioned.project.project_name} (${provisioned.createdProject ? 'new' : 'existing'}) for artifact ${tuleap_artifact_id}`);
            }
        }

        const mappedStatus = mapTuleapStatus(tuleap_status);

        if (!tuleap_artifact_id) {
            return res.status(400).json({
                success: false,
                error: 'tuleap_artifact_id is required'
            });
        }

        // Generate payload hash
        const payload_hash = crypto.createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        // Log webhook received
        await logWebhook({
            tuleap_artifact_id,
            artifact_type: 'task',
            action: action || 'sync',
            payload_hash,
            raw_payload: raw_tuleap_payload
        });

        // Check if task exists (live)
        const existingRes = await pool.query(
            'SELECT * FROM tasks WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
            [tuleap_artifact_id]
        );
        const existingTask = existingRes.rows[0];

        // Also check for previously soft-deleted task (for revival)
        const deletedRes = await pool.query(
            'SELECT * FROM tasks WHERE tuleap_artifact_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1',
            [tuleap_artifact_id]
        );
        const deletedTask = deletedRes.rows[0];

        let result;
        let processingResult;

        switch (action) {
            case 'reject':
                // New task with unknown assignee - log to history but don't create
                await pool.query(`
                    INSERT INTO tuleap_task_history (
                        tuleap_artifact_id, tuleap_url, task_name, notes, project_id,
                        new_assignee_name, action, action_reason, raw_tuleap_payload
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    tuleap_artifact_id, tuleap_url, task_name, notes, project_id,
                    new_assignee_name, 'rejected_new', action_reason, raw_tuleap_payload
                ]);

                processingResult = `Task rejected: ${task_name} (assigned to unknown user: ${new_assignee_name})`;

                await logWebhook({
                    tuleap_artifact_id,
                    artifact_type: 'task',
                    action: 'reject',
                    payload_hash,
                    raw_payload: raw_tuleap_payload,
                    processing_status: 'rejected',
                    processing_result: processingResult
                });

                return res.json({
                    success: true,
                    action: 'rejected',
                    message: processingResult
                });

            case 'delete':
                // Tuleap artifact deleted — move to history and soft-delete from QC
                if (existingTask) {
                    let previousResourceName = null;
                    if (existingTask.resource1_id) {
                        const resourceRes = await pool.query(
                            'SELECT resource_name FROM resources WHERE id = $1',
                            [existingTask.resource1_id]
                        );
                        if (resourceRes.rows.length > 0) {
                            previousResourceName = resourceRes.rows[0].resource_name;
                        }
                    }

                    await pool.query(`
                        INSERT INTO tuleap_task_history (
                            original_task_id, tuleap_artifact_id, tuleap_url,
                            task_name, notes, status, project_id,
                            previous_resource_id, previous_resource_name,
                            new_assignee_name, action, action_reason, raw_tuleap_payload
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    `, [
                        existingTask.id, tuleap_artifact_id, tuleap_url,
                        existingTask.task_name, existingTask.notes, existingTask.status, existingTask.project_id,
                        existingTask.resource1_id, previousResourceName,
                        new_assignee_name, 'deleted_from_tuleap',
                        `Artifact ${tuleap_artifact_id} was deleted in Tuleap`,
                        raw_tuleap_payload
                    ]);

                    await pool.query(`
                        UPDATE tasks SET deleted_at = NOW(), status = 'Cancelled', updated_at = NOW()
                        WHERE id = $1
                    `, [existingTask.id]);

                    await auditLog('tasks', existingTask.id, 'DELETE', { ...existingTask, deleted_at: new Date() }, existingTask);

                    processingResult = `Task deleted from Tuleap and moved to history: ${existingTask.task_name}`;
                } else {
                    processingResult = `Task not found for deletion: ${tuleap_artifact_id}`;
                }

                await logWebhook({
                    tuleap_artifact_id,
                    artifact_type: 'task',
                    action: 'delete',
                    payload_hash,
                    raw_payload: raw_tuleap_payload,
                    processing_status: 'processed',
                    processing_result: processingResult
                });

                return res.json({
                    success: true,
                    action: 'deleted',
                    message: processingResult
                });

            case 'archive':
                // Existing task reassigned to unknown user - move to history and delete
                if (existingTask) {
                    // Get resource name
                    let previousResourceName = null;
                    if (existingTask.resource1_id) {
                        const resourceRes = await pool.query(
                            'SELECT resource_name FROM resources WHERE id = $1',
                            [existingTask.resource1_id]
                        );
                        if (resourceRes.rows.length > 0) {
                            previousResourceName = resourceRes.rows[0].resource_name;
                        }
                    }

                    // Insert into history
                    await pool.query(`
                        INSERT INTO tuleap_task_history (
                            original_task_id, tuleap_artifact_id, tuleap_url,
                            task_name, notes, status, project_id,
                            previous_resource_id, previous_resource_name,
                            new_assignee_name, action, action_reason, raw_tuleap_payload
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    `, [
                        existingTask.id, tuleap_artifact_id, tuleap_url,
                        existingTask.task_name, existingTask.notes, existingTask.status, existingTask.project_id,
                        existingTask.resource1_id, previousResourceName,
                        new_assignee_name, 'reassigned_out', action_reason, raw_tuleap_payload
                    ]);

                    // Soft delete the task
                    await pool.query(`
                        UPDATE tasks SET deleted_at = NOW(), status = 'Cancelled', updated_at = NOW()
                        WHERE id = $1
                    `, [existingTask.id]);

                    await auditLog('tasks', existingTask.id, 'DELETE', { ...existingTask, deleted_at: new Date() }, existingTask);

                    processingResult = `Task archived: ${existingTask.task_name} (reassigned to: ${new_assignee_name})`;
                } else {
                    processingResult = `Task not found for archiving: ${tuleap_artifact_id}`;
                }

                await logWebhook({
                    tuleap_artifact_id,
                    artifact_type: 'task',
                    action: 'archive',
                    payload_hash,
                    raw_payload: raw_tuleap_payload,
                    processing_status: 'processed',
                    processing_result: processingResult
                });

                return res.json({
                    success: true,
                    action: 'archived',
                    message: processingResult
                });

            case 'update':
                // Update existing task
                if (existingTask) {
                    result = await pool.query(`
                        UPDATE tasks SET
                            task_name = COALESCE($1, task_name),
                            notes = COALESCE($2, notes),
                            resource1_id = COALESCE($3, resource1_id),
                            tuleap_url = COALESCE($4, tuleap_url),
                            status = COALESCE($5, status),
                            last_tuleap_sync = NOW(),
                            updated_at = NOW()
                        WHERE id = $6
                        RETURNING *
                    `, [task_name, notes, resource1_id, tuleap_url, tuleap_status ? mappedStatus : null, existingTask.id]);

                    const updated = result.rows[0];
                    await auditLog('tasks', updated.id, 'UPDATE', updated, existingTask);

                    processingResult = `Task updated: ${updated.task_id}`;

                    await logWebhook({
                        tuleap_artifact_id,
                        artifact_type: 'task',
                        action: 'update',
                        payload_hash,
                        raw_payload: raw_tuleap_payload,
                        processing_status: 'processed',
                        processing_result: processingResult
                    });

                    return res.json({
                        success: true,
                        action: 'updated',
                        data: updated
                    });
                }
                // Fall through to create if task doesn't exist

            case 'create':
            default:
                // Create new task (or revive soft-deleted one)
                if (!task_name) {
                    return res.status(400).json({
                        success: false,
                        error: 'task_name is required for creating a task'
                    });
                }

                // Check if task already exists as live (duplicate webhook)
                if (existingTask) {
                    return res.json({
                        success: true,
                        action: 'exists',
                        message: 'Task already exists',
                        data: existingTask
                    });
                }

                // Revive soft-deleted task instead of creating a new one
                if (deletedTask) {
                    result = await pool.query(`
                        UPDATE tasks SET
                            deleted_at = NULL,
                            status = $1,
                            task_name = $2,
                            notes = $3,
                            resource1_id = $4,
                            tuleap_url = COALESCE($5, tuleap_url),
                            last_tuleap_sync = NOW(),
                            updated_at = NOW()
                        WHERE id = $6
                        RETURNING *
                    `, [
                        mappedStatus || 'Backlog',
                        task_name,
                        notes,
                        resource1_id,
                        tuleap_url,
                        deletedTask.id
                    ]);

                    const revived = result.rows[0];
                    await auditLog('tasks', revived.id, 'UPDATE', revived, deletedTask);

                    processingResult = `Task revived from history: ${revived.task_id}`;

                    await logWebhook({
                        tuleap_artifact_id,
                        artifact_type: 'task',
                        action: 'create',
                        payload_hash,
                        raw_payload: raw_tuleap_payload,
                        processing_status: 'processed',
                        processing_result: processingResult
                    });

                    return res.status(200).json({
                        success: true,
                        action: 'revived',
                        data: revived
                    });
                }

                const task_id = await generateTaskId();
                result = await pool.query(`
                    INSERT INTO tasks (
                        task_id, task_name, notes, status,
                        project_id, resource1_id,
                        tuleap_artifact_id, tuleap_url, synced_from_tuleap, last_tuleap_sync
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())
                    RETURNING *
                `, [
                    task_id, task_name, notes, mappedStatus,
                    project_id, resource1_id,
                    tuleap_artifact_id, tuleap_url
                ]);

                const created = result.rows[0];
                await auditLog('tasks', created.id, 'CREATE', created, null);

                processingResult = `Task created: ${created.task_id}`;

                await logWebhook({
                    tuleap_artifact_id,
                    artifact_type: 'task',
                    action: 'create',
                    payload_hash,
                    raw_payload: raw_tuleap_payload,
                    processing_status: 'processed',
                    processing_result: processingResult
                });

                return res.status(201).json({
                    success: true,
                    action: 'created',
                    data: created
                });
        }
    } catch (error) {
        console.error('Error processing task webhook:', error);
        res.status(500).json({
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
                qc_project_id, field_mappings, status_mappings, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (tuleap_project_id, tuleap_tracker_id) DO UPDATE SET
                tuleap_base_url = EXCLUDED.tuleap_base_url,
                tracker_type = EXCLUDED.tracker_type,
                qc_project_id = EXCLUDED.qc_project_id,
                field_mappings = EXCLUDED.field_mappings,
                status_mappings = EXCLUDED.status_mappings,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
            RETURNING *
        `, [
            tuleap_project_id, tuleap_tracker_id, tuleap_base_url, tracker_type,
            qc_project_id, field_mappings, status_mappings, is_active
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

module.exports = router;
