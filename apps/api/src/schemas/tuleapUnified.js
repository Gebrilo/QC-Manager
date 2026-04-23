const { z } = require('zod');

const ArtifactType = z.enum(['bug', 'task', 'user_story', 'test_case']);

const ArtifactLink = z.object({
  type: z.string().min(1),
  target_artifact_id: z.union([z.number(), z.string()]),
});

const Attachment = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});

const TuleapMeta = z.object({
  project_id: z.number().optional(),
  tracker_id: z.number().optional(),
  artifact_id: z.number().optional(),
  url: z.string().optional(),
});

const CommonFields = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  status: z.string().min(1, 'Status is required'),
  assigned_to: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  attachments: z.array(Attachment).optional(),
  links: z.array(ArtifactLink).optional(),
});

const BugFields = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  environment: z.enum(['DEV', 'TEST', 'PROD']).optional(),
  service_name: z.string().optional(),
  steps_to_reproduce: z.string().optional(),
  dev_fix_description: z.string().optional(),
  qc_verification_notes: z.string().optional(),
  close_date: z.string().nullable().optional(),
  cc: z.array(z.string()).optional(),
  linked_test_case_ids: z.array(z.string()).optional(),
  initial_effort: z.number().nullable().optional(),
  remaining_effort: z.number().nullable().optional(),
});

const TaskFields = z.object({
  team: z.string().optional(),
  parent_story_id: z.string().nullable().optional(),
  initial_estimate: z.number().nullable().optional(),
  final_estimate: z.number().nullable().optional(),
  actual_effort: z.number().nullable().optional(),
  blocked_reason: z.string().optional(),
});

const UserStoryFields = z.object({
  acceptance_criteria: z.string().optional(),
  requirement_version: z.string().optional().default('1'),
  change_reason: z.string().optional(),
  ba_author: z.string().optional(),
  initial_effort: z.number().nullable().optional(),
  remaining_effort: z.number().nullable().optional(),
});

const TestCaseFields = z.object({
  service_name: z.string().optional(),
  preconditions: z.string().optional(),
  test_steps: z.string().optional(),
  expected_result: z.string().optional(),
  actual_result: z.string().optional(),
  task_number: z.string().optional(),
  is_regression: z.boolean().optional().default(false),
  execution_count: z.number().optional(),
  note: z.string().optional(),
});

const FieldsByType = {
  bug: BugFields,
  task: TaskFields,
  user_story: UserStoryFields,
  test_case: TestCaseFields,
};

const UnifiedPayloadSchema = z.discriminatedUnion('artifact_type', [
  z.object({
    artifact_type: z.literal('bug'),
    project_id: z.string().uuid().optional(),
    tuleap: TuleapMeta.optional(),
    common: CommonFields,
    fields: BugFields,
  }),
  z.object({
    artifact_type: z.literal('task'),
    project_id: z.string().uuid().optional(),
    tuleap: TuleapMeta.optional(),
    common: CommonFields,
    fields: TaskFields,
  }),
  z.object({
    artifact_type: z.literal('user_story'),
    project_id: z.string().uuid().optional(),
    tuleap: TuleapMeta.optional(),
    common: CommonFields,
    fields: UserStoryFields,
  }),
  z.object({
    artifact_type: z.literal('test_case'),
    project_id: z.string().uuid().optional(),
    tuleap: TuleapMeta.optional(),
    common: CommonFields,
    fields: TestCaseFields,
  }),
]);

module.exports = {
  ArtifactType,
  CommonFields,
  BugFields,
  TaskFields,
  UserStoryFields,
  TestCaseFields,
  FieldsByType,
  UnifiedPayloadSchema,
  TuleapMeta,
  ArtifactLink,
  Attachment,
};
