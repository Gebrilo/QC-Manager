const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { z } = require('zod');

// Validation Schemas
const testCaseCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  project_id: z.string().uuid(),
  task_id: z.string().uuid().optional().nullable(),
  category: z.enum(['smoke', 'regression', 'e2e', 'integration', 'unit', 'performance', 'security', 'other']).default('other'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).optional().default([]),
  status: z.enum(['active', 'archived', 'draft', 'deprecated']).default('active')
});

const testCaseUpdateSchema = testCaseCreateSchema.partial().extend({
  id: z.string().uuid()
});

// GET /test-cases - List all test cases with filtering
router.get('/', async (req, res, next) => {
  try {
    const {
      project_id,
      task_id,
      category,
      priority,
      status,
      search,
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT * FROM v_test_case_summary
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Apply filters
    if (project_id) {
      query += ` AND project_id = $${paramCount}`;
      params.push(project_id);
      paramCount++;
    }

    if (task_id) {
      query += ` AND task_id = $${paramCount}`;
      params.push(task_id);
      paramCount++;
    }

    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (priority) {
      query += ` AND priority = $${paramCount}`;
      params.push(priority);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    // Full-text search
    if (search) {
      query += ` AND (
        title ILIKE $${paramCount} OR
        description ILIKE $${paramCount} OR
        test_case_id ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Order by
    query += ` ORDER BY created_at DESC`;

    // Pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM test_case WHERE deleted_at IS NULL`;
    const countParams = [];
    let countParamNum = 1;

    if (project_id) {
      countQuery += ` AND project_id = $${countParamNum}`;
      countParams.push(project_id);
      countParamNum++;
    }

    if (status) {
      countQuery += ` AND status = $${countParamNum}`;
      countParams.push(status);
      countParamNum++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: result.rows,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + result.rows.length < total
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /test-cases/:id - Get single test case
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM v_test_case_summary WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    // Get execution history
    const executionsResult = await pool.query(
      `SELECT
        te.id,
        te.status,
        te.notes,
        te.executed_at,
        te.duration_seconds,
        te.defect_ids,
        tr.run_id,
        tr.name AS test_run_name,
        u.name AS executed_by_name
      FROM test_execution te
      LEFT JOIN test_run tr ON te.test_run_id = tr.id
      LEFT JOIN app_user u ON te.executed_by = u.id
      WHERE te.test_case_id = $1
      ORDER BY te.executed_at DESC
      LIMIT 50`,
      [id]
    );

    res.json({
      ...result.rows[0],
      execution_history: executionsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// POST /test-cases - Create new test case
router.post('/', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const validatedData = testCaseCreateSchema.parse(req.body);

    await client.query('BEGIN');

    // Generate next test_case_id
    const idResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(test_case_id FROM 4) AS INTEGER)), 0) + 1 AS next_id
       FROM test_case
       WHERE test_case_id ~ '^TC-[0-9]+$'`
    );
    const nextId = idResult.rows[0].next_id;
    const testCaseId = `TC-${String(nextId).padStart(4, '0')}`;

    // Insert test case
    const result = await client.query(
      `INSERT INTO test_case (
        test_case_id, title, description, project_id, task_id,
        category, priority, tags, status, created_by, last_modified_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        testCaseId,
        validatedData.title,
        validatedData.description || null,
        validatedData.project_id,
        validatedData.task_id || null,
        validatedData.category,
        validatedData.priority,
        validatedData.tags,
        validatedData.status,
        req.user?.id || null, // Assuming auth middleware sets req.user
        req.user?.id || null
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_case_created',
        'test_case',
        result.rows[0].id,
        req.user?.id || null,
        JSON.stringify({ test_case_id: testCaseId, title: validatedData.title })
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

// PATCH /test-cases/:id - Update test case
router.patch('/:id', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const validatedData = testCaseUpdateSchema.parse({ ...req.body, id });

    await client.query('BEGIN');

    // Check if test case exists
    const existingResult = await client.query(
      'SELECT * FROM test_case WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test case not found' });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    const updatableFields = [
      'title', 'description', 'project_id', 'task_id',
      'category', 'priority', 'tags', 'status'
    ];

    updatableFields.forEach(field => {
      if (validatedData[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        params.push(validatedData[field]);
        paramCount++;
      }
    });

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add last_modified_by
    updates.push(`last_modified_by = $${paramCount}`);
    params.push(req.user?.id || null);
    paramCount++;

    // Add id for WHERE clause
    params.push(id);

    const query = `
      UPDATE test_case
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
        'test_case_updated',
        'test_case',
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

// DELETE /test-cases/:id - Soft delete (archive) test case
router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Soft delete
    const result = await client.query(
      `UPDATE test_case
       SET deleted_at = CURRENT_TIMESTAMP, status = 'archived'
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test case not found' });
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_case_deleted',
        'test_case',
        id,
        req.user?.id || null,
        JSON.stringify({ test_case_id: result.rows[0].test_case_id })
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

// POST /test-cases/bulk-import - Bulk import from Excel/CSV data
router.post('/bulk-import', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { test_cases, project_id } = req.body;

    if (!Array.isArray(test_cases) || test_cases.length === 0) {
      return res.status(400).json({ error: 'test_cases array is required' });
    }

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    await client.query('BEGIN');

    const results = {
      success: [],
      errors: [],
      duplicates: []
    };

    for (let i = 0; i < test_cases.length; i++) {
      const testCase = test_cases[i];

      try {
        // Validate
        const validatedData = testCaseCreateSchema.parse({
          ...testCase,
          project_id
        });

        // Check for duplicates by title within project
        const duplicateCheck = await client.query(
          `SELECT id, test_case_id FROM test_case
           WHERE project_id = $1 AND title = $2 AND deleted_at IS NULL`,
          [project_id, validatedData.title]
        );

        if (duplicateCheck.rows.length > 0) {
          results.duplicates.push({
            row: i + 1,
            title: validatedData.title,
            existing_id: duplicateCheck.rows[0].test_case_id
          });
          continue;
        }

        // Generate next test_case_id
        const idResult = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(test_case_id FROM 4) AS INTEGER)), 0) + 1 AS next_id
           FROM test_case
           WHERE test_case_id ~ '^TC-[0-9]+$'`
        );
        const nextId = idResult.rows[0].next_id;
        const testCaseId = `TC-${String(nextId).padStart(4, '0')}`;

        // Insert
        const result = await client.query(
          `INSERT INTO test_case (
            test_case_id, title, description, project_id, task_id,
            category, priority, tags, status, created_by, last_modified_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, test_case_id, title`,
          [
            testCaseId,
            validatedData.title,
            validatedData.description || null,
            validatedData.project_id,
            validatedData.task_id || null,
            validatedData.category,
            validatedData.priority,
            validatedData.tags,
            validatedData.status,
            req.user?.id || null,
            req.user?.id || null
          ]
        );

        results.success.push({
          row: i + 1,
          id: result.rows[0].id,
          test_case_id: result.rows[0].test_case_id,
          title: result.rows[0].title
        });

      } catch (error) {
        results.errors.push({
          row: i + 1,
          title: testCase.title || 'N/A',
          error: error.message
        });
      }
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'test_case_bulk_import',
        'test_case',
        null,
        req.user?.id || null,
        JSON.stringify({
          total: test_cases.length,
          success: results.success.length,
          errors: results.errors.length,
          duplicates: results.duplicates.length,
          project_id
        })
      ]
    );

    await client.query('COMMIT');

    res.json({
      summary: {
        total: test_cases.length,
        imported: results.success.length,
        duplicates: results.duplicates.length,
        errors: results.errors.length,
        success_rate: ((results.success.length / test_cases.length) * 100).toFixed(2) + '%'
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