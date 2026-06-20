const { z } = require('zod');

// ADR 0009 — a single per-resource assignment. The route maps these onto
// task_resource_assignment rows. Cross-row rules (exactly one primary, no
// duplicate resource) are enforced by services/assignments/taskAssignments.js.
const assignmentInputSchema = z.object({
    resource_id: z.string().uuid(),
    assignment_type: z.enum(['PRIMARY', 'SECONDARY']),
    estimate_hrs: z.number().min(0).default(0),
    actual_hrs: z.number().min(0).default(0),
    initial_estimate: z.number().nullable().optional(),
    final_estimate: z.number().nullable().optional(),
    planned_working_days: z.number().min(0).nullable().optional(),
    completion_status: z.enum(['Pending', 'Completed']).optional(),
    completed_at: z.string().datetime().nullable().optional(),
});

const baseTaskSchema = z.object({
    task_id: z.string().regex(/^TSK-[A-Z0-9-]+$/, 'ID must be format TSK-XXX...'),
    project_id: z.string().uuid(), // Links to projects.id (UUID)
    task_name: z.string().min(1).max(200),
    description: z.string().optional(),
    status: z.enum(['Todo', 'In Progress', 'Blocked', 'Done', 'Canceled']).default('Todo'),
    priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),

    // ADR 0009 — full assignment set (one primary + many secondaries).
    assignments: z.array(assignmentInputSchema).optional(),

    estimate_days: z.number().positive().optional(),
    deadline: z.string().date().optional(),
    expected_start_date: z.string().date().optional(),
    actual_start_date: z.string().date().optional(),

    // Per-primary planning numbers are also carried on assignment inputs.
    initial_estimate: z.number().nullable().optional(),
    final_estimate: z.number().nullable().optional(),

    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    completed_date: z.string().date().optional(),
    parent_user_story_id: z.string().uuid().optional()
});

const createTaskSchema = baseTaskSchema.refine(data => {
    if (data.status === 'Done' && !data.completed_date) return false;
    return true;
}, { message: "completed_date is required when status is Done", path: ["completed_date"] });

const updateTaskSchema = baseTaskSchema.partial().omit({ task_id: true }).extend({
    parent_user_story_id: z.string().uuid().nullable().optional(),
});

module.exports = {
    createTaskSchema,
    updateTaskSchema
};
