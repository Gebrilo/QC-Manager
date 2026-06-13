const { z } = require('zod');

const emptyToNull = (value) => value === '' ? null : value;

const nullableText = (max = 2000) => z.preprocess(
    emptyToNull,
    z.string().trim().max(max).nullable().optional()
);

const requiredText = (label, max = 255) => z.string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const optionalDate = z.preprocess(
    emptyToNull,
    z.string()
        .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date')
        .nullable()
        .optional()
);

const optionalDateTime = z.preprocess(
    emptyToNull,
    z.string()
        .refine(value => !Number.isNaN(Date.parse(value)), 'Invalid date/time')
        .nullable()
        .optional()
);

const landingConfigSchema = z.object({
    hero_title: requiredText('Hero title'),
    hero_subtitle: requiredText('Hero subtitle', 2000),
    hero_cta_label: requiredText('Primary CTA label', 100),
    hero_cta_url: requiredText('Primary CTA URL', 500),
    hero_secondary_cta_label: nullableText(100),
    hero_secondary_cta_url: nullableText(500),
    marketing_intro_title: requiredText('Marketing intro title'),
    marketing_intro_description: requiredText('Marketing intro description', 3000),
    show_features: z.boolean().optional(),
    show_roadmap: z.boolean().optional(),
    show_changelog: z.boolean().optional(),
    show_footer_cta: z.boolean().optional(),
    footer_cta_title: nullableText(255),
    footer_cta_description: nullableText(2000),
    footer_cta_label: nullableText(100),
    footer_cta_url: nullableText(500),
    is_public: z.boolean().optional(),
});

const featureCreateSchema = z.object({
    title: requiredText('Feature title'),
    description: requiredText('Feature description', 2000),
    icon_key: nullableText(80),
    display_order: z.coerce.number().int().min(0).optional().default(0),
    is_active: z.boolean().optional().default(true),
});

const featureUpdateSchema = featureCreateSchema.partial();

const roadmapStatusSchema = z.enum(['planned', 'in_progress', 'completed']);
const prioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const roadmapCreateSchema = z.object({
    title: requiredText('Roadmap title'),
    description: requiredText('Roadmap description', 3000),
    status: roadmapStatusSchema.optional().default('planned'),
    priority: prioritySchema.optional().default('medium'),
    target_date: optionalDate,
    completion_date: optionalDate,
    display_order: z.coerce.number().int().min(0).optional().default(0),
    is_public: z.boolean().optional().default(true),
    source_reference: nullableText(255),
});

const roadmapUpdateSchema = roadmapCreateSchema.partial();

const changelogSourceSchema = z.enum(['manual', 'ai_agent', 'github', 'n8n', 'system']);

const changelogCreateSchema = z.object({
    version_number: nullableText(50),
    title: requiredText('Changelog title'),
    content_markdown: requiredText('Changelog content', 20000),
    published_at: optionalDateTime,
    is_published: z.boolean().optional().default(false),
    generated_by_ai: z.boolean().optional().default(false),
    source: changelogSourceSchema.optional().default('manual'),
    source_reference: nullableText(255),
});

const changelogUpdateSchema = changelogCreateSchema.partial();

const changelogWebhookSchema = z.object({
    version_number: nullableText(50),
    title: requiredText('Changelog title'),
    content_markdown: requiredText('Changelog content', 20000),
    published_at: optionalDateTime,
    is_published: z.boolean().optional().default(true),
    generated_by_ai: z.boolean().optional().default(true),
    source: changelogSourceSchema.optional().default('ai_agent'),
    source_reference: nullableText(255),
});

const roadmapWebhookSchema = z.object({
    title: requiredText('Roadmap title'),
    description: requiredText('Roadmap description', 3000),
    status: roadmapStatusSchema.optional().default('planned'),
    priority: prioritySchema.optional().default('medium'),
    target_date: optionalDate,
    completion_date: optionalDate,
    display_order: z.coerce.number().int().min(0).optional().default(0),
    is_public: z.boolean().optional().default(true),
    source_reference: nullableText(255),
    source: changelogSourceSchema.optional().default('ai_agent'),
});

module.exports = {
    changelogCreateSchema,
    changelogUpdateSchema,
    changelogWebhookSchema,
    featureCreateSchema,
    featureUpdateSchema,
    landingConfigSchema,
    prioritySchema,
    roadmapCreateSchema,
    roadmapStatusSchema,
    roadmapUpdateSchema,
    roadmapWebhookSchema,
};
