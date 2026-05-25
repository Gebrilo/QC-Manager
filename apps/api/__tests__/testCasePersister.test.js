const { dispatchAction } = require('../src/services/persisters/test_case');
const { resolveLinks, drainPending } = require('../src/services/tuleapLinkResolver');

jest.mock('../src/services/tuleapLinkResolver', () => ({
  resolveLinks: jest.fn(),
  drainPending: jest.fn(),
}));

describe('test_case persister — dispatchAction', () => {
  let query;

  beforeEach(() => {
    query = jest.fn();
    resolveLinks.mockReset();
    drainPending.mockReset();
  });

  const config = {
    id: 'cfg-1',
    tracker_type: 'test_case',
    qc_project_id: 'proj-1',
    tuleap_project_id: 42,
    tuleap_tracker_id: 7,
    value_maps: {},
  };

  it('creates a new test case from a unified payload', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Login test', description: 'Verify login', status: 'active', priority: 'high' },
      fields: {},
      tuleap: { project_id: 42, tracker_id: 7, artifact_id: 6001, url: 'https://tuleap.example.com/?aid=6001' },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ next_id: 'TC-001' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-tc-uuid', test_case_id: 'TC-001', title: 'Login test', sync_status: 'synced' }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('created');
    expect(result.id).toBe('new-tc-uuid');
    expect(result.data.sync_status).toBe('synced');
    const insertCall = query.mock.calls.find(c => /INSERT INTO test_case/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('sync_status');
    expect(insertCall[0]).toContain('last_sync_error');
  });

  it('updates an existing test case by tuleap_artifact_id', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Updated test', status: 'deprecated' },
      fields: {},
      tuleap: { artifact_id: 6001 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 6001, deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', title: 'Updated test' }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('updated');
    expect(result.id).toBe('existing-uuid');
  });

  it('soft-deletes a test case on delete action', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'delete',
      project_id: 'proj-1',
      tuleap: { artifact_id: 6001 },
    };

    query.mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 6001 }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('deleted');
    const deleteCall = query.mock.calls.find(c => /deleted_at\s*=\s*NOW/i.test(c[0]) && /UPDATE test_case/i.test(c[0]));
    expect(deleteCall).toBeDefined();
  });

  it('rejects reject action on test_case with 400 error', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'reject',
      project_id: 'proj-1',
      tuleap: { artifact_id: 6001 },
    };

    await expect(dispatchAction(unified, config, { query })).rejects.toThrow(/not supported.*test_case/i);
    try {
      await dispatchAction(unified, config, { query });
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });

  it('rejects archive action on test_case with 400 error', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'archive',
      project_id: 'proj-1',
      tuleap: { artifact_id: 6001 },
    };

    await expect(dispatchAction(unified, config, { query })).rejects.toThrow(/not supported.*test_case/i);
    try {
      await dispatchAction(unified, config, { query });
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });

  it('revives a soft-deleted test case on re-ingest', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Revived test', status: 'active' },
      fields: {},
      tuleap: { artifact_id: 6050 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', tuleap_artifact_id: 6050, deleted_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', title: 'Revived test' }] });

    const result = await dispatchAction(unified, config, { query });
    expect(result.action).toBe('revived');
    const updateCall = query.mock.calls.find(c => /UPDATE test_case SET/i.test(c[0]) && /deleted_at\s*=\s*NULL/i.test(c[0]));
    expect(updateCall).toBeDefined();
  });

  it('queues pending links into pending_links column on create', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Test with link', status: 'active' },
      fields: {},
      tuleap: { artifact_id: 6060 },
    };

    resolveLinks.mockResolvedValueOnce({
      resolved: [],
      pending: [{ type: 'bug', tuleap_id: 888 }],
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ next_id: 'TC-001' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-tc', tuleap_artifact_id: 6060 }] });

    await dispatchAction(unified, config, { query });
    const insertCall = query.mock.calls.find(c => /INSERT INTO test_case/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('pending_links');
  });

  it('throws 400 when tuleap.artifact_id is missing', async () => {
    const unified = {
      artifact_type: 'test_case',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'No id', status: 'active' },
      fields: {},
    };

    await expect(dispatchAction(unified, config, { query })).rejects.toThrow(/artifact_id/i);
    try {
      await dispatchAction(unified, config, { query });
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });
});
