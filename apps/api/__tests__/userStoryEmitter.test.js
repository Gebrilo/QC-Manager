const { emitToTuleap } = require('../src/services/emitters/user_story');

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

describe('user_story emitter — emitToTuleap', () => {
  const config = {
    tuleap_tracker_id: 6,
    tracker_type: 'user_story',
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

  it('creates a user story in Tuleap in create mode', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'New story', status: 'Draft', description: 'Story description' },
      fields: { acceptance_criteria: 'AC', requirement_version: '1', ba_author: 'Alice' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 200, name: 'status', type: 'sb' };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async () => ({ id: 700 }));
    defaultClient.post.mockResolvedValueOnce({ data: { id: 5050, xref: 'story #5050' } });

    const result = await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(result.tuleap_artifact_id).toBe(5050);
    expect(result.artifact_type).toBe('user_story');
    expect(defaultClient.post).toHaveBeenCalledTimes(1);
    const postArgs = defaultClient.post.mock.calls[0];
    expect(postArgs[0]).toBe('/artifacts');
    expect(postArgs[1].tracker.id).toBe(6);
  });

  it('updates a user story in Tuleap in update mode', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Updated', status: 'Approved' },
      fields: {},
      tuleap: { artifact_id: 5050 },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => ({ field_id: 100, name: fn, type: 'string' }));
    defaultClient.put.mockResolvedValueOnce({ data: { id: 5050 } });

    const result = await emitToTuleap(unified, config, 'update', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.put).toHaveBeenCalledTimes(1);
    expect(defaultClient.put.mock.calls[0][0]).toBe('/artifacts/5050');
    expect(result.updated).toBe(true);
    expect(result.tuleap_artifact_id).toBe(5050);
  });

  it('deletes a user story in Tuleap in delete mode', async () => {
    const unified = {
      artifact_type: 'user_story',
      tuleap: { artifact_id: 5050 },
    };

    defaultClient.delete.mockResolvedValueOnce({ status: 200 });

    const result = await emitToTuleap(unified, config, 'delete', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.delete).toHaveBeenCalledWith('/artifacts/5050');
    expect(result.deleted).toBe(true);
  });

  it('applies value_maps for outbound field translation', async () => {
    const configWithMaps = {
      ...config,
      value_maps: {
        status: { Draft: 'New', Approved: 'Closed' },
      },
    };

    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft' },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 200, name: 'status', type: 'sb' };
      return { field_id: 100, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async () => ({ id: 700 }));
    defaultClient.post.mockResolvedValueOnce({ data: { id: 5060 } });

    await emitToTuleap(unified, configWithMaps, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(defaultRegistry.resolveBindValue).toHaveBeenCalledWith(6, 'status', 'New');
  });

  it('throws when artifact_id is missing in update mode', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft' },
      fields: {},
    };

    await expect(
      emitToTuleap(unified, config, 'update', { client: defaultClient, registry: defaultRegistry })
    ).rejects.toThrow(/artifact_id/i);
  });
});
