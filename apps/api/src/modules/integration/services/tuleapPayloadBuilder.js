function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`'${name}' is required`);
  }
  return value;
}

async function buildUserStoryPayload(input, registry) {
  const t = input.trackerId;
  required(input.summary, 'summary');
  required(input.status, 'status');
  required(input.requirementVersion, 'requirementVersion');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  // Real Tuleap field names (tracker 6): story_title, overview_description, acceptance_criteria
  await push('story_title', { value: input.summary });
  if (input.description) await push('overview_description', { value: input.description });
  if (input.acceptanceCriteria) await push('acceptance_criteria', { value: input.acceptanceCriteria });
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', input.status)).id] });
  // ba_author is a select-box (sb) in Tuleap — values: ['BA-Team']
  if (input.baAuthor) await push('ba_author', { bind_value_ids: [(await registry.resolveBindValue(t, 'ba_author', input.baAuthor)).id] });
  await push('requirement_version', { value: Number(input.requirementVersion) });
  if (input.priority) await push('priority', { bind_value_ids: [(await registry.resolveBindValue(t, 'priority', input.priority)).id] });
  if (input.initialEffort != null) await push('initial_effort', { value: Number(input.initialEffort) });
  if (input.remainingEffort != null) await push('remaining_effort', { value: Number(input.remainingEffort) });
  if (input.changeReason) await push('change_reason', { value: input.changeReason });
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });

  return { tracker: { id: t }, values };
}

async function buildTestCasePayload(input, registry) {
  const t = input.trackerId;
  required(input.title, 'title');
  required(input.testSteps, 'testSteps');
  required(input.expectedResult, 'expectedResult');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('title', { value: input.title });
  await push('test_steps', { value: input.testSteps });
  await push('expected_result', { value: input.expectedResult });

  const statusLabel = input.status || 'Not Run';
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', statusLabel)).id] });

  if (input.serviceName) await push('service_name', { value: input.serviceName });
  if (input.preconditions) await push('preconditions', { value: input.preconditions });
  if (input.actualResult) await push('actual_result', { value: input.actualResult });
  // assigned_to is msb (multi-select) with user labels e.g. 'belal.z'
  if (input.assignedTo) await push('assigned_to', { bind_value_ids: [(await registry.resolveBindValue(t, 'assigned_to', input.assignedTo)).id] });
  // is_regression is rb — only value is 'Is Regression'; pass [] to unset
  if (input.isRegression) await push('is_regression', { bind_value_ids: [(await registry.resolveBindValue(t, 'is_regression', 'Is Regression')).id] });
  if (!input.isRegression && input.isRegression != null) await push('is_regression', { bind_value_ids: [] });
  if (input.note) await push('note', { value: input.note });
  if (input.attachmentIds?.length) await push('attachments_1', { value: input.attachmentIds });
  if (input.linkedArtifactIds?.length) {
    await push('links', { links: input.linkedArtifactIds.map(id => ({ id })) });
  }

  return { tracker: { id: t }, values };
}

async function buildTaskPayload(input, registry) {
  const t = input.trackerId;
  required(input.taskTitle, 'taskTitle');
  required(input.assignedTo, 'assignedTo');
  required(input.team, 'team');
  required(input.status, 'status');
  required(input.parentStoryArtifactId, 'parentStoryArtifactId');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  // Real Tuleap field names (tracker 5): title, details, assigned_to (sb), team (sb)
  await push('title', { value: input.taskTitle });
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', input.status)).id] });
  // assigned_to is sb — label is the Tuleap username e.g. 'belal.z'
  await push('assigned_to', { bind_value_ids: [(await registry.resolveBindValue(t, 'assigned_to', input.assignedTo)).id] });
  await push('team', { bind_value_ids: [(await registry.resolveBindValue(t, 'team', input.team)).id] });
  await push('parent_story', { links: [{ id: Number(input.parentStoryArtifactId) }] });

  if (input.description) await push('details', { value: input.description });
  if (input.pmFinalEstimate != null) await push('pm_final_estimate', { value: Number(input.pmFinalEstimate) });
  if (input.actualEffort != null) await push('actual_effort', { value: Number(input.actualEffort) });
  if (input.blockedReason) await push('blocked_reason', { value: input.blockedReason });

  return { tracker: { id: t }, values };
}

async function buildBugPayload(input, registry) {
  const t = input.trackerId;
  required(input.bugTitle, 'bugTitle');
  required(input.environment, 'environment');
  required(input.serviceName, 'serviceName');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('bug_title', { value: input.bugTitle });
  await push('service_name', { value: input.serviceName });
  await push('environment', { bind_value_ids: [(await registry.resolveBindValue(t, 'environment', input.environment)).id] });

  // Real Tuleap status values (tracker 1): 'New', 'In Progress', 'Assigned', 'Fixed', 'Verified', 'Reopened'
  const statusLabel = input.status || 'New';
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', statusLabel)).id] });

  // Real field names: steps_to_reproduce, test-case (art_link), severity labels differ
  if (input.description) await push('steps_to_reproduce', { value: input.description });
  // assigned_to is sb — label is Tuleap username
  if (input.assignedTo) await push('assigned_to', { bind_value_ids: [(await registry.resolveBindValue(t, 'assigned_to', input.assignedTo)).id] });
  // severity labels: 'Cosmetic impact' | 'Minor impact' | 'Major impact' | 'Critical impact'
  if (input.severity) await push('severity', { bind_value_ids: [(await registry.resolveBindValue(t, 'severity', input.severity)).id] });
  if (input.initialEffort != null) await push('initial_effort', { value: Number(input.initialEffort) });
  if (input.remainingEffort != null) await push('remaining_effort', { value: Number(input.remainingEffort) });
  if (input.testCaseArtifactId) {
    await push('test-case', { links: [{ id: Number(input.testCaseArtifactId) }] });
  }
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });

  return { tracker: { id: t }, values };
}

module.exports = { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload };