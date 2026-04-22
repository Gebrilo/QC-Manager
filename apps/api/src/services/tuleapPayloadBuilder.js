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
  required(input.baAuthor, 'baAuthor');
  required(input.requirementVersion, 'requirementVersion');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('summary', { value: input.summary });
  if (input.description) await push('description', { value: input.description });
  if (input.acceptanceCriteria) await push('acceptance_criteria', { value: input.acceptanceCriteria });
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', input.status)).id] });
  await push('ba_author', { value: input.baAuthor });
  await push('requirement_version', { value: input.requirementVersion });
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
  if (input.assignedTo) await push('assigned_to', { value: input.assignedTo });
  if (input.isRegression != null) await push('is_regression', { bind_value_ids: [input.isRegression ? 1 : 0] });
  if (input.note) await push('note', { value: input.note });
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });
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

  await push('task_title', { value: input.taskTitle });
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', input.status)).id] });
  await push('assigned_to', { value: input.assignedTo });
  await push('team', { bind_value_ids: [(await registry.resolveBindValue(t, 'team', input.team)).id] });
  await push('parent_story', { links: [{ id: Number(input.parentStoryArtifactId) }] });

  if (input.description) await push('description', { value: input.description });
  if (input.devInitialEstimate != null) await push('dev_initial_estimate', { value: Number(input.devInitialEstimate) });
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

  const statusLabel = input.status || 'Open';
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', statusLabel)).id] });

  if (input.description) await push('description', { value: input.description });
  if (input.assignedTo) await push('assigned_to', { value: input.assignedTo });
  if (input.severity) await push('severity', { bind_value_ids: [(await registry.resolveBindValue(t, 'severity', input.severity)).id] });
  if (input.initialEffort != null) await push('initial_effort', { value: Number(input.initialEffort) });
  if (input.remainingEffort != null) await push('remaining_effort', { value: Number(input.remainingEffort) });
  if (input.devFixDescription) await push('dev_fix_description', { value: input.devFixDescription });
  if (input.qcVerificationNotes) await push('qc_verification_notes', { value: input.qcVerificationNotes });
  if (input.testCaseArtifactId) {
    await push('test_case_link', { links: [{ id: Number(input.testCaseArtifactId) }] });
  }
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });

  return { tracker: { id: t }, values };
}

module.exports = { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload };