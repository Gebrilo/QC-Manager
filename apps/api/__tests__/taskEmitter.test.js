const { emitToTuleap } = require('../src/modules/integration/services/emitters/task');

jest.mock('../src/modules/integration/services/tuleapClient', () => ({
  createTuleapClient: jest.fn(),
  defaultClient: {
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/modules/integration/services/tuleapFieldRegistry', () => ({
  FieldRegistry: jest.fn(),
  defaultRegistry: {
    getField: jest.fn(),
    getFieldId: jest.fn(),
    resolveBindValue: jest.fn(),
  },
}));

const { defaultClient } = require('../src/modules/integration/services/tuleapClient');
const { defaultRegistry } = require('../src/modules/integration/services/tuleapFieldRegistry');

describe('task emitter — emitToTuleap', () => {
  const config = {
    tuleap_tracker_id: 5,
    tuleap_base_url: 'https://tuleap.example.com',
    artifact_fields: {},
    status_value_map: { Backlog: 'Todo', Done: 'Finished' },
    value_maps: {},
  };

  beforeEach(() => {
    defaultClient.post.mockReset();
    defaultClient.put.mockReset();
    defaultClient.delete.mockReset();
    defaultRegistry.getField.mockReset();
    defaultRegistry.resolveBindValue.mockReset();
  });

  it('creates a task in Tuleap in create mode', async () => {
    const unified = {
      artifact_type: 'task',
      project_id: 'proj-1',
      common: { title: 'New task', status: 'Backlog' },
      fields: { team: 'Alpha' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'title') return { field_id: 101, name: 'title', type: 'string' };
      if (fn === 'status') return { field_id: 104, name: 'status', type: 'sb' };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, val) => ({ id: 500 }));

    defaultClient.post.mockResolvedValueOnce({ data: { id: 88888 } });

    const result = await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(result.tuleap_artifact_id).toBe(88888);
    expect(defaultClient.post).toHaveBeenCalledTimes(1);
  });

  it('updates a task in Tuleap in update mode', async () => {
    const unified = {
      artifact_type: 'task',
      project_id: 'proj-1',
      common: { title: 'Updated', status: 'Done' },
      fields: {},
      tuleap: { artifact_id: 12345 },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => ({ field_id: 100, name: fn, type: 'string' }));

    defaultClient.put.mockResolvedValueOnce({ data: { id: 12345 } });

    const result = await emitToTuleap(unified, config, 'update', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.put).toHaveBeenCalledTimes(1);
    expect(result.tuleap_artifact_id).toBe(12345);
  });

  it('deletes a task in Tuleap in delete mode', async () => {
    const unified = {
      artifact_type: 'task',
      tuleap: { artifact_id: 12345 },
    };

    defaultClient.delete.mockResolvedValueOnce({ status: 200 });

    const result = await emitToTuleap(unified, config, 'delete', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.delete).toHaveBeenCalledWith('/artifacts/12345');
    expect(result.deleted).toBe(true);
  });

  it('applies value_maps for outbound field translation', async () => {
    const configWithMaps = {
      ...config,
      value_maps: {
        status: { Backlog: 'Todo', Done: 'Finished' },
      },
    };

    const unified = {
      artifact_type: 'task',
      project_id: 'proj-1',
      common: { title: 'Task', status: 'Backlog' },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 104, name: 'status', type: 'sb' };
      return { field_id: 100, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, val) => ({ id: 600 }));

    defaultClient.post.mockResolvedValueOnce({ data: { id: 77777 } });

    await emitToTuleap(unified, configWithMaps, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(defaultRegistry.resolveBindValue).toHaveBeenCalledWith(5, 'status', 'Todo');
  });
});