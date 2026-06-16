const { emitToTuleap: emitBug } = require('../src/services/emitters/bug');
const { emitToTuleap: emitTask } = require('../src/services/emitters/task');
const { emitToTuleap: emitTestCase } = require('../src/services/emitters/test_case');
const { emitToTuleap: emitUserStory } = require('../src/services/emitters/user_story');

jest.mock('../src/services/tuleapClient', () => ({
  createTuleapClient: jest.fn(),
  defaultClient: { post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../src/services/tuleapFieldRegistry', () => ({
  FieldRegistry: jest.fn(),
  defaultRegistry: { getField: jest.fn(), getFieldId: jest.fn(), resolveBindValue: jest.fn() },
}));

const { defaultClient } = require('../src/services/tuleapClient');
const { defaultRegistry } = require('../src/services/tuleapFieldRegistry');

const baseConfig = (trackerId, trackerType) => ({
  tuleap_tracker_id: trackerId,
  tracker_type: trackerType,
  tuleap_base_url: 'https://tuleap.example.com',
  artifact_fields: {},
  value_maps: {},
});

function makeFieldMocks(overrides = {}) {
  return async (tid, fn) => overrides[fn] || { field_id: 999, name: fn, type: 'string' };
}

describe('emitter numeric coercion (Part A — requirement_version / int / float)', () => {
  beforeEach(() => {
    defaultClient.post.mockReset();
    defaultClient.put.mockReset();
    defaultRegistry.getField.mockReset();
    defaultRegistry.resolveBindValue.mockReset();
    defaultClient.post.mockResolvedValue({ data: { id: 70000 } });
  });

  it('coerces requirement_version "1.0" to integer 1 for user_story', async () => {
    defaultRegistry.getField.mockImplementation(makeFieldMocks({
      requirement_version: { field_id: 301, name: 'requirement_version', type: 'int' },
    }));

    await emitUserStory(
      { artifact_type: 'user_story', project_id: 'p1', common: { title: 'S', status: 'Draft' }, fields: { requirement_version: '1.0' } },
      baseConfig(6, 'user_story'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    const rv = values.find(v => v.field_id === 301);
    expect(rv).toEqual({ field_id: 301, value: 1 });
  });

  it('coerces requirement_version "2" to integer 2 for user_story', async () => {
    defaultRegistry.getField.mockImplementation(makeFieldMocks({
      requirement_version: { field_id: 301, name: 'requirement_version', type: 'int' },
    }));

    await emitUserStory(
      { artifact_type: 'user_story', project_id: 'p1', common: { title: 'S', status: 'Draft' }, fields: { requirement_version: '2' } },
      baseConfig(6, 'user_story'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 301)).toEqual({ field_id: 301, value: 2 });
  });

  it('skips a non-numeric int field instead of sending a string', async () => {
    defaultRegistry.getField.mockImplementation(makeFieldMocks({
      requirement_version: { field_id: 301, name: 'requirement_version', type: 'int' },
    }));

    await emitUserStory(
      { artifact_type: 'user_story', project_id: 'p1', common: { title: 'S', status: 'Draft' }, fields: { requirement_version: 'abc' } },
      baseConfig(6, 'user_story'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 301)).toBeUndefined();
  });

  it('coerces float fields (initial_effort "4.5") for bug', async () => {
    defaultRegistry.getField.mockImplementation(makeFieldMocks({
      initial_effort: { field_id: 410, name: 'initial_effort', type: 'float' },
    }));

    await emitBug(
      { artifact_type: 'bug', project_id: 'p1', common: { title: 'B', status: 'New' }, fields: { initial_effort: '4.5' } },
      baseConfig(102, 'bug'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 410)).toEqual({ field_id: 410, value: 4.5 });
  });

  it('coerces int fields (remaining_effort "3") for bug', async () => {
    defaultRegistry.getField.mockImplementation(makeFieldMocks({
      remaining_effort: { field_id: 411, name: 'remaining_effort', type: 'int' },
    }));

    await emitBug(
      { artifact_type: 'bug', project_id: 'p1', common: { title: 'B', status: 'New' }, fields: { remaining_effort: '3' } },
      baseConfig(102, 'bug'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 411)).toEqual({ field_id: 411, value: 3 });
  });

  it('coerces computed fields for task', async () => {
    defaultRegistry.getField.mockImplementation(makeFieldMocks({
      actual_effort: { field_id: 510, name: 'actual_effort', type: 'computed' },
    }));

    await emitTask(
      { artifact_type: 'task', project_id: 'p1', common: { title: 'T', status: 'In Progress' }, fields: { actual_effort: '7.5' } },
      baseConfig(200, 'task'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 510)).toEqual({ field_id: 510, value: 7.5 });
  });
});

describe('emitter graceful bind-skip (Part B — optional bind values)', () => {
  beforeEach(() => {
    defaultClient.post.mockReset();
    defaultClient.put.mockReset();
    defaultRegistry.getField.mockReset();
    defaultRegistry.resolveBindValue.mockReset();
    defaultClient.post.mockResolvedValue({ data: { id: 80000 } });
  });

  it('skips invalid optional bind for bug instead of aborting the emit', async () => {
    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'assigned_to') return { field_id: 600, name: 'assigned_to', type: 'sb', required: false };
      if (fn === 'status') return { field_id: 601, name: 'status', type: 'sb', required: true };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, label) => {
      if (fn === 'assigned_to' && label === 'bad.user') throw new Error("Bind value 'bad.user' not found");
      return { id: 900 };
    });

    await emitBug(
      { artifact_type: 'bug', project_id: 'p1', common: { title: 'B', status: 'New', assigned_to: 'bad.user' }, fields: {} },
      baseConfig(102, 'bug'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 600)).toBeUndefined();
    expect(values.find(v => v.field_id === 601)).toBeDefined();
  });

  it('throws for invalid REQUIRED bind value in bug', async () => {
    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'assigned_to') return { field_id: 600, name: 'assigned_to', type: 'sb', required: true };
      if (fn === 'status') return { field_id: 601, name: 'status', type: 'sb', required: true };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn) => {
      if (fn === 'assigned_to') throw new Error("Bind value 'bad.user' not found");
      return { id: 900 };
    });

    await expect(
      emitBug(
        { artifact_type: 'bug', project_id: 'p1', common: { title: 'B', status: 'New', assigned_to: 'bad.user' }, fields: {} },
        baseConfig(102, 'bug'),
        'create',
        { client: defaultClient, registry: defaultRegistry }
      )
    ).rejects.toThrow(/Bind value/);
  });

  it('skips invalid optional bind for task', async () => {
    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'assigned_to') return { field_id: 700, name: 'assigned_to', type: 'sb', required: false };
      if (fn === 'status') return { field_id: 701, name: 'status', type: 'sb', required: true };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, label) => {
      if (fn === 'assigned_to' && label === 'bad.user') throw new Error("Bind value 'bad.user' not found");
      return { id: 900 };
    });

    await emitTask(
      { artifact_type: 'task', project_id: 'p1', common: { title: 'T', status: 'In Progress', assigned_to: 'bad.user' }, fields: {} },
      baseConfig(200, 'task'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 700)).toBeUndefined();
    expect(values.find(v => v.field_id === 701)).toBeDefined();
  });

  it('skips invalid optional bind for test_case', async () => {
    defaultRegistry.getField.mockImplementation(async (tid, fn) => {
      if (fn === 'assigned_to') return { field_id: 800, name: 'assigned_to', type: 'sb', required: false };
      if (fn === 'status') return { field_id: 801, name: 'status', type: 'sb', required: true };
      return { field_id: 999, name: fn, type: 'string' };
    });
    defaultRegistry.resolveBindValue.mockImplementation(async (tid, fn, label) => {
      if (fn === 'assigned_to' && label === 'bad.user') throw new Error("Bind value 'bad.user' not found");
      return { id: 900 };
    });

    await emitTestCase(
      { artifact_type: 'test_case', project_id: 'p1', common: { title: 'TC', status: 'Not Run', assigned_to: 'bad.user' }, fields: {} },
      baseConfig(300, 'test_case'),
      'create',
      { client: defaultClient, registry: defaultRegistry }
    );

    const values = defaultClient.post.mock.calls[0][1].values;
    expect(values.find(v => v.field_id === 800)).toBeUndefined();
    expect(values.find(v => v.field_id === 801)).toBeDefined();
  });
});
