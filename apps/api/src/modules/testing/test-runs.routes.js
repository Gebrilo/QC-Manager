const express = require('express');
const router = express.Router();
const { pool } = require('../../config/db');
const { z } = require('zod');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAuth, requirePermission } = require('../../middleware/authMiddleware');

const executionsRouter = express.Router();
// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx|xls|csv)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// Validation Schemas
const testRunCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  project_id: z.string().uuid(),
  status: z.enum(['in_progress', 'completed', 'aborted']).default('in_progress')
});

const testRunUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['in_progress', 'completed', 'aborted']).optional()
});

const testExecutionCreateSchema = z.object({
  test_case_id: z.string().uuid(),
  test_run_id: z.string().uuid(),
  status: z.enum(['pass', 'fail', 'not_run', 'blocked', 'skipped']),
  notes: z.string().optional(),
  duration_seconds: z.number().int().positive().optional(),
  defect_ids: z.array(z.string()).optional().default([])
});

const testExecutionUpdateSchema = z.object({
  status: z.enum(['pass', 'fail', 'not_run', 'blocked', 'skipped']).optional(),
  notes: z.string().optional(),
  duration_seconds: z.number().int().positive().optional().nullable(),
  defect_ids: z.array(z.string()).optional(),
  assigned_to: z.string().uuid().nullable().optional()
});

function shouldStampExecution(existingStatus, nextStatus) {
  return nextStatus !== undefined && nextStatus !== existingStatus && nextStatus !== 'not_run';
}

function parseCsvParam(value) {
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

// ============================================================================
// DASHBOARD SUMMARY - For Governance Dashboard
// ============================================================================

// GET /summary - Aggregate stats for dashboard
executionsRouter.get('/summary', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const { project_id } = req.query;

    let whereClause = 'WHERE tr.deleted_at IS NULL';
    const params = [];

    if (project_id) {
      params.push(project_id);
      whereClause += ` AND tr.project_id = $1`;
    }

    // Overall summary
    const summaryResult = await pool.query(`
      SELECT
        COUNT(DISTINCT tr.id)::INTEGER as total_test_runs,
        COUNT(te.id)::INTEGER as total_executions,
        COALESCE(SUM(CASE WHEN te.status = 'pass' THEN 1 ELSE 0 END), 0)::INTEGER as total_passed,
        COALESCE(SUM(CASE WHEN te.status = 'fail' THEN 1 ELSE 0 END), 0)::INTEGER as total_failed,
        COALESCE(SUM(CASE WHEN te.status = 'not_run' THEN 1 ELSE 0 END), 0)::INTEGER as total_not_run,
        COALESCE(SUM(CASE WHEN te.status = 'blocked' THEN 1 ELSE 0 END), 0)::INTEGER as total_blocked,
        COALESCE(SUM(CASE WHEN te.status = 'skipped' THEN 1 ELSE 0 END), 0)::INTEGER as total_skipped,
        CASE 
          WHEN COUNT(te.id) > 0
          THEN ROUND((SUM(CASE WHEN te.status = 'pass' THEN 1 ELSE 0 END)::NUMERIC / COUNT(te.id)) * 100, 2)
          ELSE 0
        END as overall_pass_rate,
        MAX(tr.started_at) as last_execution_date
      FROM test_run tr
      LEFT JOIN test_execution te ON tr.id = te.test_run_id
      ${whereClause}
    `, params);

    // Recent test runs
    const recentRunsResult = await pool.query(`
      SELECT
        tr.id,
        tr.run_id,
        tr.name,
        tr.status,
        tr.started_at,
        p.project_name,
        COUNT(te.id)::INTEGER as total_cases,
        COALESCE(SUM(CASE WHEN te.status = 'pass' THEN 1 ELSE 0 END), 0)::INTEGER as passed,
        COALESCE(SUM(CASE WHEN te.status = 'fail' THEN 1 ELSE 0 END), 0)::INTEGER as failed,
        CASE 
          WHEN COUNT(te.id) > 0
          THEN ROUND((SUM(CASE WHEN te.status = 'pass' THEN 1 ELSE 0 END)::NUMERIC / COUNT(te.id)) * 100, 2)
          ELSE 0
        END as pass_rate
      FROM test_run tr
      LEFT JOIN projects p ON tr.project_id = p.id
      LEFT JOIN test_execution te ON tr.id = te.test_run_id
      WHERE tr.deleted_at IS NULL
      GROUP BY tr.id, tr.run_id, tr.name, tr.status, tr.started_at, p.project_name
      ORDER BY tr.started_at DESC
      LIMIT 10
    `);

    res.json({
      summary: summaryResult.rows[0] || {
        total_test_runs: 0,
        total_executions: 0,
        total_passed: 0,
        total_failed: 0,
        total_not_run: 0,
        total_blocked: 0,
        total_skipped: 0,
        overall_pass_rate: 0,
        last_execution_date: null
      },
      recent_runs: recentRunsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// TEST RUNS
// ============================================================================

// GET /test-runs - List all test runs
executionsRouter.get('/test-runs', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const { project_id, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        tr.*,
        p.project_name,
        u.name AS created_by_name,
        COUNT(te.id) AS total_executions,
        COUNT(te.id) FILTER (WHERE te.status = 'pass') AS pass_count,
        COUNT(te.id) FILTER (WHERE te.status = 'fail') AS fail_count,
        COUNT(te.id) FILTER (WHERE te.status = 'not_run') AS not_run_count,
        COUNT(te.id) FILTER (WHERE te.status = 'blocked') AS blocked_count,
        CASE
          WHEN COUNT(te.id) > 0 THEN
            ROUND((COUNT(te.id) FILTER (WHERE te.status = 'pass')::NUMERIC / COUNT(te.id)::NUMERIC) * 100, 2)
          ELSE 0
        END AS pass_rate_pct
      FROM test_run tr
      LEFT JOIN projects p ON tr.project_id = p.id
      LEFT JOIN app_user u ON tr.created_by = u.id
      LEFT JOIN test_execution te ON tr.id = te.test_run_id
      WHERE tr.deleted_at IS NULL
    `;

    const params = [];
    let paramCount = 1;

    if (project_id) {
      query += ` AND tr.project_id = $${paramCount}`;
      params.push(project_id);
      paramCount++;
    }

    if (status) {
      query += ` AND tr.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += `
      GROUP BY tr.id, p.project_name, u.name
      ORDER BY tr.started_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

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

// GET /test-runs/:id - Get single test run with executions
executionsRouter.get('/test-runs/:id', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get test run
    const runResult = await pool.query(
      `SELECT
        tr.*,
        p.project_name,
        u.name AS created_by_name
      FROM test_run tr
      LEFT JOIN projects p ON tr.project_id = p.id
      LEFT JOIN app_user u ON tr.created_by = u.id
      WHERE tr.id = $1 AND tr.deleted_at IS NULL`,
      [id]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test run not found' });
    }

    // Get executions
    const executionsResult = await pool.query(
      `SELECT
        te.*,
        te.test_case_id AS test_case_uuid,
        COALESCE(tc.test_case_id, te.test_case_id::text) AS test_case_id,
        COALESCE(te.test_case_title, tc.title) AS test_case_title,
        COALESCE(te.test_case_steps, tc.test_steps) AS test_case_steps,
        COALESCE(te.expected_result, tc.expected_result) AS expected_result,
        tc.category,
        tc.priority,
        assignee.name AS assigned_to_name,
        u.name AS executed_by_name
      FROM test_execution te
      LEFT JOIN test_case tc ON te.test_case_id = tc.id
      LEFT JOIN app_user assignee ON te.assigned_to = assignee.id
      LEFT JOIN app_user u ON te.executed_by = u.id
      WHERE te.test_run_id = $1
      ORDER BY
        CASE WHEN COALESCE(te.sort_order, 0) > 0 THEN 0 ELSE 1 END,
        te.sort_order ASC,
        te.created_at ASC`,
      [id]
    );

    // Calculate metrics
    const executions = executionsResult.rows;
    const total = executions.length;
    const pass = executions.filter(e => e.status === 'pass').length;
    const fail = executions.filter(e => e.status === 'fail').length;
    const notRun = executions.filter(e => e.status === 'not_run').length;
    const blocked = executions.filter(e => e.status === 'blocked').length;
    const skipped = executions.filter(e => e.status === 'skipped').length;

    res.json({
      ...runResult.rows[0],
      metrics: {
        total_executions: total,
        pass_count: pass,
        fail_count: fail,
        not_run_count: notRun,
        blocked_count: blocked,
        skipped_count: skipped,
        pass_rate_pct: total > 0 ? ((pass / total) * 100).toFixed(2) : 0,
        not_run_pct: total > 0 ? ((notRun / total) * 100).toFixed(2) : 0
      },
      executions
    });
  } catch (error) {
    next(error);
  }
});

// POST /test-runs - Create new test run
executionsRouter.post('/test-runs', requireAuth, requirePermission('qc.testexecutions.create'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const validatedData = testRunCreateSchema.parse(req.body);

    await client.query('BEGIN');

    // Generate next run_id
    const idResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(run_id FROM 5) AS INTEGER)), 0) + 1 AS next_id
       FROM test_run
       WHERE run_id ~ '^RUN-[0-9]+$'`
    );
    const nextId = idResult.rows[0].next_id;
    const runId = `RUN-${String(nextId).padStart(4, '0')}`;

    // Insert test run
    const result = await client.query(
      `INSERT INTO test_run (
        run_id, name, description, project_id, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        runId,
        validatedData.name,
        validatedData.description || null,
        validatedData.project_id,
        validatedData.status,
        req.user?.id || null
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_run_created',
        'test_run',
        result.rows[0].id,
        req.user?.id || null,
        JSON.stringify({ run_id: runId, name: validatedData.name })
      ]
    );

    await client.query('COMMIT');

    res.status(201).json(result.rows[0]);
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

// PATCH /test-runs/:id - Update test run
executionsRouter.patch('/test-runs/:id', requireAuth, requirePermission('qc.testexecutions.edit'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const validatedData = testRunUpdateSchema.parse(req.body);

    await client.query('BEGIN');

    // Check if exists
    const existingResult = await client.query(
      'SELECT * FROM test_run WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test run not found' });
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (validatedData.name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(validatedData.name);
      paramCount++;
    }

    if (validatedData.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      params.push(validatedData.description);
      paramCount++;
    }

    if (validatedData.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      params.push(validatedData.status);
      paramCount++;

      // Auto-set completed_at if status is completed
      if (validatedData.status === 'completed') {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    const query = `
      UPDATE test_run
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, params);

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        validatedData.status === 'completed' ? 'test_run_completed' : 'test_run_updated',
        'test_run',
        id,
        req.user?.id || null,
        JSON.stringify({ updates: validatedData })
      ]
    );

    await client.query('COMMIT');

    res.json(result.rows[0]);
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

// DELETE /test-runs/:id - Soft delete test run
executionsRouter.delete('/test-runs/:id', requireAuth, requirePermission('qc.testexecutions.delete'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if exists
    const existingResult = await client.query(
      'SELECT * FROM test_run WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test run not found' });
    }

    const run = existingResult.rows[0];

    // Soft delete
    await client.query(
      'UPDATE test_run SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    // Clear governance data for this project+date so metrics reflect the deletion
    await client.query(
      `DELETE FROM test_result
       WHERE project_id = $1
         AND executed_at = $2::date
         AND deleted_at IS NULL`,
      [run.project_id, run.started_at]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_uuid, user_email, change_summary)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'delete',
        'test_run',
        id,
        req.user?.email || 'system',
        `Deleted test run: ${existingResult.rows[0].run_id}`
      ]
    );

    await client.query('COMMIT');

    res.json({ message: 'Test run deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================================================
// TEST EXECUTIONS
// ============================================================================

// GET /executions - List executions (with filters)
executionsRouter.get('/executions', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const { test_run_id, test_case_id, status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        te.*,
        te.test_case_id AS test_case_uuid,
        COALESCE(tc.test_case_id, te.test_case_id::text) AS test_case_id,
        COALESCE(te.test_case_title, tc.title) AS test_case_title,
        COALESCE(te.test_case_steps, tc.test_steps) AS test_case_steps,
        COALESCE(te.expected_result, tc.expected_result) AS expected_result,
        tc.category,
        tr.run_id,
        tr.name AS test_run_name,
        assignee.name AS assigned_to_name,
        u.name AS executed_by_name
      FROM test_execution te
      LEFT JOIN test_case tc ON te.test_case_id = tc.id
      LEFT JOIN test_run tr ON te.test_run_id = tr.id
      LEFT JOIN app_user assignee ON te.assigned_to = assignee.id
      LEFT JOIN app_user u ON te.executed_by = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (test_run_id) {
      query += ` AND te.test_run_id = $${paramCount}`;
      params.push(test_run_id);
      paramCount++;
    }

    if (test_case_id) {
      query += ` AND te.test_case_id = $${paramCount}`;
      params.push(test_case_id);
      paramCount++;
    }

    if (status) {
      query += ` AND te.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY
      CASE WHEN COALESCE(te.sort_order, 0) > 0 THEN 0 ELSE 1 END,
      te.sort_order ASC,
      te.created_at DESC`;
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

// POST /executions - Log single test execution
executionsRouter.post('/executions', requireAuth, requirePermission('qc.testexecutions.create'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const validatedData = testExecutionCreateSchema.parse(req.body);

    await client.query('BEGIN');

    // Check for duplicate
    const duplicateCheck = await client.query(
      `SELECT id FROM test_execution
       WHERE test_case_id = $1 AND test_run_id = $2`,
      [validatedData.test_case_id, validatedData.test_run_id]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Execution already logged for this test case in this run',
        existing_id: duplicateCheck.rows[0].id
      });
    }

    // Insert execution
    const result = await client.query(
      `INSERT INTO test_execution (
        test_case_id, test_run_id, status, notes,
        duration_seconds, defect_ids, executed_by, executed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $3 <> 'not_run' THEN CURRENT_TIMESTAMP ELSE NULL END)
      RETURNING *`,
      [
        validatedData.test_case_id,
        validatedData.test_run_id,
        validatedData.status,
        validatedData.notes || null,
        validatedData.duration_seconds || null,
        validatedData.defect_ids,
        validatedData.status !== 'not_run' ? req.user?.id || null : null
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_execution_logged',
        'test_execution',
        result.rows[0].id,
        req.user?.id || null,
        JSON.stringify({
          test_case_id: validatedData.test_case_id,
          test_run_id: validatedData.test_run_id,
          status: validatedData.status
        })
      ]
    );

    await client.query('COMMIT');

    res.status(201).json(result.rows[0]);
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

// PATCH /executions/:id - Update execution
executionsRouter.patch('/executions/:id', requireAuth, requirePermission('qc.testexecutions.edit'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const validatedData = testExecutionUpdateSchema.parse(req.body);

    await client.query('BEGIN');

    // Check if exists
    const existingResult = await client.query(
      'SELECT * FROM test_execution WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    const existing = existingResult.rows[0];

    if (validatedData.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      params.push(validatedData.status);
      paramCount++;

      if (shouldStampExecution(existing.status, validatedData.status)) {
        updates.push(`executed_by = $${paramCount}`);
        params.push(req.user?.id || null);
        paramCount++;
        updates.push(`executed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (validatedData.notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      params.push(validatedData.notes);
      paramCount++;
    }

    if (validatedData.duration_seconds !== undefined) {
      updates.push(`duration_seconds = $${paramCount}`);
      params.push(validatedData.duration_seconds);
      paramCount++;
    }

    if (validatedData.defect_ids !== undefined) {
      updates.push(`defect_ids = $${paramCount}`);
      params.push(validatedData.defect_ids);
      paramCount++;
    }

    if (validatedData.assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramCount}`);
      params.push(validatedData.assigned_to || null);
      paramCount++;
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    const query = `
      UPDATE test_execution
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, params);

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_execution_updated',
        'test_execution',
        id,
        req.user?.id || null,
        JSON.stringify({ updates: validatedData })
      ]
    );

    await client.query('COMMIT');

    res.json(result.rows[0]);
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

// POST /executions/bulk-import - Bulk import execution results
executionsRouter.post('/executions/bulk-import', requireAuth, requirePermission('qc.testexecutions.create'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { executions, test_run_id } = req.body;

    if (!Array.isArray(executions) || executions.length === 0) {
      return res.status(400).json({ error: 'executions array is required' });
    }

    if (!test_run_id) {
      return res.status(400).json({ error: 'test_run_id is required' });
    }

    await client.query('BEGIN');

    const results = {
      success: [],
      errors: [],
      duplicates: []
    };

    for (let i = 0; i < executions.length; i++) {
      const execution = executions[i];

      try {
        // Validate
        const validatedData = testExecutionCreateSchema.parse({
          ...execution,
          test_run_id
        });

        // Check for duplicate
        const duplicateCheck = await client.query(
          `SELECT id FROM test_execution
           WHERE test_case_id = $1 AND test_run_id = $2`,
          [validatedData.test_case_id, test_run_id]
        );

        if (duplicateCheck.rows.length > 0) {
          results.duplicates.push({
            row: i + 1,
            test_case_id: validatedData.test_case_id,
            existing_id: duplicateCheck.rows[0].id
          });
          continue;
        }

        // Insert
        const result = await client.query(
          `INSERT INTO test_execution (
            test_case_id, test_run_id, status, notes,
            duration_seconds, defect_ids, executed_by, executed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $3 <> 'not_run' THEN CURRENT_TIMESTAMP ELSE NULL END)
          RETURNING id, test_case_id, status`,
          [
            validatedData.test_case_id,
            test_run_id,
            validatedData.status,
            validatedData.notes || null,
            validatedData.duration_seconds || null,
            validatedData.defect_ids,
            validatedData.status !== 'not_run' ? req.user?.id || null : null
          ]
        );

        results.success.push({
          row: i + 1,
          id: result.rows[0].id,
          test_case_id: result.rows[0].test_case_id,
          status: result.rows[0].status
        });

      } catch (error) {
        results.errors.push({
          row: i + 1,
          test_case_id: execution.test_case_id || 'N/A',
          error: error.message
        });
      }
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_execution_bulk_import',
        'test_execution',
        null,
        req.user?.id || null,
        JSON.stringify({
          total: executions.length,
          success: results.success.length,
          errors: results.errors.length,
          duplicates: results.duplicates.length,
          test_run_id
        })
      ]
    );

    await client.query('COMMIT');

    res.json({
      summary: {
        total: executions.length,
        imported: results.success.length,
        duplicates: results.duplicates.length,
        errors: results.errors.length,
        success_rate: ((results.success.length / executions.length) * 100).toFixed(2) + '%'
      },
      details: results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Exported for testing
function validateExecutionDate(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const today = new Date().toISOString().split('T')[0];
  if (value > today) {
    throw new Error('Execution date cannot be in the future');
  }
  return value;
}

// ============================================================================
// EXCEL UPLOAD - Import test results from Excel/CSV
// ============================================================================

// POST /upload-excel - Upload Excel file with test results
executionsRouter.post('/upload-excel', requireAuth, requirePermission('qc.testexecutions.create'), upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { project_id, test_run_name, execution_date: rawDate } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Validate execution_date if provided
    let validatedDate;
    try {
      validatedDate = validateExecutionDate(rawDate);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty or has no valid data' });
    }

    await client.query('BEGIN');

    // Create a new test run for this upload
    const idResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(run_id FROM 5) AS INTEGER)), 0) + 1 AS next_id
       FROM test_run
       WHERE run_id ~ '^RUN-[0-9]+$'`
    );
    const nextId = idResult.rows[0].next_id;
    const runId = `RUN-${String(nextId).padStart(4, '0')}`;

    const testRunResult = await client.query(
      validatedDate
        ? `INSERT INTO test_run (run_id, name, description, project_id, status, started_at)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
           RETURNING *`
        : `INSERT INTO test_run (run_id, name, description, project_id, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
      validatedDate
        ? [runId, test_run_name || `Excel Import - ${validatedDate}`, `Imported from file: ${req.file.originalname}`, project_id, 'completed', validatedDate]
        : [runId, test_run_name || `Excel Import - ${new Date().toISOString().split('T')[0]}`, `Imported from file: ${req.file.originalname}`, project_id, 'completed']
    );

    const testRun = testRunResult.rows[0];

    const executedAt = validatedDate || new Date().toISOString().split('T')[0];

    await client.query(
      `DELETE FROM test_result WHERE project_id = $1 AND executed_at = $2 AND deleted_at IS NULL`,
      [project_id, executedAt]
    );

    const results = {
      success: [],
      errors: [],
      summary: {
        pass: 0,
        fail: 0,
        not_run: 0,
        blocked: 0,
        skipped: 0
      }
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      const testCaseId = row['Test Case ID'] || row['test_case_id'] || row['ID'] || row['id'] || row['TestCaseID'];
      const testCaseName = row['Test Case Name'] || row['test_case_name'] || row['Name'] || row['name'] || row['Title'] || row['title'];
      const statusRaw = row['Status'] || row['status'] || row['Result'] || row['result'] || '';
      const notes = row['Notes'] || row['notes'] || row['Comments'] || row['comments'] || '';

      const moduleName = row['Module Name'] || row['module_name'] || row['Module'] || null;
      const requirementId = row['Requirement ID'] || row['requirement_id'] || row['Req ID'] || null;
      const estHoursRaw = row['Est Hours'] || row['estimated_hrs'] || row['Hours'] || null;
      const isRetestRaw = row['Is Retest'] || row['is_retest'] || row['Retest'] || null;

      const estHours = estHoursRaw != null ? parseFloat(estHoursRaw) : null;
      const normalizedEstHours = (estHours != null && !isNaN(estHoursRaw) && estHours >= 0) ? estHours : null;

      const isRetestLower = String(isRetestRaw || '').toLowerCase().trim();
      const normalizedIsRetest = ['true', 'yes', '1'].includes(isRetestLower);

      const statusLower = String(statusRaw).toLowerCase().trim();
      let status = 'not_run';
      let governanceStatus = 'not_run';
      if (['pass', 'passed', 'success', 'ok'].includes(statusLower)) {
        status = 'pass';
        governanceStatus = 'passed';
        results.summary.pass++;
      } else if (['fail', 'failed', 'failure', 'error'].includes(statusLower)) {
        status = 'fail';
        governanceStatus = 'failed';
        results.summary.fail++;
      } else if (['blocked', 'block'].includes(statusLower)) {
        status = 'blocked';
        governanceStatus = 'blocked';
        results.summary.blocked++;
      } else if (['skipped', 'skip', 'rejected'].includes(statusLower)) {
        status = 'skipped';
        governanceStatus = 'rejected';
        results.summary.skipped++;
      } else if (['not run', 'not_run', 'not executed', 'not_executed', 'pending', ''].includes(statusLower)) {
        status = 'not_run';
        governanceStatus = 'not_run';
        results.summary.not_run++;
      }

      try {
        await client.query(
          `INSERT INTO test_execution (
            test_run_id, test_case_id, status, notes
          ) VALUES ($1, NULL, $2, $3)`,
          [testRun.id, status, `${testCaseId ? '[' + testCaseId + '] ' : ''}${testCaseName || ''} - ${notes}`.trim()]
        );

        await client.query(
          `INSERT INTO test_result (
            test_case_id, project_id, executed_at,
            status, notes,
            module_name, requirement_id, estimated_hrs, is_retest
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            testCaseId || testCaseName || `Row ${i + 2}`,
            project_id,
            executedAt,
            governanceStatus,
            notes || null,
            moduleName,
            requirementId,
            normalizedEstHours,
            normalizedIsRetest
          ]
        );

        results.success.push({
          row: i + 2,
          test_case: testCaseId || testCaseName || `Row ${i + 2}`,
          status
        });
      } catch (err) {
        results.errors.push({
          row: i + 2,
          test_case: testCaseId || testCaseName || `Row ${i + 2}`,
          error: err.message
        });
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Excel file processed successfully',
      test_run: {
        id: testRun.id,
        run_id: testRun.run_id,
        name: testRun.name
      },
      summary: {
        total_rows: data.length,
        imported: results.success.length,
        errors: results.errors.length,
        ...results.summary,
        pass_rate: data.length > 0
          ? ((results.summary.pass / data.length) * 100).toFixed(2) + '%'
          : '0%'
      },
      details: results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Excel upload error:', error);
    next(error);
  } finally {
    client.release();
  }
});

// GET /recent-uploads - Get recent test run uploads
executionsRouter.get('/recent-uploads', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const projectIds = parseCsvParam(req.query.project_ids || req.query.project_id);
    const statuses = parseCsvParam(req.query.statuses || req.query.status);
    const environments = parseCsvParam(req.query.environments || req.query.environment);
    const versionTags = parseCsvParam(req.query.version_tags || req.query.version_tag);
    const search = String(req.query.q || req.query.search || '').trim();
    const whereClauses = ['tr.deleted_at IS NULL'];
    const params = [];
    let pn = 1;

    if (projectIds.length > 0) { whereClauses.push(`tr.project_id = ANY($${pn++}::uuid[])`); params.push(projectIds); }
    if (statuses.length > 0) { whereClauses.push(`tr.status = ANY($${pn++}::text[])`); params.push(statuses); }
    if (environments.length > 0) { whereClauses.push(`tr.environment = ANY($${pn++}::text[])`); params.push(environments); }
    if (versionTags.length > 0) { whereClauses.push(`tr.version_tag = ANY($${pn++}::text[])`); params.push(versionTags); }
    if (req.query.created_from) { whereClauses.push(`tr.started_at >= $${pn++}::date`); params.push(req.query.created_from); }
    if (req.query.created_to) { whereClauses.push(`tr.started_at < ($${pn++}::date + INTERVAL '1 day')`); params.push(req.query.created_to); }
    if (req.query.updated_from) { whereClauses.push(`tr.updated_at >= $${pn++}::date`); params.push(req.query.updated_from); }
    if (req.query.updated_to) { whereClauses.push(`tr.updated_at < ($${pn++}::date + INTERVAL '1 day')`); params.push(req.query.updated_to); }
    if ((req.query.related_type || req.query.related_artifact_type) === 'suite' && (req.query.related_id || req.query.related_artifact_id)) {
      whereClauses.push(`tr.suite_id = $${pn++}::uuid`);
      params.push(req.query.related_id || req.query.related_artifact_id);
    }
    if (search) {
      whereClauses.push(`(tr.name ILIKE $${pn} OR tr.run_id ILIKE $${pn} OR p.project_name ILIKE $${pn} OR tr.environment ILIKE $${pn} OR tr.version_tag ILIKE $${pn})`);
      params.push(`%${search}%`);
      pn++;
    }

    const result = await pool.query(`
      SELECT 
        tr.id,
        tr.run_id,
        tr.name,
        tr.description,
        tr.status,
        tr.environment,
        tr.version_tag,
        tr.suite_id,
        tr.started_at,
        p.project_name,
        p.id as project_id,
        COUNT(te.id)::INTEGER as total_cases,
        COALESCE(SUM(CASE WHEN te.status = 'pass' THEN 1 ELSE 0 END), 0)::INTEGER as passed,
        COALESCE(SUM(CASE WHEN te.status = 'fail' THEN 1 ELSE 0 END), 0)::INTEGER as failed,
        COALESCE(SUM(CASE WHEN te.status = 'not_run' THEN 1 ELSE 0 END), 0)::INTEGER as not_run,
        COALESCE(SUM(CASE WHEN te.status = 'blocked' THEN 1 ELSE 0 END), 0)::INTEGER as blocked,
        COALESCE(SUM(CASE WHEN te.status = 'skipped' THEN 1 ELSE 0 END), 0)::INTEGER as skipped,
        CASE 
          WHEN COUNT(te.id) > 0
          THEN ROUND((SUM(CASE WHEN te.status = 'pass' THEN 1 ELSE 0 END)::NUMERIC / COUNT(te.id)) * 100, 2)
          ELSE 0
        END as pass_rate
      FROM test_run tr
      LEFT JOIN projects p ON tr.project_id = p.id
      LEFT JOIN test_execution te ON tr.id = te.test_run_id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY tr.id, tr.run_id, tr.name, tr.description, tr.status, tr.started_at, p.project_name, p.id
      ORDER BY tr.started_at DESC
      LIMIT 20
    `, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});



// ============================================================================
// SUITE-BASED TEST RUN CREATION
// ============================================================================

// POST /test-runs/from-suite — Create test run from suite
executionsRouter.post('/test-runs/from-suite', requireAuth, requirePermission('qc.testexecutions.create'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const suiteRunSchema = z.object({
      suite_id: z.string().uuid(),
      name: z.string().min(1).max(255),
      project_id: z.string().uuid().optional(),
      environment: z.string().max(100).optional(),
      version_tag: z.string().max(50).optional(),
    });
    const validatedData = suiteRunSchema.parse(req.body);

    await client.query('BEGIN');

    // Verify suite exists and has test cases
    const suiteResult = await client.query(
      `SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL`,
      [validatedData.suite_id]
    );
    if (suiteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test suite not found' });
    }
    const suite = suiteResult.rows[0];

    // Get ordered test cases from suite before creating the run so empty suites do not leave orphan runs.
    const suiteCases = await client.query(
      `SELECT tsc.test_case_id, tsc.sort_order, tc.title, tc.test_steps, tc.expected_result
       FROM test_suite_cases tsc
       JOIN test_case tc ON tsc.test_case_id = tc.id
       WHERE tsc.suite_id = $1 AND tsc.snapshot_id IS NULL AND tc.deleted_at IS NULL
       ORDER BY tsc.sort_order`,
      [validatedData.suite_id]
    );
    if (suiteCases.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot create a test run from an empty suite' });
    }

    // Generate run ID
    const idResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(run_id FROM 4) AS INTEGER)), 0) + 1 AS next_id
       FROM test_run WHERE run_id ~ '^TR-[0-9]+$'`
    );
    const runId = `TR-${String(idResult.rows[0].next_id).padStart(5, '0')}`;

    // Create test run
    const runResult = await client.query(
      `INSERT INTO test_run (run_id, name, description, project_id, status, suite_id, source, environment, version_tag, created_by)
       VALUES ($1, $2, $3, $4, 'in_progress', $5, 'suite', $6, $7, $8)
       RETURNING *`,
      [runId, validatedData.name, suite.description || null, suite.project_id,
       validatedData.suite_id, validatedData.environment || null, validatedData.version_tag || null,
       req.user?.id || null]
    );

    const testRun = runResult.rows[0];

    // Snapshot suite composition
    for (const sc of suiteCases.rows) {
      await client.query(
        `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order, snapshot_id)
         VALUES ($1, $2, $3, $4)`,
        [validatedData.suite_id, sc.test_case_id, sc.sort_order, testRun.id]
      );
      await client.query(
        `INSERT INTO test_run_suite_cases (
           test_run_id, original_suite_id, test_case_id, sort_order,
           test_case_title_snapshot, test_case_steps_snapshot, expected_result_snapshot
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (test_run_id, test_case_id) DO NOTHING`,
        [testRun.id, validatedData.suite_id, sc.test_case_id, sc.sort_order,
         sc.title, sc.test_steps, sc.expected_result]
      );
    }

    // Create execution entries
    const totalCases = suiteCases.rows.length;
    const executionEntries = [];

    for (const sc of suiteCases.rows) {
      const execResult = await client.query(
        `INSERT INTO test_execution (test_run_id, test_case_id, status, test_case_title, test_case_steps, expected_result, sort_order, executed_by, executed_at)
         VALUES ($1, $2, 'not_run', $3, $4, $5, $6, NULL, NULL)
         RETURNING id, test_case_id, test_case_title, test_case_steps, expected_result, sort_order, status, assigned_to`,
        [testRun.id, sc.test_case_id, sc.title, sc.test_steps, sc.expected_result, sc.sort_order]
      );
      executionEntries.push(execResult.rows[0]);
    }

    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      ['test_run_created', 'test_run', testRun.id, req.user?.id || null,
       JSON.stringify({ run_id: runId, suite_id: validatedData.suite_id, source: 'suite', total_cases: totalCases })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...testRun,
      total_cases: totalCases,
      passed: 0,
      failed: 0,
      blocked: 0,
      not_run: totalCases,
      pass_rate: 0,
      execution_entries: executionEntries,
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

// GET /test-runs/:id/progress — Get run progress summary
executionsRouter.get('/test-runs/:id/progress', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const runResult = await pool.query(
      `SELECT * FROM test_run WHERE id = $1 AND deleted_at IS NULL`, [id]
    );
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test run not found' });
    }

    const progressResult = await pool.query(
      `SELECT
        COUNT(*)::INTEGER as total,
        COUNT(*) FILTER (WHERE status = 'pass')::INTEGER as passed,
        COUNT(*) FILTER (WHERE status = 'fail')::INTEGER as failed,
        COUNT(*) FILTER (WHERE status = 'blocked')::INTEGER as blocked,
        COUNT(*) FILTER (WHERE status = 'not_run')::INTEGER as not_run,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status = 'pass')::NUMERIC / COUNT(*)) * 100, 1)
          ELSE 0
        END as pass_rate,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status != 'not_run')::NUMERIC / COUNT(*)) * 100, 1)
          ELSE 0
        END as completion_rate
      FROM test_execution WHERE test_run_id = $1`,
      [id]
    );

    res.json(progressResult.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /test-executions/:id — Update single execution (enhanced with assigned_to)
// Note: This already exists above; adding the assigned_to field support here
// The existing PATCH handler already handles status/notes/duration_seconds/defect_ids
// We add a route for bulk update below

// POST /test-runs/:id/executions/bulk — Bulk update execution statuses
executionsRouter.post('/test-runs/:id/executions/bulk', requireAuth, requirePermission('qc.testexecutions.edit'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { execution_ids, status, assigned_to } = req.body;

    if (!Array.isArray(execution_ids) || execution_ids.length === 0) {
      return res.status(400).json({ error: 'execution_ids array is required' });
    }

    if (!status && !assigned_to) {
      return res.status(400).json({ error: 'At least one of status or assigned_to is required' });
    }

    if (execution_ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 executions per bulk update' });
    }

    await client.query('BEGIN');

    const updates = [];
    const params = [];
    let pn = 1;

    if (status) {
      if (!['pass', 'fail', 'not_run', 'blocked', 'skipped'].includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid status value' });
      }
      const statusParam = pn;
      updates.push(`status = $${pn++}`);
      params.push(status);
      updates.push(`executed_by = CASE WHEN status IS DISTINCT FROM $${statusParam} AND $${statusParam} <> 'not_run' THEN $${pn++} ELSE executed_by END`);
      params.push(req.user?.id || null);
      updates.push(`executed_at = CASE WHEN status IS DISTINCT FROM $${statusParam} AND $${statusParam} <> 'not_run' THEN CURRENT_TIMESTAMP ELSE executed_at END`);
    }

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${pn++}`);
      params.push(assigned_to || null);
    }

    // Verify run exists
    const runResult = await client.query('SELECT id FROM test_run WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (runResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test run not found' });
    }

    // Build WHERE clause for execution IDs
    const idPlaceholders = execution_ids.map((_, i) => `$${pn++}`).join(',');
    params.push(...execution_ids);

    const query = `UPDATE test_execution SET ${updates.join(', ')} WHERE test_run_id = $${pn} AND id IN (${idPlaceholders}) RETURNING id, status, assigned_to, executed_by, executed_at`;
    params.push(req.params.id);

    const result = await client.query(query, params);

    await client.query('COMMIT');
    res.json({ updated: result.rows.length, executions: result.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ─── Test Results ────────────────────────────────────────────────────────

const resultsRouter = express.Router();

const testResultSchema = z.object({
  test_case_id: z.string().min(1).max(100),
  test_case_title: z.string().max(500).optional(),
  status: z.enum(['passed', 'failed', 'not_run', 'blocked', 'rejected']),
  executed_at: z.string().optional(),
  notes: z.string().optional(),
  tester_name: z.string().max(200).optional(),
  requirement_id: z.string().max(100).optional(),
  module_name: z.string().max(200).optional(),
  estimated_hrs: z.number().positive().optional().nullable(),
  is_retest: z.boolean().optional().default(false),
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
resultsRouter.get('/test-results', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
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
          p.project_name
        FROM test_result tr
        LEFT JOIN projects p ON tr.project_id = p.id
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
resultsRouter.get('/test-results/project/:project_id/metrics', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
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
resultsRouter.get('/test-results/project/:project_id/trends', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
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
resultsRouter.get('/test-results/test-case/:test_case_id/history', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
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
        p.project_name
       FROM test_result tr
       LEFT JOIN projects p ON tr.project_id = p.id
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
resultsRouter.post('/test-results/upload', requireAuth, requirePermission('qc.testresults.upload'), async (req, res, next) => {
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
          const updateParts = [
            'status = $1',
            'test_case_title = COALESCE($2, test_case_title)',
            'notes = $3',
            'tester_name = $4',
            'upload_batch_id = $5',
            'uploaded_by = $6',
            'uploaded_at = CURRENT_TIMESTAMP'
          ];
          const updateParams = [
            testResult.status,
            testResult.test_case_title,
            testResult.notes,
            testResult.tester_name,
            uploadBatchId,
            req.user?.id || null
          ];
          let pIdx = updateParams.length;

          if (testResult.requirement_id !== undefined) {
            pIdx++;
            updateParts.push(`requirement_id = $${pIdx}`);
            updateParams.push(testResult.requirement_id);
          }
          if (testResult.module_name !== undefined) {
            pIdx++;
            updateParts.push(`module_name = $${pIdx}`);
            updateParams.push(testResult.module_name);
          }
          if (testResult.estimated_hrs != null) {
            pIdx++;
            updateParts.push(`estimated_hrs = $${pIdx}`);
            updateParams.push(testResult.estimated_hrs);
          }
          if (testResult.is_retest !== undefined) {
            pIdx++;
            updateParts.push(`is_retest = $${pIdx}`);
            updateParams.push(testResult.is_retest);
          }

          pIdx++;
          updateParams.push(existingResult.rows[0].id);

          const updateQuery = `UPDATE test_result SET ${updateParts.join(', ')} WHERE id = $${pIdx} RETURNING id, test_case_id, status`;
          const updateResult = await client.query(updateQuery, updateParams);

          importResults.updated.push({
            row: i + 1,
            test_case_id: testResult.test_case_id,
            status: testResult.status,
            executed_at: executedDate
          });
        } else {
          const insertColumns = [
            'test_case_id', 'test_case_title', 'project_id', 'status',
            'executed_at', 'notes', 'tester_name', 'upload_batch_id', 'uploaded_by'
          ];
          const insertValues = [
            testResult.test_case_id, testResult.test_case_title || null, project_id,
            testResult.status, executedDate, testResult.notes || null, testResult.tester_name || null,
            uploadBatchId, req.user?.id || null
          ];

          if (testResult.requirement_id) {
            insertColumns.push('requirement_id');
            insertValues.push(testResult.requirement_id);
          }
          if (testResult.module_name) {
            insertColumns.push('module_name');
            insertValues.push(testResult.module_name);
          }
          if (testResult.estimated_hrs != null) {
            insertColumns.push('estimated_hrs');
            insertValues.push(testResult.estimated_hrs);
          }
          if (testResult.is_retest) {
            insertColumns.push('is_retest');
            insertValues.push(true);
          }

          const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(', ');
          const insertQuery = `
            INSERT INTO test_result (${insertColumns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (test_case_id, project_id, executed_at, is_retest, deleted_at) DO UPDATE
              SET status = EXCLUDED.status,
                  notes = EXCLUDED.notes,
                  tester_name = EXCLUDED.tester_name,
                  updated_at = CURRENT_TIMESTAMP
            RETURNING id, test_case_id, status
          `;
          const insertResult = await client.query(insertQuery, insertValues);

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
resultsRouter.get('/test-results/uploads', requireAuth, requirePermission('qc.testexecutions.view'), async (req, res, next) => {
  try {
    const { project_id, limit = 20 } = req.query;

    let query = `
      SELECT
        upload_batch_id,
        project_id,
        p.project_name,
        MIN(uploaded_at) AS uploaded_at,
        MAX(uploaded_by) AS uploaded_by,
        u.name AS uploaded_by_name,
        COUNT(*) AS results_count,
        COUNT(*) FILTER (WHERE status = 'passed') AS passed_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
        MIN(executed_at) AS earliest_execution_date,
        MAX(executed_at) AS latest_execution_date
      FROM test_result tr
      LEFT JOIN projects p ON tr.project_id = p.id
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
      GROUP BY upload_batch_id, project_id, p.project_name, u.name
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
resultsRouter.delete('/test-results/:id', requireAuth, requirePermission('qc.testresults.delete'), async (req, res, next) => {
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


module.exports = { executionsRouter, resultsRouter, validateExecutionDate };
