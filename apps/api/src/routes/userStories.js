const express = require('express');
const router = express.Router();
const { resolveArtifactParam } = require('../middleware/resolveArtifactParam');
router.param('id', resolveArtifactParam('user_story'));
const { pool } = require('../config/db');
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/authMiddleware');
const { auditLog } = require('../middleware/audit');
const { emitToTuleap } = require('../services/emitters/user_story');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
const { createUserStorySchema, updateUserStorySchema } = require('../schemas/userStory');
const { buildAccessDefaults, materializeAclGrants } = require('../services/accessDefaults');
const {
    appendListFilter,
    decorateRows,
    enforceArtifact,
    shadowList,
} = require('../services/access/enforcement');
const {
    handleGetGeneratedTasks,
    handleGenerateTasks,
    handleRegenerateTasks,
    aiIntakeRateLimit,
} = require('./aiIntake');

const USER_STORY_DELETE_PERMISSIONS = Object.freeze([
    'qc.user_stories.delete',
    'qc.user_stories.delete_own',
    'qc.user_stories.delete_team',
    'qc.user_stories.delete_any',
]);

function parseCsvParam(value) {
    if (!value) return [];
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

async function resolveUserStorySyncConfig(projectId) {
    const result = await pool.query(
        `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'user_story' AND is_active = true`,
        [projectId]
    );
    return result.rows[0] || null;
}

async function enforcePmProjectScope(req, res, verb, projectId) {
    if (req.user?.role !== 'pm' || !projectId) return true;
    const access = await enforceArtifact(req, res, 'user_story', { type: 'user_story', id: 'new', project_id: projectId }, verb);
    return access.allowed;
}

async function tryEmitAndWriteback(story, config, mode) {
    const unified = {
        artifact_type: 'user_story',
        project_id: story.project_id,
        common: {
            title: story.title,
            description: story.description,
            status: story.status,
            assigned_to: story.assigned_to,
            priority: story.priority,
        },
        fields: {
            acceptance_criteria: story.acceptance_criteria,
            requirement_version: story.requirement_version,
            change_reason: story.change_reason,
            ba_author: story.ba_author,
            initial_effort: story.initial_effort,
            remaining_effort: story.remaining_effort,
        },
        ...(story.tuleap_artifact_id ? { tuleap: { artifact_id: story.tuleap_artifact_id } } : {}),
    };

    const emitDeps = { client: defaultClient, registry: defaultRegistry };

    const emitResult = await emitToTuleap(unified, config, mode, emitDeps);

    const updateRes = await pool.query(
        `UPDATE user_stories SET
            sync_status = 'synced',
            tuleap_artifact_id = COALESCE($1, tuleap_artifact_id),
            tuleap_url = COALESCE($2, tuleap_url),
            last_sync_attempted_at = NOW(),
            last_sync_error = NULL,
            updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [emitResult.tuleap_artifact_id || null, emitResult.tuleap_url || null, story.id]
    );
    return updateRes.rows[0];
}

router.get('/', requireAuth, requirePermission('qc.projects.view'), async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const offset = (page - 1) * limit;
        const search = String(req.query.q || req.query.search || '').trim();
        const projectIds = parseCsvParam(req.query.project_ids || req.query.project_id);
        const statuses = parseCsvParam(req.query.statuses || req.query.status);
        const relatedType = req.query.related_type || req.query.related_artifact_type;
        const relatedId = req.query.related_id || req.query.related_artifact_id;

        const where = ['us.deleted_at IS NULL'];
        const params = [];
        let pn = 1;

        if (projectIds.length > 0) { where.push(`us.project_id = ANY($${pn++}::uuid[])`); params.push(projectIds); }
        if (statuses.length > 0) { where.push(`us.status = ANY($${pn++}::text[])`); params.push(statuses); }
        if (search) {
            where.push(`(us.title ILIKE $${pn} OR us.description ILIKE $${pn} OR us.acceptance_criteria ILIKE $${pn} OR us.tuleap_artifact_id::text ILIKE $${pn})`);
            params.push(`%${search}%`);
            pn++;
        }
        if (relatedId) {
            if (relatedType === 'task') {
                where.push(`EXISTS (SELECT 1 FROM tasks t WHERE t.parent_user_story_id = us.id AND t.deleted_at IS NULL AND t.id = $${pn++}::uuid)`);
                params.push(relatedId);
            } else if (relatedType === 'test_case') {
                where.push(`EXISTS (SELECT 1 FROM test_case_user_stories tcus WHERE tcus.user_story_id = us.id AND tcus.test_case_id = $${pn++}::uuid)`);
                params.push(relatedId);
            } else if (relatedType === 'bug') {
                where.push(`EXISTS (SELECT 1 FROM bug_user_stories bus WHERE bus.user_story_id = us.id AND bus.bug_id = $${pn++}::uuid)`);
                params.push(relatedId);
            }
        }

        const access = await appendListFilter(req, 'user_story', where, params, {
            startIdx: pn,
            tableAlias: 'us',
            assigneeResourceExprs: [],
            userExprs: ['us.created_by_user_id'],
        });
        pn = access.nextIdx;

        const whereSql = where.join(' AND ');
        const count = await pool.query(`SELECT COUNT(*) AS total FROM user_stories us WHERE ${whereSql}`, params);
        const result = await pool.query(
            `SELECT us.*, p.project_name
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE ${whereSql}
             ORDER BY us.updated_at DESC NULLS LAST, us.created_at DESC
             LIMIT $${pn++} OFFSET $${pn++}`,
            [...params, limit, offset]
        );
        const total = parseInt(count.rows[0].total, 10);
        await shadowList(req, 'user_story', result.rows, { route: 'GET /user-stories' });
        const data = await decorateRows(req, 'user_story', result.rows);
        res.json({ data, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
    } catch (err) {
        next(err);
    }
});

router.get('/:id/generated-tasks', requireAuth, requirePermission('qc.projects.view'), handleGetGeneratedTasks);
router.post('/:id/generate-tasks', requireAuth, requirePermission('qc.tasks.create'), aiIntakeRateLimit, handleGenerateTasks);
router.post('/:id/regenerate-tasks', requireAuth, requirePermission('qc.tasks.create'), aiIntakeRateLimit, handleRegenerateTasks);

router.get('/:id', requireAuth, requirePermission('qc.projects.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const whereClause = 'us.id = $1';
        const paramValue = id;
        const result = await pool.query(
            `SELECT
                us.*,
                p.project_name,
                COALESCE(ai_log.source_content_hash, ai_log.content_hash) AS source_content_hash,
                COALESCE(ai_log.source_content_hash, ai_log.content_hash) AS ai_content_hash,
                ai_log.raw_payload->>'skill_name' AS ai_skill_name,
                ai_log.raw_payload->>'source_agent' AS ai_source_agent,
                ai_log.raw_payload->>'source_conversation_id' AS ai_source_conversation_id,
                COALESCE(ai_log.raw_payload->>'content_markdown', ai_log.raw_payload->>'markdown') AS ai_raw_markdown
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             LEFT JOIN LATERAL (
                SELECT *
                  FROM ai_content_generation_logs
                 WHERE request_type = 'ai_intake_user_story'
                   AND (
                    user_story_id = us.id
                    OR generated_content->>'story_id' = us.id::text
                   )
                 ORDER BY created_at DESC
                 LIMIT 1
             ) ai_log ON true
             WHERE ${whereClause} AND us.deleted_at IS NULL`,
            [paramValue]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User story not found' });
        const access = await enforceArtifact(req, res, 'user_story', result.rows[0], 'view', { route: 'GET /user-stories/:id' });
        if (!access.allowed) return;
        const [story] = await decorateRows(req, 'user_story', result.rows);
        res.json(story);
    } catch (err) {
        next(err);
    }
});

router.post('/', requireAuth, requirePermission('qc.user_stories.create'), async (req, res, next) => {
    try {
        const parsed = createUserStorySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })),
            });
        }
        const data = parsed.data;
        if (!await enforcePmProjectScope(req, res, 'create', data.project_id)) return;

        const accessDefaults = await buildAccessDefaults({
            creator: req.user ? { id: req.user.id } : null,
            artifactType: 'user_story',
            query: pool.query.bind(pool),
        });

        const result = await pool.query(`
            INSERT INTO user_stories (
                title, description, status, acceptance_criteria,
                project_id, priority, assigned_to,
                requirement_version, change_reason, ba_author,
                initial_effort, remaining_effort,
                sync_status,
                owner_team_id, visibility_scope, created_by_user_id
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,$15
            )
            RETURNING *
        `, [
            data.title, data.description, data.status, data.acceptance_criteria,
            data.project_id, data.priority, data.assigned_to,
            data.requirement_version, data.change_reason, data.ba_author,
            data.initial_effort, data.remaining_effort,
            accessDefaults.owner_team_id, accessDefaults.visibility_scope, req.user?.id || null,
        ]);
        let story = result.rows[0];

        await materializeAclGrants({
            artifactType: 'user_story',
            artifactId: story.id,
            grants: accessDefaults.default_acl_grants,
            grantedBy: req.user?.id || null,
            query: pool.query.bind(pool),
        });

        const config = await resolveUserStorySyncConfig(data.project_id);

        if (config) {
            try {
                story = await tryEmitAndWriteback(story, config, 'create');
            } catch (err) {
                console.error(`[route:user-stories:create] emit_failed id=${story.id} err="${err.message}"`);
                const failRes = await pool.query(
                    `UPDATE user_stories SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                    [String(err.message).slice(0, 1024), story.id]
                );
                story = failRes.rows[0];
            }
        } else {
            const standaloneRes = await pool.query(
                `UPDATE user_stories SET sync_status = 'standalone' WHERE id = $1 RETURNING *`,
                [story.id]
            );
            story = standaloneRes.rows[0];
        }

        if (data.temp_id && story.id) {
            try {
                const { adoptStagedAttachments } = require('./artifactAttachments');
                await adoptStagedAttachments('user_story', story.id, data.temp_id, req.user?.id);
            } catch (err) {
                console.error('[attachments:adopt] user-story-local', err.message);
            }
        }

        await auditLog('user_stories', story.id, 'CREATE', story, null);

        res.status(201).json({
            success: true,
            data: story
        });
    } catch (error) {
        console.error('Error creating user story:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user story',
            message: error.message
        });
    }
});

router.patch('/:id', requireAuth, requirePermission('qc.user_stories.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const originalRes = await pool.query('SELECT * FROM user_stories WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        const original = originalRes.rows[0];
        const access = await enforceArtifact(req, res, 'user_story', original, 'edit', { route: 'PATCH /user-stories/:id' });
        if (!access.allowed) return;

        const parsed = updateUserStorySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })),
            });
        }
        const data = parsed.data;
        if (data.project_id && data.project_id !== original.project_id) {
            if (!await enforcePmProjectScope(req, res, 'edit', data.project_id)) return;
        }

        const allowedFields = [
            'title', 'description', 'status', 'acceptance_criteria',
            'project_id', 'priority', 'assigned_to', 'requirement_version',
            'change_reason', 'ba_author',
            'initial_effort', 'remaining_effort',
        ];

        const fields = [];
        const values = [];
        let idx = 1;

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = $${idx}`);
                values.push(data[field]);
                idx++;
            }
        }

        if (fields.length === 0) {
            return res.json({ success: true, data: original });
        }

        fields.push('updated_at = NOW()');
        fields.push('sync_status = \'pending\'');
        fields.push('last_sync_attempted_at = NULL');
        fields.push('last_sync_error = NULL');
        values.push(id);

        const query = `UPDATE user_stories SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await pool.query(query, values);
        let updated = result.rows[0];

        const config = await resolveUserStorySyncConfig(updated.project_id);
        if (config) {
            try {
                const mode = updated.tuleap_artifact_id ? 'update' : 'create';
                updated = await tryEmitAndWriteback(updated, config, mode);
            } catch (err) {
                console.error(`[route:user-stories:patch] emit_failed id=${id} err="${err.message}"`);
                const failRes = await pool.query(
                    `UPDATE user_stories SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                    [String(err.message).slice(0, 1024), id]
                );
                updated = failRes.rows[0];
            }
        }

        await auditLog('user_stories', id, 'UPDATE', updated, original);

        res.json({
            success: true,
            data: updated
        });
    } catch (error) {
        console.error('Error updating user story:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user story',
            message: error.message
        });
    }
});

router.post('/:id/sync', requireAuth, requirePermission('qc.user_stories.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const storyRes = await pool.query('SELECT * FROM user_stories WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (storyRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        let story = storyRes.rows[0];

        const config = await resolveUserStorySyncConfig(story.project_id);
        if (!config) {
            const standaloneRes = await pool.query(
                `UPDATE user_stories SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
                [id]
            );
            return res.json({ success: true, data: standaloneRes.rows[0] });
        }

        await pool.query(
            `UPDATE user_stories SET sync_status = 'pending', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [id]
        );

        try {
            const mode = story.tuleap_artifact_id ? 'update' : 'create';
            story = await tryEmitAndWriteback(story, config, mode);
        } catch (err) {
            console.error(`[route:user-stories:sync] emit_failed id=${id} err="${err.message}"`);
            const failRes = await pool.query(
                `UPDATE user_stories SET sync_status = 'failed', last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [String(err.message).slice(0, 1024), id]
            );
            story = failRes.rows[0];
        }

        res.json({ success: true, data: story });
    } catch (error) {
        console.error('Error syncing user story:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync user story',
            message: error.message
        });
    }
});

router.delete('/:id', requireAuth, requireAnyPermission(...USER_STORY_DELETE_PERMISSIONS), async (req, res) => {
    try {
        const { id } = req.params;
        const originalRes = await pool.query('SELECT * FROM user_stories WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        const original = originalRes.rows[0];

        if (original.deleted_at) {
            return res.status(400).json({ success: false, error: 'User story already deleted' });
        }
        const access = await enforceArtifact(req, res, 'user_story', original, 'delete', { route: 'DELETE /user-stories/:id' });
        if (!access.allowed) return;

        if (req.user?.role === 'admin' && original.tuleap_artifact_id) {
            const configResult = await pool.query(
                `SELECT * FROM tuleap_sync_config
                 WHERE qc_project_id = $1 AND tracker_type = 'user_story' AND is_active = true`,
                [original.project_id]
            );
            const config = configResult.rows[0];
            if (!config) {
                return res.status(400).json({
                    success: false,
                    error: `No active user story sync config for project ${original.project_id}`,
                });
            }

            let tuleapAlreadyGone = false;
            try {
                await emitToTuleap(
                    {
                        artifact_type: 'user_story',
                        project_id: original.project_id,
                        tuleap: { artifact_id: original.tuleap_artifact_id },
                    },
                    config,
                    'delete',
                    { client: defaultClient, registry: defaultRegistry, query: pool.query.bind(pool) }
                );
            } catch (emitErr) {
                if (emitErr.status === 404) {
                    tuleapAlreadyGone = true;
                    console.warn(`[route:user-stories:delete] tuleap_404 id=${id} artifact_id=${original.tuleap_artifact_id} — soft-deleting locally`);
                } else {
                    console.error(`[route:user-stories:delete] emit_failed id=${id} err="${emitErr.message}"`);
                    return res.status(emitErr.status || 502).json({
                        success: false,
                        error: 'Failed to delete in Tuleap',
                        message: emitErr.message,
                    });
                }
            }

            if (tuleapAlreadyGone) {
                await pool.query(
                    'UPDATE user_stories SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
                    [id]
                );
            }

            const refreshed = await pool.query('SELECT * FROM user_stories WHERE id = $1', [id]);
            const deleted = refreshed.rows[0];
            await auditLog('user_stories', id, 'DELETE', deleted, original);
            return res.json({
                success: true,
                message: `User story '${deleted.title}' has been deleted${tuleapAlreadyGone ? ' (Tuleap artifact was already missing)' : ''}`,
                data: deleted,
                tuleap_already_gone: tuleapAlreadyGone || undefined,
            });
        }

        const result = await pool.query(
            'UPDATE user_stories SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
            [id]
        );
        const deleted = result.rows[0];
        await auditLog('user_stories', id, 'DELETE', deleted, original);

        res.json({
            success: true,
            message: `User story '${deleted.title}' has been deleted`,
            data: deleted,
        });
    } catch (error) {
        console.error('Error deleting user story:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user story' });
    }
});

module.exports = router;
