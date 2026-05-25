const { z } = require('zod');

const createUserStorySchema = z.object({
    title: z.string().min(1, 'Title is required'),
    project_id: z.string().uuid('Valid project ID is required'),
    description: z.string().optional().default(''),
    status: z.string().optional().default('Draft'),
    acceptance_criteria: z.string().optional().default(''),
    priority: z.string().optional().default('None'),
    assigned_to: z.string().nullable().optional(),
    requirement_version: z.string().optional().default('1'),
    change_reason: z.string().optional().default(''),
    ba_author: z.string().optional().default(''),
    initial_effort: z.number().nullable().optional(),
    remaining_effort: z.number().nullable().optional(),
    temp_id: z.string().optional(),
});

const updateUserStorySchema = createUserStorySchema.partial().omit({ project_id: true });

module.exports = {
    createUserStorySchema,
    updateUserStorySchema,
};
