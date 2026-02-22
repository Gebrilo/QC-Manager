const { z } = require('zod');

const createJourneySchema = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    is_active: z.boolean().default(true),
    auto_assign_on_activation: z.boolean().default(true),
    sort_order: z.number().int().min(0).default(0),
    next_journey_id: z.string().uuid().nullable().optional(),
    required_xp: z.number().int().min(0).default(0),
});

const updateJourneySchema = createJourneySchema.partial();

const createChapterSchema = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    sort_order: z.number().int().min(0).default(0),
    is_mandatory: z.boolean().default(true),
    xp_reward: z.number().int().min(0).default(0),
});

const updateChapterSchema = createChapterSchema.partial();

const createQuestSchema = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    sort_order: z.number().int().min(0).default(0),
    is_mandatory: z.boolean().default(true),
});

const updateQuestSchema = createQuestSchema.partial();

const createTaskSchema = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    instructions: z.string().optional(),
    validation_type: z.enum(['checkbox', 'multi_checkbox', 'text_acknowledge', 'link_visit', 'file_upload']),
    validation_config: z.record(z.any()).default({}),
    sort_order: z.number().int().min(0).default(0),
    is_mandatory: z.boolean().default(true),
    estimated_minutes: z.number().int().min(0).optional(),
});

const updateTaskSchema = createTaskSchema.partial();

const completeTaskSchema = z.object({
    validation_data: z.record(z.any()).default({}),
});

module.exports = {
    createJourneySchema,
    updateJourneySchema,
    createChapterSchema,
    updateChapterSchema,
    createQuestSchema,
    updateQuestSchema,
    createTaskSchema,
    updateTaskSchema,
    completeTaskSchema,
};
