const { z } = require('zod');

const createResourceSchema = z.object({
    resource_name: z.string().min(1, 'Name is required').max(100),
    weekly_capacity_hrs: z.number().int().min(1).max(80).default(40),
    email: z.string().email().optional().nullable(),
    department: z.string().max(100).optional(),
    role: z.string().max(100).optional(),
    is_active: z.boolean().default(true)
});

const updateResourceSchema = createResourceSchema.partial();

module.exports = {
    createResourceSchema,
    updateResourceSchema
};
