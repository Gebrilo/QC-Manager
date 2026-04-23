const { z } = require('zod');

const TrackerType = z.enum(['bug', 'task', 'user_story', 'test_case']);

const SyncConfigSchema = z.object({
  tuleap_project_id: z.number().int().positive(),
  tuleap_tracker_id: z.number().int().positive(),
  tuleap_base_url: z.string().url().optional(),
  tracker_type: TrackerType,
  qc_project_id: z.string().uuid(),
  artifact_fields: z.record(z.string(), z.string()).optional().default({}),
  status_value_map: z.record(z.string(), z.string()).optional().default({}),
  is_active: z.boolean().optional().default(true),
});

const SyncConfigUpdateSchema = SyncConfigSchema.partial().extend({
  artifact_fields: z.record(z.string(), z.string()).optional(),
  status_value_map: z.record(z.string(), z.string()).optional(),
});

module.exports = { TrackerType, SyncConfigSchema, SyncConfigUpdateSchema };
