const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

// Validation Schemas
const testResultSchema = z.object({
  test_case_id: z.string().min(1).max(100),
  test_case_title: z.string().max(500).optional(),
  status: z.enum(['passed', 'failed', 'not_run', 'blocked', 'rejected']),
  executed_at: z.string().optional(), // ISO date string, defaults to today
  notes: z.string().optional(),
  tester_name: z.string().max(200).optional()
});

const bulkUploadSchema = z.object({
  project_id: z.string().uuid(),
  results: z.array(testResultSchema).min(1),
  upload_date: z.string().optional() // Optional override for all results
});

// ============================================================================
// TEST RESULTS ENDPOINTS
// ============================================================================

// GET /test-results - List test results with filters
router.get('/test-results', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const {
      project_id,
      test_case_id,
      status,
      from_date,
      to_date,
      latest_only = 'false',
      limit = 100,
      offset = 0
    } = req.query;

    let query;
    const params = [];
    let paramCount = 1;

    if (latest_only === 'true') {
      // Use latest results view
      query = `SELECT * FROM v_latest_test_results WHERE 1=1`;

      if (project_id) {
        query += ` AND project_id = $${paramCount}`;
        params.push(project_id);
        paramCount++;
      }

      if (test_case_id) {
        query += ` AND test_case_id = $${paramCount}`;
        params.push(test_case_id);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      query += ` ORDER BY executed_at DESC, test_case_id`;
    } else {
      // All results
      query = `
        SELECT
          tr.*,
          p.name AS project_name
        FROM test_result tr
        LEFT JOIN project p ON tr.project_id = p.id
        WHERE tr.deleted_at IS NULL
      `;

      if (project_id) {
        query += ` AND tr.project_id = $${paramCount}`;
        params.push(project_id);
        paramCount++;
      }

      if (test_case_id) {
        query += ` AND tr.test_case_id = $${paramCount}`;
        params.push(test_case_id);
        paramCount++;
      }

      if (status) {
        query += ` AND tr.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (from_date) {
        query += ` AND tr.executed_at >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND tr.executed_at <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      query += ` ORDER BY tr.executed_at DESC, tr.test_case_id`;
    }

    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /test-results/project/:project_id/metrics - Get project quality metrics
router.get('/test-results/project/:project_id/metrics', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { project_id } = req.params;

    const result = await pool.query(
      'SELECT * FROM v_project_quality_metrics WHERE project_id = $1',
      [project_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        project_id,
        message: 'No test results found for this project',
        metrics: null
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /test-results/project/:project_id/trends - Get execution trends for charts
router.get('/test-results/project/:project_id/trends', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { project_id } = req.params;
    const { days = 30 } = req.query;

    const result = await pool.query(
      `SELECT *
       FROM v_test_execution_trends
       WHERE project_id = $1
         AND execution_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
       ORDER BY execution_date DESC`,
      [project_id]
    );

    res.json({
      project_id,
      days: parseInt(days),
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// GET /test-results/test-case/:test_case_id/history - Get test case history
router.get('/test-results/test-case/:test_case_id/history', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { test_case_id } = req.params;
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id query parameter is required' });
    }

    // Get summary
    const summaryResult = await pool.query(
      'SELECT * FROM v_test_case_history WHERE test_case_id = $1 AND project_id = $2',
      [test_case_id, project_id]
    );

    // Get detailed history
    const historyResult = await pool.query(
      `SELECT
        tr.*,
        p.name AS project_name
       FROM test_result tr
       LEFT JOIN project p ON tr.project_id = p.id
       WHERE tr.test_case_id = $1
         AND tr.project_id = $2
         AND tr.deleted_at IS NULL
       ORDER BY tr.executed_at DESC, tr.created_at DESC
       LIMIT 50`,
      [test_case_id, project_id]
    );

    res.json({
      summary: summaryResult.rows[0] || null,
      history: historyResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// POST /test-results/upload - Bulk upload test results from Excel
router.post('/test-results/upload', requireAuth, requirePermission('action:test-results:upload'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const validatedData = bulkUploadSchema.parse(req.body);
    const { project_id, results, upload_date } = validatedData;

    await client.query('BEGIN');

    // Generate upload batch ID for grouping
    const uploadBatchId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;

    const importResults = {
      success: [],
      errors: [],
      duplicates: [],
      updated: []
    };

    for (let i = 0; i < results.length; i++) {
      const testResult = results[i];

      try {
        const executedDate = upload_date || testResult.executed_at || new Date().toISOString().split('T')[0];

        // Check for existing result on same date
        const existingResult = await client.query(
          `SELECT id FROM test_result
           WHERE test_case_id = $1
             AND project_id = $2
             AND executed_at = $3
             AND deleted_at IS NULL`,
          [testResult.test_case_id, project_id, executedDate]
        );

        if (existingResult.rows.length > 0) {
          // Update existing result
          const updateResult = await client.query(
            `UPDATE test_result
             SET status = $1,
                 test_case_title = COALESCE($2, test_case_title),
                 notes = $3,
                 tester_name = $4,
                 upload_batch_id = $5,
                 uploaded_by = $6,
                 uploaded_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING id, test_case_id, status`,
            [
              testResult.status,
              testResult.test_case_title,
              testResult.notes,
              testResult.tester_name,
              uploadBatchId,
              req.user?.id || null,
              existingResult.rows[0].id
            ]
          );

          importResults.updated.push({
            row: i + 1,
            test_case_id: testResult.test_case_id,
            status: testResult.status,
            executed_at: executedDate
          });
        } else {
          // Insert new result
          const insertResult = await client.query(
            `INSERT INTO test_result (
              test_case_id,
              test_case_title,
              project_id,
              status,
              executed_at,
              notes,
              tester_name,
              upload_batch_id,
              uploaded_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, test_case_id, status`,
            [
              testResult.test_case_id,
              testResult.test_case_title,
              project_id,
              testResult.status,
              executedDate,
              testResult.notes,
              testResult.tester_name,
              uploadBatchId,
              req.user?.id || null
            ]
          );

          importResults.success.push({
            row: i + 1,
            test_case_id: testResult.test_case_id,
            status: testResult.status,
            executed_at: executedDate
          });
        }

      } catch (error) {
        importResults.errors.push({
          row: i + 1,
          test_case_id: testResult.test_case_id || 'N/A',
          error: error.message
        });
      }
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_results_uploaded',
        'test_result',
        uploadBatchId,
        req.user?.id || null,
        JSON.stringify({
          project_id,
          total: results.length,
          success: importResults.success.length,
          updated: importResults.updated.length,
          errors: importResults.errors.length,
          upload_batch_id: uploadBatchId
        })
      ]
    );

    await client.query('COMMIT');

    res.json({
      upload_batch_id: uploadBatchId,
      summary: {
        total: results.length,
        imported: importResults.success.length,
        updated: importResults.updated.length,
        errors: importResults.errors.length,
        success_rate: (((importResults.success.length + importResults.updated.length) / results.length) * 100).toFixed(2) + '%'
      },
      details: importResults
    });

  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  } finally {
    client.release();
  }
});

// GET /test-results/uploads - List upload batches
router.get('/test-results/uploads', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { project_id, limit = 20 } = req.query;

    let query = `
      SELECT
        upload_batch_id,
        project_id,
        p.name AS project_name,
        MIN(uploaded_at) AS uploaded_at,
        MAX(uploaded_by) AS uploaded_by,
        u.name AS uploaded_by_name,
        COUNT(*) AS results_count,
        COUNT(*) FILTER (WHERE status = 'passed') AS passed_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
        MIN(executed_at) AS earliest_execution_date,
        MAX(executed_at) AS latest_execution_date
      FROM test_result tr
      LEFT JOIN project p ON tr.project_id = p.id
      LEFT JOIN app_user u ON tr.uploaded_by = u.id
      WHERE tr.deleted_at IS NULL
        AND tr.upload_batch_id IS NOT NULL
    `;

    const params = [];
    if (project_id) {
      query += ` AND tr.project_id = $1`;
      params.push(project_id);
    }

    query += `
      GROUP BY upload_batch_id, project_id, p.name, u.name
      ORDER BY MIN(uploaded_at) DESC
      LIMIT $${params.length + 1}
    `;

    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /test-results/:id - Soft delete test result
router.delete('/test-results/:id', requireAuth, requirePermission('action:test-results:delete'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE test_result
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test result not found' });
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_result_deleted',
        'test_result',
        id,
        req.user?.id || null,
        JSON.stringify({
          test_case_id: result.rows[0].test_case_id,
          executed_at: result.rows[0].executed_at
        })
      ]
    );

    await client.query('COMMIT');

    res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
