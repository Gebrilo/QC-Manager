const { z } = require('zod');

const createProjectSchema = z.object({
    project_id: z.string().min(1, 'ID is required'),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    total_weight: z.number().int().min(1).max(5).optional(),
    priority: z.enum(['High', 'Medium', 'Low']).optional(),
    start_date: z.string().date().optional(), // ISO Date string YYYY-MM-DD
    target_date: z.string().date().optional()
});

const updateProjectSchema = createProjectSchema.partial().omit({ project_id: true }); // ID usually immutable

module.exports = {
    createProjectSchema,
    updateProjectSchema
};
