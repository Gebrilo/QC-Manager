const {
  applyFieldMappings,
  applyStatusMap,
  reverseStatusMap,
  fromTuleap,
  toTuleap,
} = require('../src/services/tuleapTransformEngine');

describe('applyFieldMappings', () => {
  it('maps using config\'s artifact_fields', () => {
    const config = {
      tracker_type: 'bug',
      artifact_fields: { bug_title: 'custom_title' },
    };
    const result = applyFieldMappings(
      { bug_title: 'Bug 1', severity: 'Major impact' },
      config
    );
    expect(result).toEqual({
      custom_title: 'Bug 1',
      severity: 'Major impact',
    });
  });

  it('falls back to BASE_FIELD_MAPPINGS when config empty', () => {
    const config = { tracker_type: 'bug' };
    const result = applyFieldMappings(
      { bug_title: 'Bug 1', steps_to_reproduce: 'Step 1\nStep 2' },
      config
    );
    expect(result).toEqual({
      title: 'Bug 1',
      description: 'Step 1\nStep 2',
    });
  });

  it('ignores fields not in mapping (pass-through)', () => {
    const config = { tracker_type: 'bug' };
    const result = applyFieldMappings(
      { bug_title: 'Bug 1', unknown_custom_field: 'value' },
      config
    );
    expect(result).toEqual({
      title: 'Bug 1',
      unknown_custom_field: 'value',
    });
  });
});

describe('applyStatusMap', () => {
  it('maps known statuses', () => {
    const config = {
      status_value_map: { New: 'new', 'In Progress': 'in_progress' },
    };
    expect(applyStatusMap('New', config)).toBe('new');
    expect(applyStatusMap('In Progress', config)).toBe('in_progress');
  });

  it('returns original for unknown statuses', () => {
    const config = {
      status_value_map: { New: 'new' },
    };
    expect(applyStatusMap('Unknown', config)).toBe('Unknown');
  });
});

describe('reverseStatusMap', () => {
  it('correctly reverses the map', () => {
    const map = { New: 'new', 'In Progress': 'in_progress', Fixed: 'fixed' };
    expect(reverseStatusMap(map)).toEqual({
      new: 'New',
      in_progress: 'In Progress',
      fixed: 'Fixed',
    });
  });
});

describe('fromTuleap', () => {
  it('transforms bug payload to unified format', () => {
    const config = {
      tracker_type: 'bug',
      qc_project_id: 'proj-uuid-1',
      tuleap_project_id: 101,
      tuleap_tracker_id: 1,
      artifact_fields: {},
      status_value_map: { New: 'new' },
    };
    const tuleapValues = {
      bug_title: 'Login crash',
      steps_to_reproduce: '1. Open app\n2. Click login',
      severity: 'Major impact',
      status: 'New',
      unknown_field: 'pass-through-value',
    };
    const result = fromTuleap(tuleapValues, config);
    expect(result).toEqual({
      artifact_type: 'bug',
      project_id: 'proj-uuid-1',
      tuleap: { project_id: 101, tracker_id: 1 },
      common: {
        title: 'Login crash',
        description: '1. Open app\n2. Click login',
        status: 'new',
      },
      fields: {
        severity: 'Major impact',
        unknown_field: 'pass-through-value',
      },
    });
  });

  it('transforms task payload to unified format', () => {
    const config = {
      tracker_type: 'task',
      qc_project_id: 'proj-uuid-2',
      tuleap_project_id: 101,
      tuleap_tracker_id: 5,
      artifact_fields: {},
      status_value_map: { Todo: 'todo' },
    };
    const tuleapValues = {
      title: 'Implement OAuth',
      details: 'Implement OAuth2 flow',
      status: 'Todo',
      team: 'Backend',
    };
    const result = fromTuleap(tuleapValues, config);
    expect(result.artifact_type).toBe('task');
    expect(result.project_id).toBe('proj-uuid-2');
    expect(result.tuleap).toEqual({ project_id: 101, tracker_id: 5 });
    expect(result.common).toEqual({
      title: 'Implement OAuth',
      description: 'Implement OAuth2 flow',
      status: 'todo',
    });
    expect(result.fields).toEqual({ team: 'Backend' });
  });
});

describe('toTuleap', () => {
  it('transforms unified bug payload to Tuleap field names', () => {
    const config = {
      tracker_type: 'bug',
      artifact_fields: {},
      status_value_map: { New: 'new' },
    };
    const unifiedPayload = {
      artifact_type: 'bug',
      project_id: 'proj-uuid-1',
      common: { title: 'Login crash', status: 'new' },
      fields: { severity: 'Major impact' },
    };
    const result = toTuleap(unifiedPayload, config);
    expect(result).toEqual({
      bug_title: 'Login crash',
      status: 'New',
      severity: 'Major impact',
    });
  });

  it('preserves pass-through fields not in mapping', () => {
    const config = { tracker_type: 'bug' };
    const unifiedPayload = {
      common: { title: 'Login crash' },
      fields: { unknown_field: 'value' },
    };
    const result = toTuleap(unifiedPayload, config);
    expect(result.unknown_field).toBe('value');
  });

  it('reverses status values', () => {
    const config = {
      tracker_type: 'bug',
      status_value_map: { New: 'new', Fixed: 'fixed', 'In Progress': 'in_progress' },
    };
    const unifiedPayload = {
      common: { title: 'Login crash', status: 'fixed' },
      fields: {},
    };
    const result = toTuleap(unifiedPayload, config);
    expect(result.status).toBe('Fixed');
  });
});
