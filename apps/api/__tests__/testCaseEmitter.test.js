const { emitToTuleap } = require('../src/services/emitters/test_case');

jest.mock('../src/services/tuleapClient', () => ({
  createTuleapClient: jest.fn(),
  defaultClient: {
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/services/tuleapFieldRegistry', () => ({
  FieldRegistry: jest.fn(),
  defaultRegistry: {
    getField: jest.fn(),
    getFieldId: jest.fn(),
    resolveBindValue: jest.fn(),
  },
}));

const { defaultClient } = require('../src/services/tuleapClient');
const { defaultRegistry } = require('../src/services/tuleapFieldRegistry');

describe('test_case emitter — emitToTuleap', () => {
  const config = {
    tuleap_tracker_id: 7,
    tracker_type: 'test_case',
    tuleap_base_url: 'https://tuleap.example.com',
    artifact_fields: {},
    value_maps: {},
  };

  beforeEach(() => {
    defaultClient.post.mockReset();
    defaultClient.put.mockReset();
    defaultClient.delete.mockReset();
    defaultRegistry.getField.mockReset();
    defaultRegistry.resolveBindValue.mockReset();
  });

  it('creates a test case in Tuleap in create mode', async () => {
    const unified = {
      artifact_type: 'test_case',
      project_id: 'proj-1',
      common: { title: 'Login test', status: 'active', description: 'Verify login works' },
      fields: { test_steps: 'Step 1', expected_result: 'Logged in' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 300, name: 'status', type: 'sb' };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async () => ({ id: 800 }));
    defaultClient.post.mockResolvedValueOnce({ data: { id: 6001, xref: 'tc #6001' } });

    const result = await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(result.tuleap_artifact_id).toBe(6001);
    expect(result.artifact_type).toBe('test_case');
    expect(defaultClient.post).toHaveBeenCalledTimes(1);
    const postArgs = defaultClient.post.mock.calls[0];
    expect(postArgs[0]).toBe('/artifacts');
    expect(postArgs[1].tracker.id).toBe(7);
  });

  it('updates a test case in Tuleap in update mode', async () => {
    const unified = {
      artifact_type: 'test_case',
      project_id: 'proj-1',
      common: { title: 'Updated', status: 'deprecated' },
      fields: {},
      tuleap: { artifact_id: 6001 },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => ({ field_id: 100, name: fn, type: 'string' }));
    defaultClient.put.mockResolvedValueOnce({ data: { id: 6001 } });

    const result = await emitToTuleap(unified, config, 'update', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.put).toHaveBeenCalledTimes(1);
    expect(defaultClient.put.mock.calls[0][0]).toBe('/artifacts/6001');
    expect(result.updated).toBe(true);
    expect(result.tuleap_artifact_id).toBe(6001);
  });

  it('deletes a test case in Tuleap in delete mode', async () => {
    const unified = {
      artifact_type: 'test_case',
      tuleap: { artifact_id: 6001 },
    };

    defaultClient.delete.mockResolvedValueOnce({ status: 200 });

    const result = await emitToTuleap(unified, config, 'delete', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.delete).toHaveBeenCalledWith('/artifacts/6001');
    expect(result.deleted).toBe(true);
  });

  it('applies value_maps for outbound field translation', async () => {
    const configWithMaps = {
      ...config,
      value_maps: {
        status: { active: 'New', deprecated: 'Closed' },
      },
    };

    const unified = {
      artifact_type: 'test_case',
      project_id: 'proj-1',
      common: { title: 'Test', status: 'active' },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 300, name: 'status', type: 'sb' };
      return { field_id: 100, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async () => ({ id: 800 }));
    defaultClient.post.mockResolvedValueOnce({ data: { id: 6070 } });

    await emitToTuleap(unified, configWithMaps, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(defaultRegistry.resolveBindValue).toHaveBeenCalledWith(7, 'status', 'New');
  });

  it('throws when artifact_id is missing in update mode', async () => {
    const unified = {
      artifact_type: 'test_case',
      project_id: 'proj-1',
      common: { title: 'Test', status: 'active' },
      fields: {},
    };

    await expect(
      emitToTuleap(unified, config, 'update', { client: defaultClient, registry: defaultRegistry })
    ).rejects.toThrow(/artifact_id/i);
  });
});
