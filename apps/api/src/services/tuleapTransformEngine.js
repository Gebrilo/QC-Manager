const BASE_FIELD_MAPPINGS = {
  bug: {
    bug_title: 'title',
    steps_to_reproduce: 'description',
    severity: 'severity',
    status: 'status',
    environment: 'environment',
    service_name: 'service_name',
    assigned_to: 'assigned_to',
    initial_effort: 'initial_effort',
    remaining_effort: 'remaining_effort',
    'test-case': 'linked_test_case_ids',
    attachment: 'attachments',
  },
  task: {
    title: 'title',
    details: 'description',
    status: 'status',
    assigned_to: 'assigned_to',
    team: 'team',
    blocked_reason: 'blocked_reason',
    initial_estimate: 'initial_estimate',
    pm_final_estimate: 'final_estimate',
    actual_effort: 'actual_effort',
    parent_story: 'parent_story_id',
  },
  user_story: {
    story_title: 'title',
    overview_description: 'description',
    acceptance_criteria: 'acceptance_criteria',
    status: 'status',
    requirement_version: 'requirement_version',
    ba_author: 'ba_author',
    priority: 'priority',
    initial_effort: 'initial_effort',
    remaining_effort: 'remaining_effort',
    change_reason: 'change_reason',
    attachment: 'attachments',
  },
  test_case: {
    title: 'title',
    test_steps: 'test_steps',
    expected_result: 'expected_result',
    status: 'status',
    service_name: 'service_name',
    preconditions: 'preconditions',
    actual_result: 'actual_result',
    assigned_to: 'assigned_to',
    is_regression: 'is_regression',
    note: 'note',
    attachments_1: 'attachments',
    links: 'links',
  },
};

const UNIQUE_FIELDS_PER_TYPE = {
  bug: ['severity', 'environment', 'service_name', 'steps_to_reproduce', 'dev_fix_description', 'qc_verification_notes', 'close_date', 'cc', 'linked_test_case_ids', 'initial_effort', 'remaining_effort'],
  task: ['team', 'parent_story_id', 'initial_estimate', 'final_estimate', 'actual_effort', 'blocked_reason'],
  user_story: ['acceptance_criteria', 'requirement_version', 'change_reason', 'ba_author', 'initial_effort', 'remaining_effort'],
  test_case: ['service_name', 'preconditions', 'test_steps', 'expected_result', 'actual_result', 'task_number', 'is_regression', 'execution_count', 'note'],
};

const COMMON_FIELD_NAMES = ['title', 'description', 'status', 'assigned_to', 'priority', 'attachments', 'links'];

function getEffectiveMapping(config) {
  const base = BASE_FIELD_MAPPINGS[config.tracker_type] || {};
  const overrides = config.artifact_fields || {};
  return { ...base, ...overrides };
}

function applyFieldMappings(tuleapValues, config) {
  const mapping = getEffectiveMapping(config);
  const result = {};
  for (const [key, value] of Object.entries(tuleapValues)) {
    if (value === undefined || value === null) continue;
    const unifiedKey = mapping[key] || key;
    result[unifiedKey] = value;
  }
  return result;
}

function applyStatusMap(tuleapStatus, config) {
  if (!config.status_value_map || typeof config.status_value_map !== 'object') {
    return tuleapStatus;
  }
  return config.status_value_map[tuleapStatus] || tuleapStatus;
}

function reverseStatusMap(statusValueMap) {
  if (!statusValueMap || typeof statusValueMap !== 'object') {
    return {};
  }
  const reversed = {};
  for (const [tuleapStatus, qcStatus] of Object.entries(statusValueMap)) {
    reversed[qcStatus] = tuleapStatus;
  }
  return reversed;
}

function fromTuleap(tuleapValues, config) {
  const mapped = applyFieldMappings(tuleapValues, config);
  const common = {};
  const fields = {};

  for (const [key, value] of Object.entries(mapped)) {
    if (value === undefined || value === null) continue;

    let finalValue = value;
    if (key === 'status') {
      finalValue = applyStatusMap(value, config);
    }

    if (COMMON_FIELD_NAMES.includes(key)) {
      common[key] = finalValue;
    } else {
      fields[key] = finalValue;
    }
  }

  return {
    artifact_type: config.tracker_type,
    project_id: config.qc_project_id,
    tuleap: {
      project_id: config.tuleap_project_id,
      tracker_id: config.tuleap_tracker_id,
    },
    common,
    fields,
  };
}

function toTuleap(unifiedPayload, config) {
  const mapping = getEffectiveMapping(config);
  const reverseMapping = {};
  for (const [tuleapName, unifiedName] of Object.entries(mapping)) {
    reverseMapping[unifiedName] = tuleapName;
  }

  const merged = {
    ...(unifiedPayload.common || {}),
    ...(unifiedPayload.fields || {}),
  };

  const reversedStatusMapObj = reverseStatusMap(config.status_value_map);
  const result = {};

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) continue;
    if (key === 'project_id' || key === 'artifact_type') continue;

    let finalValue = value;
    const tuleapKey = reverseMapping[key] || key;

    if (key === 'status') {
      finalValue = reversedStatusMapObj[value] || value;
    }

    result[tuleapKey] = finalValue;
  }

  return result;
}

module.exports = {
  BASE_FIELD_MAPPINGS,
  UNIQUE_FIELDS_PER_TYPE,
  COMMON_FIELD_NAMES,
  getEffectiveMapping,
  applyFieldMappings,
  applyStatusMap,
  reverseStatusMap,
  fromTuleap,
  toTuleap,
};
