const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { auditLog } = require('../middleware/audit');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { emitToTuleap: emitBug } = require('../services/emitters/bug');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
const { createBugSchema, updateBugSchema } = require('../schemas/bug');
const { normalizeBugStatus, normalizeBugSeverity } = require('../services/normalizers/bug');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validUUID(val) { return val && UUID_RE.test(val) ? val : null; }

async function replaceBugLinks(bugId, { linked_test_execution_ids, linked_task_ids }) {
    if (Array.isArray(linked_test_execution_ids)) {
        await pool.query('DELETE FROM bug_test_executions WHERE bug_id = $1', [bugId]);
        if (linked_test_execution_ids.length > 0) {
            await pool.query(
                `INSERT INTO bug_test_executions (bug_id, test_execution_id)
                 SELECT $1, id FROM test_execution WHERE id = ANY($2)
                 ON CONFLICT (bug_id, test_execution_id) DO NOTHING`,
                [bugId, linked_test_execution_ids]
            );
        }
    }

    if (Array.isArray(linked_task_ids)) {
        await pool.query('DELETE FROM bug_tasks WHERE bug_id = $1', [bugId]);
        if (linked_task_ids.length > 0) {
            await pool.query(
                `INSERT INTO bug_tasks (bug_id, task_id)
                 SELECT $1, id FROM tasks WHERE id = ANY($2) AND deleted_at IS NULL
                 ON CONFLICT (bug_id, task_id) DO NOTHING`,
                [bugId, linked_task_ids]
            );
        }
    }
}

async function resolveBugSyncConfig(projectId) {
    const result = await pool.query(
        `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'bug' AND is_active = true`,
        [projectId]
    );
    return result.rows[0] || null;
}

async function tryEmitAndWriteback(bug, data, config, mode) {
    const unified = {
        artifact_type: 'bug',
        project_id: bug.project_id,
        common: {
            title: bug.title,
            description: bug.description,
            status: bug.status,
            assigned_to: bug.assigned_to,
            priority: bug.priority,
        },
        fields: {
            severity: bug.severity,
            environment: bug.environment,
            service_name: bug.service_name,
            steps_to_reproduce: bug.steps_to_reproduce,
            dev_fix_description: bug.dev_fix_description,
            qc_verification_notes: bug.qc_verification_notes,
            close_date: bug.close_date,
            cc: bug.cc,
            linked_test_case_ids: bug.linked_test_case_ids,
            initial_effort: bug.initial_effort,
            remaining_effort: bug.remaining_effort,
        },
        ...(bug.tuleap_artifact_id ? { tuleap: { artifact_id: bug.tuleap_artifact_id } } : {}),
    };

    const emitDeps = { client: defaultClient, registry: defaultRegistry };

    const emitResult = await emitBug(unified, config, mode, emitDeps);

    const updateRes = await pool.query(
        `UPDATE bugs SET
            sync_status = 'synced',
            tuleap_artifact_id = COALESCE($1, tuleap_artifact_id),
            tuleap_url = COALESCE($2, tuleap_url),
            tuleap_tracker_id = COALESCE($3, tuleap_tracker_id),
            last_sync_attempted_at = NOW(),
            last_sync_error = NULL,
            updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [emitResult.tuleap_artifact_id || null, emitResult.tuleap_url || null, config.tuleap_tracker_id, bug.id]
    );
    return updateRes.rows[0];
}

router.get('/summary', requireAuth, requirePermission('qc.bugs.view'), async (req, res) => {
    try {
        const project_id = validUUID(req.query.project_id);

        let totals;
        if (project_id) {
            const projectResult = await pool.query(
                'SELECT * FROM v_bug_summary WHERE project_id = $1',
                [project_id]
            );
            totals = projectResult.rows[0] || {};
        } else {
            const globalResult = await pool.query('SELECT * FROM v_bug_summary_global');
            totals = globalResult.rows[0] || {};
        }

        let byProjectQuery = 'SELECT * FROM v_bug_summary';
        const byProjectParams = [];
        if (project_id) {
            byProjectQuery += ' WHERE project_id = $1';
            byProjectParams.push(project_id);
        }
        byProjectQuery += ' ORDER BY total_bugs DESC';
        const byProjectResult = await pool.query(byProjectQuery, byProjectParams);

        let recentQuery = `
            SELECT
                b.id,
                b.bug_id,
                b.title,
                b.status,
                b.severity,
                b.priority,
                b.reported_date,
                b.tuleap_url,
                b.source,
                b.tuleap_artifact_id,
                p.project_name,
                CASE WHEN EXISTS (SELECT 1 FROM bug_test_executions bte WHERE bte.bug_id = b.id)
                         OR EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = b.id)
                     THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.deleted_at IS NULL
        `;
        const recentParams = [];
        if (project_id) {
            recentQuery += ' AND b.project_id = $1';
            recentParams.push(project_id);
        }
        recentQuery += ' ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC LIMIT 10';
        const recentResult = await pool.query(recentQuery, recentParams);

        res.json({
            success: true,
            data: {
                totals: {
                    total_bugs: parseInt(totals.total_bugs) || 0,
                    open_bugs: parseInt(totals.open_bugs) || 0,
                    closed_bugs: parseInt(totals.closed_bugs) || 0,
                    bugs_from_testing: parseInt(totals.bugs_from_testing) || 0,
                    standalone_bugs: parseInt(totals.standalone_bugs) || 0
                },
                by_severity: {
                    critical: parseInt(totals.critical_bugs) || 0,
                    major: parseInt(totals.major_bugs) || 0,
                    minor: parseInt(totals.minor_bugs) || 0,
                    cosmetic: parseInt(totals.cosmetic_bugs) || 0,
                },
                by_source: {
                    test_case: parseInt(totals.bugs_from_test_cases) || 0,
                    exploratory: parseInt(totals.bugs_from_exploratory) || 0
                },
                by_project: byProjectResult.rows,
                recent_bugs: recentResult.rows
            }
        });
    } catch (error) {
        console.error('Error fetching bug summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bug summary',
            message: error.message
        });
    }
});

router.get('/', requireAuth, requirePermission('qc.bugs.view'), async (req, res) => {
    try {
        const { status, severity, limit = 50, offset = 0, sort = 'created_at:desc' } = req.query;
        const project_id = validUUID(req.query.project_id);
        const source = ['TEST_CASE', 'EXPLORATORY'].includes(req.query.source) ? req.query.source : null;

        let query = `
            SELECT
                b.*,
                p.project_name,
                r.resource_name AS submitted_by_resource_name,
                CASE WHEN EXISTS (SELECT 1 FROM bug_test_executions bte WHERE bte.bug_id = b.id)
                         OR EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = b.id)
                     THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            LEFT JOIN resources r ON b.submitted_by_resource_id = r.id
            WHERE b.deleted_at IS NULL
        `;
        const params = [];
        let paramIndex = 1;

        if (project_id) {
            query += ` AND b.project_id = $${paramIndex}`;
            params.push(project_id);
            paramIndex++;
        }

        if (status) {
            query += ` AND b.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (severity) {
            query += ` AND b.severity = $${paramIndex}`;
            params.push(severity);
            paramIndex++;
        }

        if (source) {
            query += ` AND b.source = $${paramIndex}`;
            params.push(source);
            paramIndex++;
        }

        const [sortField, sortDir] = sort.split(':');
        const validSortFields = ['created_at', 'reported_date', 'severity', 'status', 'title'];
        const sortColumn = validSortFields.includes(sortField) ? sortField : 'created_at';
        const sortDirection = sortDir === 'asc' ? 'ASC' : 'DESC';

        query += ` ORDER BY b.${sortColumn} ${sortDirection} NULLS LAST`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        let countQuery = 'SELECT COUNT(*) FROM bugs WHERE deleted_at IS NULL';
        const countParams = [];
        let countParamIndex = 1;
        if (project_id) {
            countQuery += ` AND project_id = $${countParamIndex}`;
            countParams.push(project_id);
            countParamIndex++;
        }
        if (status) {
            countQuery += ` AND status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        if (severity) {
            countQuery += ` AND severity = $${countParamIndex}`;
            countParams.push(severity);
            countParamIndex++;
        }
        if (source) {
            countQuery += ` AND source = $${countParamIndex}`;
            countParams.push(source);
        }
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            count: result.rows.length,
            total: parseInt(countResult.rows[0].count),
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching bugs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bugs',
            message: error.message
        });
    }
});

router.get('/:id', requireAuth, requirePermission('qc.bugs.view'), async (req, res) => {
    try {
        const { id } = req.params;

        if (!UUID_RE.test(id)) {
            return res.status(404).json({ success: false, error: 'Bug not found' });
        }

        const query = `
            SELECT
                b.*,
                p.project_name,
                CASE WHEN EXISTS (SELECT 1 FROM bug_test_executions bte WHERE bte.bug_id = b.id)
                         OR EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = b.id)
                     THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.id = $1 AND b.deleted_at IS NULL
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bug not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bug',
            message: error.message
        });
    }
});

router.get('/by-project/:projectId', requireAuth, requirePermission('qc.bugs.view'), async (req, res) => {
    try {
        const { projectId } = req.params;

        const query = `
            SELECT
                b.*,
                p.project_name,
                CASE WHEN EXISTS (SELECT 1 FROM bug_test_executions bte WHERE bte.bug_id = b.id)
                         OR EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = b.id)
                     THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.project_id = $1 AND b.deleted_at IS NULL
            ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC
        `;
        const result = await pool.query(query, [projectId]);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching project bugs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project bugs',
            message: error.message
        });
    }
});

router.post('/', requireAuth, requirePermission('qc.bugs.create'), async (req, res) => {
    try {
        const parsed = createBugSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })),
            });
        }
        const data = parsed.data;

        const normalizedStatus = normalizeBugStatus(data.status);
        const normalizedSeverity = normalizeBugSeverity(data.severity);

        const bugId = `BUG-${Date.now().toString(36).toUpperCase()}`;
        const computedSource = data.source || (
            (data.linked_test_case_ids?.length > 0 || data.linked_test_execution_ids?.length > 0)
                ? 'TEST_CASE' : 'EXPLORATORY'
        );
        const computedTriage = data.triage_status || (
            (data.linked_test_case_ids?.length > 0 || data.linked_test_execution_ids?.length > 0 || data.linked_task_ids?.length > 0)
                ? 'triaged' : 'untriaged'
        );

        const result = await pool.query(`
            INSERT INTO bugs (
                bug_id, title, description, status, severity, priority,
                project_id, assigned_to, environment, service_name,
                source, triage_status, bug_type, component,
                steps_to_reproduce, dev_fix_description, qc_verification_notes,
                close_date, cc, linked_test_case_ids, linked_test_execution_ids,
                reported_by, reported_date,
                sync_status
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,'pending'
            )
            RETURNING *
        `, [
            bugId, data.title, data.description, normalizedStatus, normalizedSeverity, data.priority,
            data.project_id, data.assigned_to, data.environment, data.service_name,
            computedSource, computedTriage, data.bug_type, data.component,
            data.steps_to_reproduce, data.dev_fix_description, data.qc_verification_notes,
            data.close_date, data.cc, data.linked_test_case_ids, data.linked_test_execution_ids,
            data.reported_by, data.reported_date || new Date(),
        ]);
        let bug = result.rows[0];

        await replaceBugLinks(bug.id, data);

        const config = await resolveBugSyncConfig(data.project_id);

        if (config) {
            try {
                bug = await tryEmitAndWriteback(bug, data, config, 'create');
            } catch (err) {
                console.error(`[route:bugs:create] emit_failed bug_id=${bug.id} err="${err.message}"`);
                const failRes = await pool.query(
                    `UPDATE bugs SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                    [String(err.message).slice(0, 1024), bug.id]
                );
                bug = failRes.rows[0];
            }
        } else {
            const standaloneRes = await pool.query(
                `UPDATE bugs SET sync_status = 'standalone' WHERE id = $1 RETURNING *`,
                [bug.id]
            );
            bug = standaloneRes.rows[0];
        }

        if (data.temp_id && bug.id) {
            try {
                const { adoptStagedAttachments } = require('./artifactAttachments');
                await adoptStagedAttachments('bug', bug.id, data.temp_id, req.user?.id);
            } catch (err) {
                console.error('[attachments:adopt] bug-local', err.message);
            }
        }

        await auditLog('bugs', bug.id, 'CREATE', bug, null);

        res.status(201).json({
            success: true,
            data: bug
        });
    } catch (error) {
        console.error('Error creating bug:', error);

        if (error.code === '23505' && error.constraint === 'bugs_tuleap_artifact_id_key') {
            return res.status(409).json({
                success: false,
                error: 'Bug with this Tuleap artifact ID already exists',
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to create bug',
            message: error.message
        });
    }
});

router.patch('/:id', requireAuth, requirePermission('qc.bugs.edit'), async (req, res) => {
    try {
        const { id } = req.params;

        const originalRes = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bug not found'
            });
        }
        const original = originalRes.rows[0];

        const parsed = updateBugSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })),
            });
        }
        const data = parsed.data;

        const allowedFields = [
            'title', 'description', 'status', 'severity', 'priority',
            'bug_type', 'component', 'assigned_to', 'updated_by',
            'resolved_date', 'environment', 'service_name',
            'dev_fix_description', 'qc_verification_notes',
            'initial_effort', 'remaining_effort', 'cc',
            'linked_test_case_ids', 'linked_test_execution_ids', 'raw_tuleap_payload',
            'source', 'triage_status'
        ];

        const fields = [];
        const values = [];
        let idx = 1;

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                let val = data[field];
                if (field === 'status') val = normalizeBugStatus(val);
                if (field === 'severity') val = normalizeBugSeverity(val);
                fields.push(`${field} = $${idx}`);
                values.push(val);
                idx++;
            }
        }

        if (fields.length === 0) {
            await replaceBugLinks(id, {
                linked_test_execution_ids: data.linked_test_execution_ids,
                linked_task_ids: data.linked_task_ids,
            });
            return res.json({ success: true, data: original });
        }

        fields.push('updated_at = NOW()');
        fields.push('sync_status = \'pending\'');
        fields.push('last_sync_attempted_at = NULL');
        fields.push('last_sync_error = NULL');
        values.push(id);

        const query = `UPDATE bugs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await pool.query(query, values);
        let updated = result.rows[0];

        await replaceBugLinks(id, {
            linked_test_execution_ids: data.linked_test_execution_ids,
            linked_task_ids: data.linked_task_ids,
        });

        const config = await resolveBugSyncConfig(updated.project_id);
        if (config) {
            try {
                const mode = updated.tuleap_artifact_id ? 'update' : 'create';
                updated = await tryEmitAndWriteback(updated, data, config, mode);
            } catch (err) {
                console.error(`[route:bugs:patch] emit_failed bug_id=${id} err="${err.message}"`);
                const failRes = await pool.query(
                    `UPDATE bugs SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                    [String(err.message).slice(0, 1024), id]
                );
                updated = failRes.rows[0];
            }
        }

        await auditLog('bugs', id, 'UPDATE', updated, original);

        res.json({
            success: true,
            data: updated
        });
    } catch (error) {
        console.error('Error updating bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update bug',
            message: error.message
        });
    }
});

router.post('/:id/sync', requireAuth, requirePermission('qc.bugs.edit'), async (req, res) => {
    try {
        const { id } = req.params;

        const bugRes = await pool.query('SELECT * FROM bugs WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (bugRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Bug not found' });
        }
        let bug = bugRes.rows[0];

        const config = await resolveBugSyncConfig(bug.project_id);
        if (!config) {
            const standaloneRes = await pool.query(
                `UPDATE bugs SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
                [id]
            );
            return res.json({ success: true, data: standaloneRes.rows[0] });
        }

        await pool.query(
            `UPDATE bugs SET sync_status = 'pending', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [id]
        );

        try {
            const mode = bug.tuleap_artifact_id ? 'update' : 'create';
            bug = await tryEmitAndWriteback(bug, {}, config, mode);
        } catch (err) {
            console.error(`[route:bugs:sync] emit_failed bug_id=${id} err="${err.message}"`);
            const failRes = await pool.query(
                `UPDATE bugs SET sync_status = 'failed', last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [String(err.message).slice(0, 1024), id]
            );
            bug = failRes.rows[0];
        }

        res.json({ success: true, data: bug });
    } catch (error) {
        console.error('Error syncing bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync bug',
            message: error.message
        });
    }
});

router.delete('/:id', requireAuth, requirePermission('qc.bugs.delete'), async (req, res) => {
    try {
        const { id } = req.params;

        const originalRes = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bug not found'
            });
        }
        const original = originalRes.rows[0];

        if (original.deleted_at) {
            return res.status(400).json({
                success: false,
                error: 'Bug already deleted'
            });
        }

        if (original.tuleap_artifact_id) {
            const configResult = await pool.query(
                `SELECT * FROM tuleap_sync_config
                 WHERE qc_project_id = $1 AND tracker_type = 'bug' AND is_active = true`,
                [original.project_id]
            );
            const config = configResult.rows[0];
            if (!config) {
                return res.status(400).json({
                    success: false,
                    error: `No active bug sync config for project ${original.project_id}`,
                });
            }

            try {
                await emitBug(
                    {
                        artifact_type: 'bug',
                        project_id: original.project_id,
                        tuleap: { artifact_id: original.tuleap_artifact_id },
                    },
                    config,
                    'delete',
                    { client: defaultClient, registry: defaultRegistry, query: pool.query.bind(pool) }
                );
            } catch (emitErr) {
                console.error(`[route:bugs:delete] emit_failed bug_id=${id} err="${emitErr.message}"`);
                return res.status(emitErr.status || 502).json({
                    success: false,
                    error: 'Failed to delete in Tuleap',
                    message: emitErr.message,
                });
            }

            const refreshed = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
            const deleted = refreshed.rows[0];
            await auditLog('bugs', id, 'DELETE', deleted, original);
            return res.json({
                success: true,
                message: `Bug '${deleted.title}' has been deleted`,
                data: deleted,
            });
        }

        const result = await pool.query(
            'UPDATE bugs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
            [id]
        );
        const deleted = result.rows[0];
        await auditLog('bugs', id, 'DELETE', deleted, original);

        res.json({
            success: true,
            message: `Bug '${deleted.title}' has been deleted`,
            data: deleted,
        });
    } catch (error) {
        console.error('Error deleting bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete bug',
            message: error.message
        });
    }
});

// =====================================================
// BUG TEST EXECUTION LINKING ENDPOINTS
// =====================================================

router.get('/:id/test-executions', requireAuth, requirePermission('qc.bugs.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const bugCheck = await pool.query('SELECT id FROM bugs WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (bugCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Bug not found' });
        }

        const result = await pool.query(
            `SELECT bte.id, bte.bug_id, bte.test_execution_id, bte.created_at,
                    te.status AS execution_status, te.notes AS execution_notes,
                    te.executed_at, tr.run_id AS test_run_id, tr.name AS test_run_name
             FROM bug_test_executions bte
             JOIN test_execution te ON te.id = bte.test_execution_id
             LEFT JOIN test_run tr ON tr.id = te.test_run_id
             WHERE bte.bug_id = $1
             ORDER BY bte.created_at ASC`,
            [id]
        );

        res.json({ data: result.rows });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/test-executions', requireAuth, requirePermission('qc.bugs.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { test_execution_id } = req.body;

        if (!test_execution_id) {
            return res.status(400).json({ error: 'test_execution_id is required' });
        }

        const bugCheck = await pool.query('SELECT id FROM bugs WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (bugCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Bug not found' });
        }

        const teCheck = await pool.query('SELECT id FROM test_execution WHERE id = $1', [test_execution_id]);
        if (teCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Test execution not found' });
        }

        const result = await pool.query(
            `INSERT INTO bug_test_executions (bug_id, test_execution_id, created_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (bug_id, test_execution_id) DO NOTHING
             RETURNING *`,
            [id, test_execution_id, req.user?.id || null]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Link already exists' });
        }

        await pool.query(
            `UPDATE bugs SET triage_status = 'triaged', updated_at = NOW() WHERE id = $1 AND triage_status = 'untriaged'`,
            [id]
        );

        await auditLog('bug_test_executions', result.rows[0].id, 'CREATE', result.rows[0], null);
        res.status(201).json({ data: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.delete('/:id/test-executions/:executionId', requireAuth, requirePermission('qc.bugs.edit'), async (req, res, next) => {
    try {
        const { id, executionId } = req.params;

        const result = await pool.query(
            `DELETE FROM bug_test_executions WHERE bug_id = $1 AND test_execution_id = $2 RETURNING *`,
            [id, executionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const remainingExecs = await pool.query(
            `SELECT 1 FROM bug_test_executions WHERE bug_id = $1 LIMIT 1`,
            [id]
        );
        const remainingTasks = await pool.query(
            `SELECT 1 FROM bug_tasks WHERE bug_id = $1 LIMIT 1`,
            [id]
        );

        if (remainingExecs.rows.length === 0 && remainingTasks.rows.length === 0) {
            await pool.query(
                `UPDATE bugs SET triage_status = 'untriaged', updated_at = NOW() WHERE id = $1`,
                [id]
            );
        }

        await auditLog('bug_test_executions', result.rows[0].id, 'DELETE', null, result.rows[0]);
        res.json({ success: true, message: 'Link removed' });
    } catch (err) {
        next(err);
    }
});

// =====================================================
// BUG TASK LINKING ENDPOINTS
// =====================================================

router.get('/:id/tasks', requireAuth, requirePermission('qc.bugs.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const bugCheck = await pool.query('SELECT id FROM bugs WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (bugCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Bug not found' });
        }

        const result = await pool.query(
            `SELECT bt.id, bt.bug_id, bt.task_id, bt.relationship_type, bt.created_at,
                    t.task_id AS task_display_id, t.task_name, t.status AS task_status, t.project_id
             FROM bug_tasks bt
             JOIN tasks t ON t.id = bt.task_id
             WHERE bt.bug_id = $1 AND t.deleted_at IS NULL
             ORDER BY bt.created_at ASC`,
            [id]
        );

        res.json({ data: result.rows });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/tasks', requireAuth, requirePermission('qc.bugs.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { task_id, relationship_type = 'reported_against' } = req.body;

        if (!task_id) {
            return res.status(400).json({ error: 'task_id is required' });
        }

        const bugCheck = await pool.query('SELECT id FROM bugs WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (bugCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Bug not found' });
        }

        const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL', [task_id]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const result = await pool.query(
            `INSERT INTO bug_tasks (bug_id, task_id, relationship_type, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (bug_id, task_id) DO NOTHING
             RETURNING *`,
            [id, task_id, relationship_type, req.user?.id || null]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Link already exists' });
        }

        await pool.query(
            `UPDATE bugs SET triage_status = 'triaged', updated_at = NOW() WHERE id = $1 AND triage_status = 'untriaged'`,
            [id]
        );

        await auditLog('bug_tasks', result.rows[0].id, 'CREATE', result.rows[0], null);
        res.status(201).json({ data: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.delete('/:id/tasks/:taskId', requireAuth, requirePermission('qc.bugs.edit'), async (req, res, next) => {
    try {
        const { id, taskId } = req.params;

        const result = await pool.query(
            `DELETE FROM bug_tasks WHERE bug_id = $1 AND task_id = $2 RETURNING *`,
            [id, taskId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const remainingExecs = await pool.query(
            `SELECT 1 FROM bug_test_executions WHERE bug_id = $1 LIMIT 1`,
            [id]
        );
        const remainingTasks = await pool.query(
            `SELECT 1 FROM bug_tasks WHERE bug_id = $1 LIMIT 1`,
            [id]
        );

        if (remainingExecs.rows.length === 0 && remainingTasks.rows.length === 0) {
            await pool.query(
                `UPDATE bugs SET triage_status = 'untriaged', updated_at = NOW() WHERE id = $1`,
                [id]
            );
        }

        await auditLog('bug_tasks', result.rows[0].id, 'DELETE', null, result.rows[0]);
        res.json({ success: true, message: 'Link removed' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
