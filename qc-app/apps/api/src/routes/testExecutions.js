const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { z } = require('zod');

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
// TEST RUNS
// ============================================================================

// GET /test-runs - List all test runs
router.get('/test-runs', async (req, res, next) => {
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
router.get('/test-runs/:id', async (req, res, next) => {
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
router.post('/test-runs', async (req, res, next) => {
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
router.patch('/test-runs/:id', async (req, res, next) => {
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

// ============================================================================
// TEST EXECUTIONS
// ============================================================================

// GET /executions - List executions (with filters)
router.get('/executions', async (req, res, next) => {
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
router.post('/executions', async (req, res, next) => {
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
router.patch('/executions/:id', async (req, res, next) => {
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
router.post('/executions/bulk-import', async (req, res, next) => {
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

module.exports = router;