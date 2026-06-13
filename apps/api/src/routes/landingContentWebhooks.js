const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auditLog } = require('../middleware/audit');
const { changelogWebhookSchema, roadmapWebhookSchema } = require('../schemas/landingPage');

function safeJson(value) {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return JSON.stringify({ error: 'Payload could not be serialized' });
    }
}

function validateAgentSecret(req) {
    const expected = process.env.QC_AGENT_WEBHOOK_SECRET;
    if (!expected) {
        return { ok: false, status: 503, error: 'Agent webhook secret is not configured' };
    }

    const provided = req.get('x-qc-agent-secret') || '';
    if (!provided) {
        return { ok: false, status: 401, error: 'Missing agent webhook secret' };
    }

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    const matches = expectedBuffer.length === providedBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, providedBuffer);

    if (!matches) {
        return { ok: false, status: 401, error: 'Invalid agent webhook secret' };
    }

    return { ok: true };
}

async function logAiContentRequest({
    requestType,
    rawPayload,
    generatedContent = null,
    status,
    errorMessage = null,
    source = null,
}) {
    try {
        await db.query(`
            INSERT INTO ai_content_generation_logs (
                request_type,
                raw_payload,
                generated_content,
                status,
                error_message,
                source,
                processed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 IN ('processed', 'rejected', 'failed') THEN NOW() ELSE NULL END)
        `, [
            requestType,
            safeJson(rawPayload),
            generatedContent === null ? null : safeJson(generatedContent),
            status,
            errorMessage,
            source,
        ]);
    } catch (err) {
        console.error('Failed to log AI landing content request:', err.message);
    }
}

function validationErrorDetails(parsed) {
    return parsed.error.issues.map(issue => ({
        path: issue.path,
        message: issue.message,
    }));
}

function agentActor(source) {
    return `agent:${source || 'unknown'}`;
}

router.post('/changelog', async (req, res, next) => {
    const secret = validateAgentSecret(req);
    if (!secret.ok) {
        await logAiContentRequest({
            requestType: 'changelog',
            rawPayload: req.body,
            status: 'rejected',
            errorMessage: secret.error,
            source: req.body?.source || null,
        });
        return res.status(secret.status).json({ success: false, error: secret.error });
    }

    const parsed = changelogWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
        const details = validationErrorDetails(parsed);
        await logAiContentRequest({
            requestType: 'changelog',
            rawPayload: req.body,
            status: 'rejected',
            errorMessage: 'Validation failed',
            generatedContent: { details },
            source: req.body?.source || null,
        });
        return res.status(400).json({ success: false, error: 'Validation failed', details });
    }

    const data = parsed.data;
    const publishedAt = data.published_at || new Date().toISOString();
    const actor = agentActor(data.source);

    try {
        const result = await db.query(`
            INSERT INTO changelog_entries (
                version_number,
                title,
                content_markdown,
                published_at,
                is_published,
                generated_by_ai,
                source,
                source_reference,
                created_by,
                updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
            RETURNING id, version_number, title, published_at, is_published, generated_by_ai, source, source_reference
        `, [
            data.version_number || null,
            data.title,
            data.content_markdown,
            publishedAt,
            data.is_published,
            data.generated_by_ai,
            data.source,
            data.source_reference || null,
            actor,
        ]);

        const created = result.rows[0];
        await auditLog('changelog_entries', created.id, 'CREATE', created, null, actor);
        await logAiContentRequest({
            requestType: 'changelog',
            rawPayload: req.body,
            generatedContent: {
                changelog_entry_id: created.id,
                title: data.title,
                version_number: data.version_number || null,
                content_markdown: data.content_markdown,
            },
            status: 'processed',
            source: data.source,
        });

        res.status(201).json({ success: true, changelog_entry: created });
    } catch (err) {
        await logAiContentRequest({
            requestType: 'changelog',
            rawPayload: req.body,
            generatedContent: data,
            status: 'failed',
            errorMessage: err.message,
            source: data.source,
        });
        next(err);
    }
});

async function findExistingRoadmapItem(data) {
    if (data.source_reference) {
        const byReference = await db.query(
            `SELECT * FROM roadmap_items WHERE source_reference = $1 LIMIT 1`,
            [data.source_reference]
        );
        if (byReference.rows[0]) return byReference.rows[0];
    }

    const byTitle = await db.query(
        `SELECT * FROM roadmap_items WHERE LOWER(title) = LOWER($1) LIMIT 1`,
        [data.title]
    );
    return byTitle.rows[0] || null;
}

router.post('/roadmap', async (req, res, next) => {
    const secret = validateAgentSecret(req);
    if (!secret.ok) {
        await logAiContentRequest({
            requestType: 'roadmap',
            rawPayload: req.body,
            status: 'rejected',
            errorMessage: secret.error,
            source: req.body?.source || null,
        });
        return res.status(secret.status).json({ success: false, error: secret.error });
    }

    const parsed = roadmapWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
        const details = validationErrorDetails(parsed);
        await logAiContentRequest({
            requestType: 'roadmap',
            rawPayload: req.body,
            status: 'rejected',
            errorMessage: 'Validation failed',
            generatedContent: { details },
            source: req.body?.source || null,
        });
        return res.status(400).json({ success: false, error: 'Validation failed', details });
    }

    const data = parsed.data;
    const actor = agentActor(data.source);

    try {
        const existing = await findExistingRoadmapItem(data);
        let saved;
        let action;

        if (existing) {
            const result = await db.query(`
                UPDATE roadmap_items
                SET title = $1,
                    description = $2,
                    status = $3,
                    priority = $4,
                    target_date = $5,
                    completion_date = $6,
                    display_order = $7,
                    is_public = $8,
                    source_reference = COALESCE($9, source_reference),
                    updated_at = NOW(),
                    updated_by = $10
                WHERE id = $11
                RETURNING *
            `, [
                data.title,
                data.description,
                data.status,
                data.priority,
                data.target_date || null,
                data.completion_date || null,
                data.display_order,
                data.is_public,
                data.source_reference || null,
                actor,
                existing.id,
            ]);
            saved = result.rows[0];
            action = 'updated';
            await auditLog('roadmap_items', saved.id, 'UPDATE', saved, existing, actor);
        } else {
            const result = await db.query(`
                INSERT INTO roadmap_items (
                    title,
                    description,
                    status,
                    priority,
                    target_date,
                    completion_date,
                    display_order,
                    is_public,
                    source_reference,
                    created_by,
                    updated_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
                RETURNING *
            `, [
                data.title,
                data.description,
                data.status,
                data.priority,
                data.target_date || null,
                data.completion_date || null,
                data.display_order,
                data.is_public,
                data.source_reference || null,
                actor,
            ]);
            saved = result.rows[0];
            action = 'created';
            await auditLog('roadmap_items', saved.id, 'CREATE', saved, null, actor);
        }

        await logAiContentRequest({
            requestType: 'roadmap',
            rawPayload: req.body,
            generatedContent: {
                roadmap_item_id: saved.id,
                action,
                title: saved.title,
                status: saved.status,
            },
            status: 'processed',
            source: data.source,
        });

        res.status(action === 'created' ? 201 : 200).json({ success: true, action, roadmap_item: saved });
    } catch (err) {
        await logAiContentRequest({
            requestType: 'roadmap',
            rawPayload: req.body,
            generatedContent: data,
            status: 'failed',
            errorMessage: err.message,
            source: data.source,
        });
        next(err);
    }
});

module.exports = router;
module.exports.validateAgentSecret = validateAgentSecret;
