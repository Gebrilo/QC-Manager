const { z } = require('zod');

const createBugSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    project_id: z.string().uuid('Valid project ID is required'),
    status: z.string().min(1, 'Status is required'),
    severity: z.string().optional().default('None'),
    description: z.string().optional().default(''),
    assigned_to: z.string().nullable().optional(),
    priority: z.string().optional().default('medium'),
    environment: z.enum(['DEV', 'TEST', 'PROD']).optional(),
    service_name: z.string().optional(),
    steps_to_reproduce: z.string().optional(),
    dev_fix_description: z.string().optional(),
    qc_verification_notes: z.string().optional(),
    close_date: z.string().nullable().optional(),
    cc: z.array(z.string()).optional(),
    linked_test_case_ids: z.array(z.string()).optional().default([]),
    linked_test_execution_ids: z.array(z.string().uuid()).optional().default([]),
    linked_task_ids: z.array(z.string().uuid()).optional().default([]),
    initial_effort: z.number().nullable().optional(),
    remaining_effort: z.number().nullable().optional(),
    bug_type: z.string().optional(),
    component: z.string().optional(),
    reported_by: z.string().optional(),
    reported_date: z.string().optional(),
    source: z.enum(['TEST_CASE', 'EXPLORATORY']).optional(),
    triage_status: z.string().optional(),
    temp_id: z.string().optional(),
});

const updateBugSchema = createBugSchema.partial();

module.exports = {
    createBugSchema,
    updateBugSchema,
};
