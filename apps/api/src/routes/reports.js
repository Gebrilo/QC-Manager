const express = require('express');
const router = express.Router();
const db = require('../config/db');
const axios = require('axios');
const { z } = require('zod');
const { triggerWorkflow } = require('../utils/n8n');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
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

// POST /reports - Generate report (returns job_id)
router.post('/', requireAuth, requirePermission('qc.reports.generate'), async (req, res, next) => {
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

// GET /reports/:job_id/download - Proxy report file download through API (avoids browser CORS)
router.get('/:job_id/download', requireAuth, requirePermission('qc.reports.view'), async (req, res, next) => {
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
router.get('/:job_id', requireAuth, requirePermission('qc.reports.view'), async (req, res, next) => {
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
router.get('/', requireAuth, requirePermission('qc.reports.view'), async (req, res, next) => {
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
