const {
  UnifiedPayloadSchema,
  UnifiedPatchSchema,
} = require('../src/schemas/tuleapUnified');

describe('UnifiedPatchSchema', () => {
  it('is exported from the schema module', () => {
    expect(UnifiedPatchSchema).toBeDefined();
  });

  it('accepts a partial bug payload with only artifact_type and project_id required', () => {
    const payload = {
      artifact_type: 'bug',
      project_id: '11111111-2222-3333-4444-555555555555',
      common: { title: 'Partial update' },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts a full bug payload as well', () => {
    const payload = {
      artifact_type: 'bug',
      project_id: '11111111-2222-3333-4444-555555555555',
      common: {
        title: 'Full bug',
        description: 'desc',
        status: 'Open',
        assigned_to: 'someone',
      },
      fields: {
        severity: 'high',
        environment: 'PROD',
        service_name: 'svc',
      },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects payload missing artifact_type', () => {
    const payload = {
      project_id: '11111111-2222-3333-4444-555555555555',
      common: { title: 'No type' },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing project_id', () => {
    const payload = {
      artifact_type: 'bug',
      common: { title: 'No project' },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('accepts partial task payload', () => {
    const payload = {
      artifact_type: 'task',
      project_id: '11111111-2222-3333-4444-555555555555',
      fields: { team: 'Alpha' },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts partial user_story payload', () => {
    const payload = {
      artifact_type: 'user_story',
      project_id: '11111111-2222-3333-4444-555555555555',
      common: { status: 'In Progress' },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts partial test_case payload', () => {
    const payload = {
      artifact_type: 'test_case',
      project_id: '11111111-2222-3333-4444-555555555555',
      fields: { test_steps: 'step 1\nstep 2' },
    };
    const result = UnifiedPatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
