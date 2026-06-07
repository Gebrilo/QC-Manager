const express = require('express');
const router = express.Router();
const db = require('../config/db');
const axios = require('axios');
const { z } = require('zod');
const { triggerWorkflow } = require('../utils/n8n');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requirePermission, blockContributors } = require('../middleware/authMiddleware');
const XLSX = require('xlsx');

const FORMAT_MIME = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    json: 'application/json',
};

const REPORT_SQL_BY_TYPE = {
    dashboard: 'SELECT * FROM v_dashboard_metrics',
    project_status: 'SELECT * FROM v_projects_with_metrics ORDER BY created_at DESC',
    resource_utilization: 'SELECT * FROM v_resources_with_utilization ORDER BY resource_name ASC',
    task_export: 'SELECT * FROM v_tasks_with_metrics ORDER BY created_at DESC',
    test_results: 'SELECT * FROM v_test_execution_trends ORDER BY execution_date DESC LIMIT 500',
};

function serializeCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function rowsToCsv(rows) {
    if (!rows.length) {
        return 'message\nNo data available\n';
    }

    const headers = Object.keys(rows[0]);
    const escape = (raw) => {
        const v = serializeCell(raw);
        if (v.includes(',') || v.includes('"') || v.includes('\n')) {
            return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((h) => escape(row[h])).join(','));
    }
    return `${lines.join('\n')}\n`;
}

function downloadDisposition(filename) {
    const safeFilename = String(filename || 'report.dat')
        .replace(/[\r\n]/g, '')
        .replace(/"/g, "'");
    return `attachment; filename="${safeFilename}"`;
}

function requestOrigin(req) {
    const protocol = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    return host ? `${protocol}://${host}` : '';
}

function mailtoHref(recipients, subject, body) {
    const to = recipients.map((recipient) => encodeURIComponent(recipient)).join(',');
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function uniqueLowerEmails(values) {
    return Array.from(new Set(values.map((value) => value.trim().toLowerCase())));
}

function systemReportSenderEmail() {
    if (process.env.REPORT_EMAIL_FROM) return process.env.REPORT_EMAIL_FROM;
    if (process.env.SYSTEM_EMAIL_FROM) return process.env.SYSTEM_EMAIL_FROM;
    if (process.env.SUPABASE_EMAIL_FROM) return process.env.SUPABASE_EMAIL_FROM;

    const domain = String(process.env.WEB_DOMAIN || process.env.API_DOMAIN || 'gerbil.qc')
        .replace(/^https?:\/\//i, '')
        .split('/')[0];
    return `no-reply@${domain}`;
}

async function buildReportPayload(reportType, format) {
    const sql = REPORT_SQL_BY_TYPE[reportType] || REPORT_SQL_BY_TYPE.dashboard;
    const result = await db.query(sql);
    const rows = result.rows || [];
    const generatedAt = new Date().toISOString();

    if (format === 'json') {
        const content = Buffer.from(JSON.stringify({ generated_at: generatedAt, report_type: reportType, rows }, null, 2), 'utf8');
        return { content, filename: `${reportType}-${Date.now()}.json` };
    }

    if (format === 'csv') {
        const content = Buffer.from(rowsToCsv(rows), 'utf8');
        return { content, filename: `${reportType}-${Date.now()}.csv` };
    }

    if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ message: 'No data available' }]);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return { content, filename: `${reportType}-${Date.now()}.xlsx` };
    }

    throw new Error('Unsupported report format');
}

// Validation schema for report generation
const generateReportSchema = z.object({
    report_type: z.enum(['project_status', 'resource_utilization', 'task_export', 'test_results', 'dashboard']),
    format: z.enum(['xlsx', 'csv', 'json', 'pdf']).default('json'),
    filters: z.object({
        project_ids: z.array(z.string().uuid()).optional(),
        status: z.array(z.string()).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional()
    }).optional(),
    user_email: z.string().email().optional()
});

const shareReportSchema = z.object({
    report_id: z.string().min(1),
    report_name: z.string().min(1),
    report_type: z.enum(['project_status', 'resource_utilization', 'task_export', 'test_results', 'dashboard']),
    format: z.enum(['xlsx', 'csv', 'json', 'pdf']).default('pdf'),
    recipients: z.array(z.string().email()).min(1).max(50).transform(uniqueLowerEmails),
    share_url: z.string().url(),
    attach_export: z.boolean().default(true),
    filters: z.object({
        project_ids: z.array(z.string().uuid()).optional(),
        status: z.array(z.string()).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional()
    }).optional(),
    attachment: z.object({
        filename: z.string().min(1).max(255),
        mime_type: z.string().min(1).max(120),
        content_base64: z.string().min(1).max(20 * 1024 * 1024),
    }).optional(),
    message: z.string().max(2000).optional(),
});

// POST /reports - Generate report (returns job_id)
router.post('/', requireAuth, blockContributors, requirePermission('qc.reports.generate'), async (req, res, next) => {
    try {
        // Validate request
        const data = generateReportSchema.parse(req.body);

        // Generate job ID
        const jobId = uuidv4();

        // Insert job into database
        await db.query(
            `INSERT INTO report_jobs (
                id, report_type, format, status, filters, user_email
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                jobId,
                data.report_type,
                data.format,
                'processing',
                data.filters ? JSON.stringify(data.filters) : null,
                data.user_email || 'anonymous'
            ]
        );

        if (data.format === 'pdf') {
            // PDF is generated client-side; just record the job as completed for history
            await db.query(
                `UPDATE report_jobs SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [jobId]
            );
            return res.status(202).json({
                success: true,
                message: 'Report job recorded',
                data: {
                    job_id: jobId,
                    status: 'completed',
                    report_type: data.report_type,
                    format: data.format,
                    estimated_completion: new Date().toISOString(),
                    status_url: `/reports/${jobId}`,
                },
            });
        }

        if (REPORT_SQL_BY_TYPE[data.report_type]) {
            try {
                const payload = await buildReportPayload(data.report_type, data.format);
                await db.query(
                    `UPDATE report_jobs
                     SET status = $1,
                         result_data = $2,
                         download_url = $3,
                         error_message = NULL,
                         completed_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $4`,
                    [
                        'completed',
                        JSON.stringify({
                            inline_file_base64: payload.content.toString('base64'),
                            mime_type: FORMAT_MIME[data.format] || 'application/octet-stream',
                            filename: payload.filename,
                            file_size: payload.content.length,
                        }),
                        'inline',
                        jobId,
                    ]
                );
            } catch (inlineErr) {
                const message = String(inlineErr.message || 'Report generation failed').slice(0, 1024);
                await db.query(
                    `UPDATE report_jobs
                     SET status = $1,
                         error_message = $2,
                         completed_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $3`,
                    ['failed', message, jobId]
                );

                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate report',
                    message,
                });
            }

            return res.status(202).json({
                success: true,
                message: 'Report generation started',
                data: {
                    job_id: jobId,
                    status: 'processing',
                    report_type: data.report_type,
                    format: data.format,
                    estimated_completion: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                    status_url: `/reports/${jobId}`,
                },
            });
        }

        // Trigger n8n workflow for report generation (async)
        try {
            await triggerWorkflow('generate-report', {
                job_id: jobId,
                report_type: data.report_type,
                format: data.format,
                filters: data.filters || {},
                user_email: data.user_email
            }, { strict: true });
        } catch (triggerErr) {
            const errorMessage = String(triggerErr.message || 'Unknown report trigger error').slice(0, 1024);
            await db.query(
                `UPDATE report_jobs
                 SET status = $1,
                     error_message = $2,
                     completed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $3`,
                ['failed', errorMessage, jobId]
            );

            return res.status(502).json({
                success: false,
                error: 'Failed to start report generation',
                message: errorMessage
            });
        }

        // Return 202 Accepted with job_id
        res.status(202).json({
            success: true,
            message: 'Report generation started',
            data: {
                job_id: jobId,
                status: 'processing',
                report_type: data.report_type,
                format: data.format,
                estimated_completion: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // +2 minutes
                status_url: `/reports/${jobId}`
            }
        });
    } catch (err) {
        next(err);
    }
});

// POST /reports/share - Prepare and optionally attach a report share email
router.post('/share', requireAuth, blockContributors, requirePermission('qc.reports.generate'), async (req, res, next) => {
    try {
        const data = shareReportSchema.parse(req.body);
        const fromEmail = systemReportSenderEmail();
        const subject = `${data.report_name} report`;
        const jobId = data.attach_export ? uuidv4() : null;
        let attachmentDownloadUrl = null;
        let attachmentFilename = null;
        let attachmentMimeType = null;
        let attachmentSize = null;
        let attachmentPayload = null;
        let attachmentNote = null;

        if (data.attach_export) {
            if (data.format === 'pdf') {
                if (data.attachment) {
                    const normalizedBase64 = data.attachment.content_base64
                        .replace(/^data:[^;]+;base64,/i, '')
                        .replace(/\s/g, '');
                    const content = Buffer.from(normalizedBase64, 'base64');

                    attachmentPayload = {
                        inline_file_base64: normalizedBase64,
                        mime_type: data.attachment.mime_type,
                        filename: data.attachment.filename,
                        file_size: content.length,
                        shared_with: data.recipients,
                        share_url: data.share_url,
                    };
                    attachmentFilename = data.attachment.filename;
                    attachmentMimeType = data.attachment.mime_type;
                    attachmentSize = content.length;
                } else {
                    attachmentNote = 'PDF export was not uploaded; email includes the shareable report link only.';
                }
            } else {
                const payload = await buildReportPayload(data.report_type, data.format);
                attachmentPayload = {
                    inline_file_base64: payload.content.toString('base64'),
                    mime_type: FORMAT_MIME[data.format] || 'application/octet-stream',
                    filename: payload.filename,
                    file_size: payload.content.length,
                    shared_with: data.recipients,
                    share_url: data.share_url,
                };
                attachmentFilename = payload.filename;
                attachmentMimeType = FORMAT_MIME[data.format] || 'application/octet-stream';
                attachmentSize = payload.content.length;
            }
        }

        if (jobId) {
            await db.query(
                `INSERT INTO report_jobs (
                    id, report_type, format, status, filters, result_data, download_url, filename, file_size, user_email, completed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
                [
                    jobId,
                    data.report_type,
                    data.format,
                    'completed',
                    data.filters ? JSON.stringify(data.filters) : null,
                    attachmentPayload ? JSON.stringify(attachmentPayload) : JSON.stringify({
                        shared_with: data.recipients,
                        share_url: data.share_url,
                        attachment_note: attachmentNote,
                    }),
                    attachmentPayload ? 'inline' : null,
                    attachmentFilename,
                    attachmentSize,
                    fromEmail,
                ]
            );

            if (attachmentPayload) {
                attachmentDownloadUrl = `${requestOrigin(req)}/reports/${jobId}/download`;
            }
        }

        const lines = [
            data.message || `A ${data.report_name} report has been shared with you.`,
            '',
            `View report: ${data.share_url}`,
        ];

        if (attachmentDownloadUrl) {
            lines.push('', `Attachment: ${attachmentDownloadUrl}`);
        } else if (attachmentNote) {
            lines.push('', attachmentNote);
        }

        const emailBody = lines.join('\n');
        const emailHref = mailtoHref(data.recipients, subject, emailBody);

        try {
            await triggerWorkflow('share-report', {
                report_id: data.report_id,
                report_name: data.report_name,
                report_type: data.report_type,
                format: data.format,
                recipients: data.recipients,
                from_email: fromEmail,
                delivery_channel: 'system_email',
                subject,
                body: emailBody,
                share_url: data.share_url,
                attachment_download_url: attachmentDownloadUrl,
                attachment: attachmentPayload ? {
                    filename: attachmentFilename,
                    mime_type: attachmentMimeType,
                    size_bytes: attachmentSize,
                    content_base64: attachmentPayload.inline_file_base64,
                } : null,
            }, { strict: true });
        } catch (workflowErr) {
            return res.status(502).json({
                success: false,
                error: 'Failed to send report email',
                message: workflowErr.message || 'The report email workflow is not available.',
                data: {
                    recipients: data.recipients,
                    share_url: data.share_url,
                    job_id: jobId,
                    attachment_download_url: attachmentDownloadUrl,
                    attachment_filename: attachmentFilename,
                },
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Report share email sent',
            data: {
                recipients: data.recipients,
                share_url: data.share_url,
                job_id: jobId,
                attachment_download_url: attachmentDownloadUrl,
                attachment_filename: attachmentFilename,
                attachment_note: attachmentNote,
                email_subject: subject,
                email_body: emailBody,
                email_href: emailHref,
            },
        });
    } catch (err) {
        next(err);
    }
});

// GET /reports/:job_id/download - Proxy report file download through API (avoids browser CORS)
router.get('/:job_id/download', requireAuth, blockContributors, requirePermission('qc.reports.export'), async (req, res, next) => {
    try {
        const { job_id } = req.params;

        const result = await db.query('SELECT * FROM report_jobs WHERE id = $1', [job_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report job not found' });
        }

        const job = result.rows[0];
        if (job.status !== 'completed' || !job.download_url) {
            return res.status(409).json({ error: 'Report is not ready for download' });
        }

        if (job.result_data && job.result_data.inline_file_base64) {
            const inlineData = job.result_data;
            const contentBuffer = Buffer.from(inlineData.inline_file_base64, 'base64');
            const contentType = inlineData.mime_type || FORMAT_MIME[job.format] || 'application/octet-stream';
            const filename = inlineData.filename || job.filename || `report-${job.id}.${job.format || 'dat'}`;

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', downloadDisposition(filename));
            res.setHeader('Content-Length', contentBuffer.length);
            return res.send(contentBuffer);
        }

        const upstream = await axios.get(job.download_url, {
            responseType: 'stream',
            timeout: 30000,
        });

        const filename = job.filename || `report-${job.id}.${job.format || 'dat'}`;
        const contentType = upstream.headers['content-type'] || FORMAT_MIME[job.format] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', downloadDisposition(filename));

        const contentLength = upstream.headers['content-length'];
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        upstream.data.on('error', (streamErr) => {
            if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to stream report file' });
                return;
            }
            res.destroy(streamErr);
        });

        upstream.data.pipe(res);
    } catch (err) {
        if (err.response) {
            return res.status(502).json({ error: 'Failed to fetch report file from source' });
        }
        next(err);
    }
});

// GET /reports/:job_id - Check report status
router.get('/:job_id', requireAuth, blockContributors, requirePermission('qc.reports.view'), async (req, res, next) => {
    try {
        const { job_id } = req.params;

        const result = await db.query(
            'SELECT * FROM report_jobs WHERE id = $1',
            [job_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Report job not found' 
            });
        }

        const job = result.rows[0];
        const hasInlineFile = Boolean(job.result_data && job.result_data.inline_file_base64);
        const proxiedDownloadUrl = (job.download_url || hasInlineFile)
            ? `${req.protocol}://${req.get('host')}/reports/${job.id}/download`
            : null;

        res.json({
            success: true,
            data: {
                job_id: job.id,
                report_type: job.report_type,
                format: job.format,
                status: job.status,
                download_url: proxiedDownloadUrl,
                filename: job.filename || (job.result_data && job.result_data.filename) || null,
                file_size: job.file_size || (job.result_data && job.result_data.file_size) || null,
                error_message: job.error_message,
                filters: job.filters,
                created_at: job.created_at,
                completed_at: job.completed_at
            }
        });
    } catch (err) {
        next(err);
    }
});

// POST /reports/callback - n8n callback to update job status (webhook)
router.post('/callback', async (req, res, next) => {
    try {
        const { job_id, status, download_url, filename, file_size, error_message } = req.body;

        if (!job_id || !status) {
            return res.status(400).json({ error: 'job_id and status are required' });
        }

        // Update job status
        await db.query(
            `UPDATE report_jobs 
             SET status = $1,
                 download_url = $2,
                 filename = $3,
                 file_size = $4,
                 error_message = $5,
                 completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
             WHERE id = $6`,
            [status, download_url, filename, file_size, error_message, job_id]
        );

        res.json({ success: true, message: 'Report job updated' });
    } catch (err) {
        next(err);
    }
});

// GET /reports - List all report jobs (with pagination)
router.get('/', requireAuth, blockContributors, requirePermission('qc.reports.view'), async (req, res, next) => {
    try {
        const { user_email, status, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM report_jobs WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (user_email) {
            query += ` AND user_email = $${paramCount}`;
            params.push(user_email);
            paramCount++;
        }

        if (status) {
            query += ` AND status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rowCount
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
