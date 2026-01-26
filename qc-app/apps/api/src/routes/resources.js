const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all resources
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query('SELECT * FROM resources WHERE deleted_at IS NULL');
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single resource
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT * FROM resources WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Resource not found' });
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST create resource (basic)
router.post('/', async (req, res, next) => {
    try {
        const { name, role, weekly_capacity_hrs, email } = req.body;
        // Basic validation - in real app, use Zod schema
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const result = await db.query(
            `INSERT INTO resources (resource_name, weekly_capacity_hrs, email) 
             VALUES ($1, $2, $3) RETURNING *`,
            [name, weekly_capacity_hrs || 40, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
