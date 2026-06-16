const { dispatchAction } = require('../src/services/persisters/bug');
const { resolveLinks, drainPending } = require('../src/services/tuleapLinkResolver');

jest.mock('../src/services/tuleapLinkResolver', () => ({
  resolveLinks: jest.fn(),
  drainPending: jest.fn(),
}));

describe('bug persister — dispatchAction', () => {
  let query;

  beforeEach(() => {
    query = jest.fn();
    resolveLinks.mockReset();
    drainPending.mockReset();
  });

  const config = {
    id: 'cfg-1',
    tracker_type: 'bug',
    qc_project_id: 'proj-1',
    tuleap_project_id: 42,
    tuleap_tracker_id: 102,
    value_maps: { status: { New: 'Open', Closed: 'Done' } },
  };

  it('creates a new bug from a unified payload', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: {
        title: 'Login crash',
        description: 'App crashes on login',
        status: 'Open',
        assigned_to: 'bob',
      },
      fields: {
        severity: 'critical',
        environment: 'PROD',
        service_name: 'auth-svc',
      },
      tuleap: {
        project_id: 42,
        tracker_id: 102,
        artifact_id: 67890,
        url: 'https://tuleap.example.com/?aid=67890',
      },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'new-bug-uuid',
          bug_id: 'TLP-67890',
          title: 'Login crash',
          sync_status: 'synced',
        }],
      });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('created');
    expect(result.id).toBe('new-bug-uuid');
    expect(result.data.sync_status).toBe('synced');
    expect(resolveLinks).toHaveBeenCalledTimes(1);

    const insertCall = query.mock.calls.find(c => /INSERT INTO bugs/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('sync_status');
    expect(insertCall[0]).toContain("last_sync_error");
    expect(insertCall[1]).toContain('TLP-67890');
  });

  it('updates an existing bug by tuleap_artifact_id', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Updated title', status: 'In Progress' },
      fields: { severity: 'high' },
      tuleap: { artifact_id: 67890 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 67890, deleted_at: null }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'existing-uuid', title: 'Updated title' }],
      });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('updated');
    expect(result.id).toBe('existing-uuid');

    const updateCall = query.mock.calls.find(c => /UPDATE bugs SET/i.test(c[0]));
    expect(updateCall).toBeDefined();
  });

  it.each(['failed', 'pending'])(
    'skips overwriting a row with an unsynced local edit (sync_status=%s)',
    async (syncStatus) => {
      const unified = {
        artifact_type: 'bug',
        action: 'sync',
        project_id: 'proj-1',
        common: { title: 'Tuleap stale title', status: 'In Progress' },
        fields: { severity: 'high' },
        tuleap: { artifact_id: 67890 },
      };

      resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
      query.mockResolvedValueOnce({
        rows: [{ id: 'existing-uuid', tuleap_artifact_id: 67890, deleted_at: null, sync_status: syncStatus }],
      });

      const result = await dispatchAction(unified, config, { query });

      expect(result.action).toBe('skipped_local_edit');
      expect(result.id).toBe('existing-uuid');
      const updateCall = query.mock.calls.find(c => /UPDATE bugs SET/i.test(c[0]));
      expect(updateCall).toBeUndefined();
    }
  );

  it('soft-deletes a bug on delete action', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'delete',
      project_id: 'proj-1',
      tuleap: { artifact_id: 67890 },
    };

    query.mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 67890 }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('deleted');
    const deleteCall = query.mock.calls.find(c => /deleted_at/i.test(c[0]));
    expect(deleteCall).toBeDefined();
  });

  it('rejects reject/archive actions on bug with error', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'reject',
      project_id: 'proj-1',
      tuleap: { artifact_id: 67890 },
    };

    await expect(dispatchAction(unified, config, { query })).rejects.toThrow(/not supported.*bug/i);
  });

  it('classifies source as TEST_CASE when linked test cases resolved', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Bug from test', status: 'Open' },
      fields: {},
      tuleap: { artifact_id: 111 },
    };

    resolveLinks.mockResolvedValueOnce({
      resolved: [{ type: 'test_case', qc_id: 'tc-uuid-1', tuleap_id: 140 }],
      pending: [],
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'rsrc-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-bug' }] });

    await dispatchAction(unified, config, { query });

    const insertCall = query.mock.calls.find(c => /INSERT INTO bugs/i.test(c[0]));
    expect(insertCall[1]).toContain('TEST_CASE');
  });

  it('classifies source as EXPLORATORY when no test case links', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Ad-hoc bug', status: 'Open' },
      fields: {},
      tuleap: { artifact_id: 222 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'rsrc-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-bug' }] });

    await dispatchAction(unified, config, { query });

    const insertCall = query.mock.calls.find(c => /INSERT INTO bugs/i.test(c[0]));
    expect(insertCall[1]).toContain('EXPLORATORY');
  });

  it('queues pending links into pending_links column on create', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Bug with pending link', status: 'Open' },
      fields: {},
      tuleap: { artifact_id: 333 },
    };

    resolveLinks.mockResolvedValueOnce({
      resolved: [],
      pending: [{ type: 'test_case', tuleap_id: 999 }],
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'rsrc-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-bug' }] });

    await dispatchAction(unified, config, { query });

    const insertCall = query.mock.calls.find(c => /INSERT INTO bugs/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('pending_links');
  });

  it('revives a soft-deleted bug on re-ingest (clears deleted_at)', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Revived bug', status: 'Open' },
      fields: {},
      tuleap: { artifact_id: 444 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', tuleap_artifact_id: 444, deleted_at: '2026-01-01' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'deleted-uuid', title: 'Revived bug' }],
      });

    const result = await dispatchAction(unified, config, { query });
    expect(result.action).toBe('revived');

    const updateCall = query.mock.calls.find(c => /UPDATE bugs SET/i.test(c[0]));
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toContain('deleted_at');
  });

  it('performs idempotent re-ingest when payload hash matches', async () => {
    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Same bug', status: 'Open' },
      fields: {},
      tuleap: { artifact_id: 555 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query.mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 555, deleted_at: null }] });

    const result = await dispatchAction(unified, config, { query, skipUpdate: true });
    expect(result.action).toBe('skipped');
  });
});
