const { dispatchAction } = require('../src/modules/integration/services/persisters/user_story');
const { resolveLinks, drainPending } = require('../src/modules/integration/services/tuleapLinkResolver');

jest.mock('../src/modules/integration/services/tuleapLinkResolver', () => ({
  resolveLinks: jest.fn(),
  drainPending: jest.fn(),
}));

describe('user_story persister — dispatchAction', () => {
  let query;

  beforeEach(() => {
    query = jest.fn();
    resolveLinks.mockReset();
    drainPending.mockReset();
  });

  const config = {
    id: 'cfg-1',
    tracker_type: 'user_story',
    qc_project_id: 'proj-1',
    tuleap_project_id: 42,
    tuleap_tracker_id: 6,
    value_maps: {},
  };

  it('creates a new user story from a unified payload', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'sync',
      project_id: 'proj-1',
      common: {
        title: 'New story',
        description: 'Story description',
        status: 'Draft',
      },
      fields: {
        acceptance_criteria: 'Given/when/then',
        requirement_version: '1',
        ba_author: 'Alice',
      },
      tuleap: {
        project_id: 42,
        tracker_id: 6,
        artifact_id: 5001,
        url: 'https://tuleap.example.com/?aid=5001',
      },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] }) // SELECT live (none)
      .mockResolvedValueOnce({ rows: [] }) // SELECT deleted (none)
      .mockResolvedValueOnce({ rows: [{ id: 'new-us-uuid', tuleap_artifact_id: 5001, title: 'New story' }] }); // INSERT

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('created');
    expect(result.id).toBe('new-us-uuid');
    const insertCall = query.mock.calls.find(c => /INSERT INTO user_stories/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('tuleap_artifact_id');
  });

  it('updates an existing user story by tuleap_artifact_id', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Updated story', status: 'Approved' },
      fields: { requirement_version: '2' },
      tuleap: { artifact_id: 5001 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 5001, deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', title: 'Updated story' }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('updated');
    expect(result.id).toBe('existing-uuid');
    const updateCall = query.mock.calls.find(c => /UPDATE user_stories SET/i.test(c[0]));
    expect(updateCall).toBeDefined();
  });

  it('soft-deletes a user story on delete action', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'delete',
      project_id: 'proj-1',
      tuleap: { artifact_id: 5001 },
    };

    query.mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 5001 }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('deleted');
    const deleteCall = query.mock.calls.find(c => /deleted_at\s*=\s*NOW/i.test(c[0]) && /UPDATE user_stories/i.test(c[0]));
    expect(deleteCall).toBeDefined();
  });

  it('rejects reject action on user_story with 400 error', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'reject',
      project_id: 'proj-1',
      tuleap: { artifact_id: 5001 },
    };

    await expect(dispatchAction(unified, config, { query })).rejects.toThrow(/not supported.*user_story/i);
    try {
      await dispatchAction(unified, config, { query });
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });

  it('rejects archive action on user_story with 400 error', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'archive',
      project_id: 'proj-1',
      tuleap: { artifact_id: 5001 },
    };

    await expect(dispatchAction(unified, config, { query })).rejects.toThrow(/not supported.*user_story/i);
    try {
      await dispatchAction(unified, config, { query });
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });

  it('revives a soft-deleted user story on re-ingest (clears deleted_at)', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Revived story', status: 'Draft' },
      fields: {},
      tuleap: { artifact_id: 5050 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] }) // SELECT live (none)
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', tuleap_artifact_id: 5050, deleted_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', title: 'Revived story' }] });

    const result = await dispatchAction(unified, config, { query });
    expect(result.action).toBe('revived');
    const updateCall = query.mock.calls.find(c => /UPDATE user_stories SET/i.test(c[0]) && /deleted_at\s*=\s*NULL/i.test(c[0]));
    expect(updateCall).toBeDefined();
  });

  it('queues pending links into pending_links column on create', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Story with pending link', status: 'Draft' },
      fields: {},
      tuleap: { artifact_id: 5060 },
    };

    resolveLinks.mockResolvedValueOnce({
      resolved: [],
      pending: [{ type: 'task', tuleap_id: 999 }],
    });
    query
      .mockResolvedValueOnce({ rows: [] }) // SELECT live (none)
      .mockResolvedValueOnce({ rows: [] }) // SELECT deleted (none)
      .mockResolvedValueOnce({ rows: [{ id: 'new-us', tuleap_artifact_id: 5060 }] }); // INSERT

    await dispatchAction(unified, config, { query });
    const insertCall = query.mock.calls.find(c => /INSERT INTO user_stories/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('pending_links');
  });

  it('drains pending links after a successful create', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Story', status: 'Draft', links: [{ type: 'task', target_artifact_id: 9000 }] },
      fields: {},
      tuleap: { artifact_id: 5070 },
    };

    resolveLinks.mockResolvedValueOnce({
      resolved: [{ type: 'task', qc_id: 'task-uuid', tuleap_id: 9000 }],
      pending: [],
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-us', tuleap_artifact_id: 5070 }] });

    await dispatchAction(unified, config, { query });
    expect(drainPending).toHaveBeenCalledTimes(1);
    const drainArgs = drainPending.mock.calls[0][0];
    expect(drainArgs.justPersistedQcType).toBe('user_story');
    expect(drainArgs.justPersistedTuleapId).toBe(5070);
  });

  it('throws 400 when tuleap.artifact_id is missing', async () => {
    const unified = {
      artifact_type: 'user_story',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'No id', status: 'Draft' },
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
