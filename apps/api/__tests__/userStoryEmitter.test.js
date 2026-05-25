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

  it('includes fields that have [read, update, create] permissions in create mode — regression for submit vs create bug', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft' },
      fields: { requirement_version: '1' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'status') return { field_id: 200, name: 'status', type: 'sb', permissions: ['read', 'update', 'create'] };
      if (fn === 'story_title') return { field_id: 201, name: 'story_title', type: 'string', permissions: ['read', 'update', 'create'] };
      if (fn === 'requirement_version') return { field_id: 202, name: 'requirement_version', type: 'int', permissions: ['read', 'update', 'create'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read', 'update', 'create'] };
    });
    defaultRegistry.resolveBindValue.mockResolvedValue({ id: 700 });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 5070 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    const payload = defaultClient.post.mock.calls[0][1];
    expect(payload.values.length).toBeGreaterThan(0);
    expect(payload.values.some(v => v.field_id === 201)).toBe(true);
  });

  it('skips read-only fields (no create permission) in create mode', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft' },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'story_title') return { field_id: 201, name: 'story_title', type: 'string', permissions: ['read'] };
      if (fn === 'status') return { field_id: 200, name: 'status', type: 'sb', permissions: ['read'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read'] };
    });
    defaultRegistry.resolveBindValue.mockResolvedValue({ id: 700 });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 5080 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    const payload = defaultClient.post.mock.calls[0][1];
    expect(payload.values).toHaveLength(0);
  });

  it('skips empty string for sb/rb fields instead of throwing a bind value error', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft' },
      fields: { ba_author: '' },
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'ba_author') return { field_id: 203, name: 'ba_author', type: 'sb', permissions: ['read', 'update', 'create'] };
      if (fn === 'status') return { field_id: 200, name: 'status', type: 'sb', permissions: ['read', 'update', 'create'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read', 'update', 'create'] };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, label) => {
      if (label === '') throw new Error(`Bind value '' not found for field '${fn}'`);
      return { id: 700 };
    });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 5090 } });

    await expect(
      emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry })
    ).resolves.toBeDefined();

    const payload = defaultClient.post.mock.calls[0][1];
    expect(payload.values.every(v => v.field_id !== 203)).toBe(true);
  });

  it('skips invalid optional bind values instead of failing the create', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft', priority: 'None' },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'priority') return { field_id: 298, name: 'priority', type: 'sb', required: false, permissions: ['read', 'update', 'create'] };
      if (fn === 'status') return { field_id: 200, name: 'status', type: 'sb', required: true, permissions: ['read', 'update', 'create'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read', 'update', 'create'] };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, label) => {
      if (fn === 'priority' && label === 'None') throw new Error("Bind value 'None' not found for field 'priority'");
      return { id: 700 };
    });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 5095 } });

    await expect(
      emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry })
    ).resolves.toBeDefined();

    const payload = defaultClient.post.mock.calls[0][1];
    expect(payload.values.every(v => v.field_id !== 298)).toBe(true);
  });

  it('sends Summary (story_title) with the QC title as the {value} for the string field', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'My Story Summary', status: 'Draft' },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'story_title') return { field_id: 526, name: 'story_title', type: 'string', permissions: ['read', 'update', 'create'] };
      if (fn === 'status') return { field_id: 525, name: 'status', type: 'sb', permissions: ['read', 'update', 'create'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read', 'update', 'create'] };
    });
    defaultRegistry.resolveBindValue.mockResolvedValue({ id: 241 });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 6010 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    const payload = defaultClient.post.mock.calls[0][1];
    const titleEntry = payload.values.find(v => v.field_id === 526);
    expect(titleEntry).toEqual({ field_id: 526, value: 'My Story Summary' });
  });

  it('maps unified common.links to Tuleap user_stories art_link field', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: {
        title: 'Story with link',
        status: 'Draft',
        links: [
          { type: 'is_related', target_artifact_id: 444 },
          { type: '_is_child', target_artifact_id: '555' },
        ],
      },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'user_stories') return { field_id: 542, name: 'user_stories', type: 'art_link', permissions: ['read', 'update', 'create'] };
      if (fn === 'status') return { field_id: 525, name: 'status', type: 'sb', permissions: ['read', 'update', 'create'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read', 'update', 'create'] };
    });
    defaultRegistry.resolveBindValue.mockResolvedValue({ id: 241 });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 6020 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    const payload = defaultClient.post.mock.calls[0][1];
    const linksEntry = payload.values.find(v => v.field_id === 542);
    expect(linksEntry).toEqual({
      field_id: 542,
      links: [
        { id: 444, type: 'is_related' },
        { id: 555, type: '_is_child' },
      ],
    });
  });

  it('skips the art_link field entirely when there are no links to send', async () => {
    const unified = {
      artifact_type: 'user_story',
      project_id: 'proj-1',
      common: { title: 'No links', status: 'Draft', links: [] },
      fields: {},
    };

    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'user_stories') return { field_id: 542, name: 'user_stories', type: 'art_link', permissions: ['read', 'update', 'create'] };
      if (fn === 'status') return { field_id: 525, name: 'status', type: 'sb', permissions: ['read', 'update', 'create'] };
      return { field_id: 999, name: fn, type: 'string', permissions: ['read', 'update', 'create'] };
    });
    defaultRegistry.resolveBindValue.mockResolvedValue({ id: 241 });
    defaultClient.post.mockResolvedValueOnce({ data: { id: 6030 } });

    await emitToTuleap(unified, config, 'create', { client: defaultClient, registry: defaultRegistry });

    const payload = defaultClient.post.mock.calls[0][1];
    expect(payload.values.find(v => v.field_id === 542)).toBeUndefined();
  });
});
