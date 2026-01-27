const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { z } = require('zod');
const { triggerWorkflow } = require('../utils/n8n');
const { v4: uuidv4 } = require('uuid');

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
router.post('/', async (req, res, next) => {
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

        // Trigger n8n workflow for report generation (async)
        triggerWorkflow('report-generate', {
            job_id: jobId,
            report_type: data.report_type,
            format: data.format,
            filters: data.filters || {},
            user_email: data.user_email
        });

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

// GET /reports/:job_id - Check report status
router.get('/:job_id', async (req, res, next) => {
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

        res.json({
            success: true,
            data: {
                job_id: job.id,
                report_type: job.report_type,
                format: job.format,
                status: job.status,
                download_url: job.download_url,
                filename: job.filename,
                file_size: job.file_size,
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
router.get('/', async (req, res, next) => {
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
