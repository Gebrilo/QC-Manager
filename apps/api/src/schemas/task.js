const { z } = require('zod');

const baseTaskSchema = z.object({
    task_id: z.string().regex(/^TSK-[A-Z0-9-]+$/, 'ID must be format TSK-XXX...'),
    project_id: z.string().uuid(), // Links to projects.id (UUID)
    task_name: z.string().min(1).max(200),
    description: z.string().optional(),
    status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']).default('Backlog'),
    priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),

    // Resources & Hours
    resource1_uuid: z.string().uuid().nullable().optional(),
    resource2_uuid: z.string().uuid().nullable().optional(),

    estimate_days: z.number().positive().optional(),
    deadline: z.string().date().optional(),
    expected_start_date: z.string().date().optional(),
    actual_start_date: z.string().date().optional(),

    // Hours (usually 0 on create, but allow setting)
    r1_estimate_hrs: z.number().min(0).default(0),
    r1_actual_hrs: z.number().min(0).default(0),
    r2_estimate_hrs: z.number().min(0).default(0),
    r2_actual_hrs: z.number().min(0).default(0),

    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    completed_date: z.string().date().optional()
});

const createTaskSchema = baseTaskSchema.refine(data => {
    if (data.status === 'Done' && !data.completed_date) return false;
    return true;
}, { message: "completed_date is required when status is Done", path: ["completed_date"] });

const updateTaskSchema = baseTaskSchema.partial().omit({ task_id: true, project_id: true });

module.exports = {
    createTaskSchema,
    updateTaskSchema
};
