const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { z } = require('zod');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

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
  defect_ids: z.array(z.string()).optional()
});

// ============================================================================
// DASHBOARD SUMMARY - For Governance Dashboard
// ============================================================================

// GET /summary - Aggregate stats for dashboard
router.get('/summary', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
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
router.get('/test-runs', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { project_id, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        tr.*,
        p.name AS project_name,
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
      LEFT JOIN project p ON tr.project_id = p.id
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
      GROUP BY tr.id, p.name, u.name
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
router.get('/test-runs/:id', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get test run
    const runResult = await pool.query(
      `SELECT
        tr.*,
        p.name AS project_name,
        u.name AS created_by_name
      FROM test_run tr
      LEFT JOIN project p ON tr.project_id = p.id
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
        tc.test_case_id,
        tc.title AS test_case_title,
        tc.category,
        tc.priority,
        u.name AS executed_by_name
      FROM test_execution te
      LEFT JOIN test_case tc ON te.test_case_id = tc.id
      LEFT JOIN app_user u ON te.executed_by = u.id
      WHERE te.test_run_id = $1
      ORDER BY te.executed_at DESC`,
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
router.post('/test-runs', requireAuth, requirePermission('action:test-executions:create'), async (req, res, next) => {
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
router.patch('/test-runs/:id', requireAuth, requirePermission('action:test-executions:edit'), async (req, res, next) => {
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
router.delete('/test-runs/:id', requireAuth, requirePermission('action:test-executions:delete'), async (req, res, next) => {
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

    // Soft delete
    await client.query(
      'UPDATE test_run SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
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
router.get('/executions', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const { test_run_id, test_case_id, status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        te.*,
        tc.test_case_id,
        tc.title AS test_case_title,
        tc.category,
        tr.run_id,
        tr.name AS test_run_name,
        u.name AS executed_by_name
      FROM test_execution te
      LEFT JOIN test_case tc ON te.test_case_id = tc.id
      LEFT JOIN test_run tr ON te.test_run_id = tr.id
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

    query += ` ORDER BY te.executed_at DESC`;
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
router.post('/executions', requireAuth, requirePermission('action:test-executions:create'), async (req, res, next) => {
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
        duration_seconds, defect_ids, executed_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        validatedData.test_case_id,
        validatedData.test_run_id,
        validatedData.status,
        validatedData.notes || null,
        validatedData.duration_seconds || null,
        validatedData.defect_ids,
        req.user?.id || null
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
router.patch('/executions/:id', requireAuth, requirePermission('action:test-executions:edit'), async (req, res, next) => {
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

    if (validatedData.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      params.push(validatedData.status);
      paramCount++;
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
router.post('/executions/bulk-import', requireAuth, requirePermission('action:test-executions:create'), async (req, res, next) => {
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
            duration_seconds, defect_ids, executed_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, test_case_id, status`,
          [
            validatedData.test_case_id,
            test_run_id,
            validatedData.status,
            validatedData.notes || null,
            validatedData.duration_seconds || null,
            validatedData.defect_ids,
            req.user?.id || null
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

// ============================================================================
// EXCEL UPLOAD - Import test results from Excel/CSV
// ============================================================================

// POST /upload-excel - Upload Excel file with test results
router.post('/upload-excel', requireAuth, requirePermission('action:test-executions:create'), upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { project_id, test_run_name } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
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
      `INSERT INTO test_run (run_id, name, description, project_id, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        runId,
        test_run_name || `Excel Import - ${new Date().toISOString().split('T')[0]}`,
        `Imported from file: ${req.file.originalname}`,
        project_id,
        'completed'
      ]
    );

    const testRun = testRunResult.rows[0];

    // Process each row
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

      // Try to find test case ID or name columns (flexible column names)
      const testCaseId = row['Test Case ID'] || row['test_case_id'] || row['ID'] || row['id'] || row['TestCaseID'];
      const testCaseName = row['Test Case Name'] || row['test_case_name'] || row['Name'] || row['name'] || row['Title'] || row['title'];
      const statusRaw = row['Status'] || row['status'] || row['Result'] || row['result'] || '';
      const notes = row['Notes'] || row['notes'] || row['Comments'] || row['comments'] || '';

      // Normalize status
      const statusLower = String(statusRaw).toLowerCase().trim();
      let status = 'not_run';
      if (['pass', 'passed', 'success', 'ok'].includes(statusLower)) {
        status = 'pass';
        results.summary.pass++;
      } else if (['fail', 'failed', 'failure', 'error'].includes(statusLower)) {
        status = 'fail';
        results.summary.fail++;
      } else if (['blocked', 'block'].includes(statusLower)) {
        status = 'blocked';
        results.summary.blocked++;
      } else if (['skipped', 'skip', 'rejected'].includes(statusLower)) {
        status = 'skipped';
        results.summary.skipped++;
      } else if (['not run', 'not_run', 'not executed', 'not_executed', 'pending', ''].includes(statusLower)) {
        status = 'not_run';
        results.summary.not_run++;
      }

      try {
        // Insert test execution record directly (without requiring test_case table)
        await client.query(
          `INSERT INTO test_execution (
            test_run_id, test_case_id, status, notes
          ) VALUES ($1, NULL, $2, $3)`,
          [testRun.id, status, `${testCaseId ? '[' + testCaseId + '] ' : ''}${testCaseName || ''} - ${notes}`.trim()]
        );

        results.success.push({
          row: i + 2, // +2 for 1-indexed and header row
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
router.get('/recent-uploads', requireAuth, requirePermission('page:test-executions'), async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        tr.id,
        tr.run_id,
        tr.name,
        tr.description,
        tr.status,
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
      WHERE tr.deleted_at IS NULL
      GROUP BY tr.id, tr.run_id, tr.name, tr.description, tr.status, tr.started_at, p.project_name, p.id
      ORDER BY tr.started_at DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;