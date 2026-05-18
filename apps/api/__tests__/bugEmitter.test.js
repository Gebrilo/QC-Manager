const { emitToTuleap } = require('../src/services/emitters/bug');

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

describe('bug emitter — emitToTuleap', () => {
  const config = {
    tuleap_tracker_id: 102,
    tuleap_base_url: 'https://tuleap.example.com',
    artifact_fields: {},
    status_value_map: { Open: 'New', Done: 'Closed' },
    value_maps: {},
  };

  beforeEach(() => {
    defaultClient.post.mockReset();
    defaultClient.put.mockReset();
    defaultClient.delete.mockReset();
    defaultRegistry.getField.mockReset();
    defaultRegistry.resolveBindValue.mockReset();
  });

  it('creates a bug in Tuleap in create mode', async () => {
    const unified = {
      artifact_type: 'bug',
      project_id: 'proj-1',
      common: { title: 'New bug', status: 'Open', description: 'desc' },
      fields: { severity: 'high', environment: 'PROD' },
    };

    defaultRegistry.getField.mockImplementation(async (trackerId, fieldName) => {
      if (fieldName === 'bug_title') return { field_id: 101, name: 'bug_title', type: 'string' };
      if (fieldName === 'steps_to_reproduce') return { field_id: 102, name: 'steps_to_reproduce', type: 'text' };
      if (fieldName === 'severity') return { field_id: 103, name: 'severity', type: 'sb' };
      if (fieldName === 'status') return { field_id: 104, name: 'status', type: 'sb' };
      if (fieldName === 'environment') return { field_id: 105, name: 'environment', type: 'sb' };
      return { field_id: 999, name: fieldName, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, val) => ({ id: 400 + val.length }));

    defaultClient.post.mockResolvedValueOnce({
      data: { id: 99999, xref: 'bug #99999' },
    });

    const result = await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(result.tuleap_artifact_id).toBe(99999);
    expect(defaultClient.post).toHaveBeenCalledTimes(1);
    const postArgs = defaultClient.post.mock.calls[0];
    expect(postArgs[0]).toBe('/artifacts');
    expect(postArgs[1].tracker.id).toBe(102);
  });

  it('updates a bug in Tuleap in update mode', async () => {
    const unified = {
      artifact_type: 'bug',
      project_id: 'proj-1',
      common: { title: 'Updated', status: 'Done' },
      fields: {},
      tuleap: { artifact_id: 67890 },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => ({ field_id: 100, name: fn, type: 'string' }));

    defaultClient.put.mockResolvedValueOnce({ data: { id: 67890 } });

    const result = await emitToTuleap(unified, config, 'update', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.put).toHaveBeenCalledTimes(1);
    const putArgs = defaultClient.put.mock.calls[0];
    expect(putArgs[0]).toBe('/artifacts/67890');
  });

  it('deletes an artifact in Tuleap in delete mode', async () => {
    const unified = {
      artifact_type: 'bug',
      tuleap: { artifact_id: 67890 },
    };

    defaultClient.delete.mockResolvedValueOnce({ status: 200 });

    const result = await emitToTuleap(unified, config, 'delete', { client: defaultClient, registry: defaultRegistry });

    expect(defaultClient.delete).toHaveBeenCalledWith('/artifacts/67890');
    expect(result.deleted).toBe(true);
  });

  it('translates QC UUIDs back to Tuleap integer IDs for linked test cases', async () => {
    const unified = {
      artifact_type: 'bug',
      project_id: 'proj-1',
      common: { title: 'Bug with links', status: 'Open' },
      fields: { linked_test_case_ids: ['qc-uuid-1', 'qc-uuid-2'] },
    };

    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ tuleap_artifact_id: 140 }] })
      .mockResolvedValueOnce({ rows: [{ tuleap_artifact_id: 141 }] });

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'test-case' || fn === 'linked_test_case_ids') return { field_id: 200, name: fn, type: 'art_link' };
      return { field_id: 100, name: fn, type: 'string' };
    });

    defaultClient.post.mockResolvedValueOnce({ data: { id: 88888 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry, query });

    const postArgs = defaultClient.post.mock.calls[0];
    const values = postArgs[1].values;
    const linkValue = values.find(v => v.links !== undefined);
    expect(linkValue).toBeDefined();
    expect(linkValue.links).toEqual([{ id: 140 }, { id: 141 }]);
  });

  it('converts severity to Tuleap labels via built-in map when no value_map configured', async () => {
    const unified = {
      artifact_type: 'bug',
      project_id: 'proj-1',
      common: { title: 'Critical bug', status: 'Open' },
      fields: { severity: 'critical' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'severity') return { field_id: 103, name: 'severity', type: 'sb' };
      if (fn === 'status') return { field_id: 104, name: 'status', type: 'sb' };
      return { field_id: 100, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, val) => ({ id: 500 }));
    defaultClient.post.mockResolvedValueOnce({ data: { id: 88888 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(defaultRegistry.resolveBindValue).toHaveBeenCalledWith(102, 'severity', 'Critical impact');
  });

  it('applies value_maps from config for outbound field translation', async () => {
    const configWithMaps = {
      ...config,
      value_maps: {
        severity: { critical: 'Critical', high: 'High' },
        status: { Open: 'New', Done: 'Closed' },
      },
    };

    const unified = {
      artifact_type: 'bug',
      project_id: 'proj-1',
      common: { title: 'Mapped bug', status: 'Open' },
      fields: { severity: 'critical' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 104, name: 'status', type: 'sb' };
      if (fn === 'severity') return { field_id: 103, name: 'severity', type: 'sb' };
      return { field_id: 100, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, val) => ({ id: 500 }));

    defaultClient.post.mockResolvedValueOnce({ data: { id: 77777 } });

    await emitToTuleap(unified, configWithMaps, 'create', { client: defaultClient, registry: defaultRegistry });

    expect(defaultRegistry.resolveBindValue).toHaveBeenCalledWith(
      102, 'severity', 'Critical'
    );
    expect(defaultRegistry.resolveBindValue).toHaveBeenCalledWith(
      102, 'status', 'New'
    );
  });
});
