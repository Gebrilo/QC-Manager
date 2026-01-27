const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createResourceSchema, updateResourceSchema } = require('../schemas/resource');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');

// GET all resources with utilization metrics (from view)
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT * 
            FROM v_resources_with_utilization 
            ORDER BY resource_name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single resource with utilization (from view)
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT * 
            FROM v_resources_with_utilization 
            WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST create resource
router.post('/', async (req, res, next) => {
    try {
        // Validate with Zod
        const data = createResourceSchema.parse(req.body);

        const result = await db.query(
            `INSERT INTO resources (
                resource_name, weekly_capacity_hrs, email, department, role, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *`,
            [
                data.resource_name, 
                data.weekly_capacity_hrs, 
                data.email || null, 
                data.department || null, 
                data.role || null,
                data.is_active
            ]
        );

        const resource = result.rows[0];

        // Audit log
        await auditLog('resources', resource.id, 'CREATE', resource, null);
        
        // Trigger n8n workflow
        triggerWorkflow('resource-created', resource);

        // Return with utilization metrics from view
        const viewResult = await db.query(`
            SELECT * FROM v_resources_with_utilization WHERE id = $1
        `, [resource.id]);

        res.status(201).json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PATCH update resource
router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateResourceSchema.parse(req.body);

        // Fetch original for audit
        const originalRes = await db.query('SELECT * FROM resources WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        const original = originalRes.rows[0];

        // Build dynamic update query
        const fields = [];
        const values = [];
        let idx = 1;

        if (data.resource_name !== undefined) {
            fields.push(`resource_name = $${idx++}`);
            values.push(data.resource_name);
        }
        if (data.weekly_capacity_hrs !== undefined) {
            fields.push(`weekly_capacity_hrs = $${idx++}`);
            values.push(data.weekly_capacity_hrs);
        }
        if (data.email !== undefined) {
            fields.push(`email = $${idx++}`);
            values.push(data.email);
        }
        if (data.department !== undefined) {
            fields.push(`department = $${idx++}`);
            values.push(data.department);
        }
        if (data.role !== undefined) {
            fields.push(`role = $${idx++}`);
            values.push(data.role);
        }
        if (data.is_active !== undefined) {
            fields.push(`is_active = $${idx++}`);
            values.push(data.is_active);
        }

        if (fields.length === 0) {
            return res.json(original);
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const query = `UPDATE resources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await db.query(query, values);
        const updated = result.rows[0];

        // Audit log
        await auditLog('resources', id, 'UPDATE', updated, original);
        
        // Trigger n8n workflow
        triggerWorkflow('resource-updated', updated);

        // Return with utilization metrics from view
        const viewResult = await db.query(`
            SELECT * FROM v_resources_with_utilization WHERE id = $1
        `, [id]);

        res.json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE soft delete resource
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch original for audit
        const originalRes = await db.query('SELECT * FROM resources WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        const original = originalRes.rows[0];

        // Check if already deleted
        if (original.deleted_at) {
            return res.status(400).json({ error: 'Resource already deleted' });
        }

        // Soft delete: set deleted_at and is_active = false
        const result = await db.query(
            `UPDATE resources 
             SET deleted_at = NOW(), 
                 is_active = false,
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING *`,
            [id]
        );

        const deleted = result.rows[0];

        // Audit log
        await auditLog('resources', id, 'DELETE', deleted, original);
        
        // Trigger n8n workflow
        triggerWorkflow('resource-deleted', deleted);

        res.json({ 
            success: true, 
            message: `Resource '${deleted.resource_name}' has been deleted`,
            data: deleted
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
