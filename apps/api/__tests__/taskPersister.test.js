const { dispatchAction, generateTaskId } = require('../src/services/persisters/task');
const { resolveLinks, drainPending } = require('../src/services/tuleapLinkResolver');

jest.mock('../src/services/tuleapLinkResolver', () => ({
  resolveLinks: jest.fn(),
  drainPending: jest.fn(),
}));

describe('task persister — dispatchAction', () => {
  let query;

  beforeEach(() => {
    query = jest.fn();
    resolveLinks.mockReset();
    drainPending.mockReset();
  });

  const config = {
    id: 'cfg-1',
    tracker_type: 'task',
    qc_project_id: 'proj-1',
    tuleap_project_id: 42,
    tuleap_tracker_id: 5,
    value_maps: {},
  };

  it('creates a new task from a unified payload', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Implement login', description: 'Do the thing', status: 'In Progress', assigned_to: 'bob' },
      fields: { team: 'Alpha', parent_story_id: null },
      tuleap: { artifact_id: 12345, tracker_id: 5, url: 'https://tuleap.example.com/?aid=12345' },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] })                                    // SELECT live tasks (none)
      .mockResolvedValueOnce({ rows: [] })                                    // SELECT deleted (none)
      .mockResolvedValueOnce({ rows: [{ task_id: 'TSK-042' }] })             // generateTaskId
      .mockResolvedValueOnce({ rows: [] })                                    // resolveResourceByName (no match)
      .mockResolvedValueOnce({ rows: [{ id: 'new-task-uuid', task_id: 'TSK-042', task_name: 'Implement login', sync_status: 'synced' }] }); // INSERT

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('created');
    expect(result.id).toBe('new-task-uuid');
    expect(result.data.sync_status).toBe('synced');
    const insertCall = query.mock.calls.find(c => /INSERT INTO tasks/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain('tuleap_artifact_id');
    expect(insertCall[0]).toContain('sync_status');
    expect(insertCall[0]).toContain('last_sync_error');
  });

  it('updates an existing task by tuleap_artifact_id', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Updated task', status: 'Done' },
      fields: {},
      tuleap: { artifact_id: 12345 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', tuleap_artifact_id: 12345, deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-uuid', task_name: 'Updated task' }] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('updated');
    expect(result.id).toBe('existing-uuid');
  });

  it('reassignment Y→W installs W as PRIMARY via the junction and preserves Y when it logged effort (#199)', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Reassigned task', status: 'In Progress', assigned_to: 'walter' },
      fields: {},
      tuleap: { artifact_id: 777 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [{ id: 'task-uuid', tuleap_artifact_id: 777, resource1_id: 'rY', deleted_at: null }] }) // SELECT live
      .mockResolvedValueOnce({ rows: [{ id: 'rW' }] })                                       // resolveResourceByName('walter')
      .mockResolvedValueOnce({ rows: [{ id: 'task-uuid', task_name: 'Reassigned task' }] })  // UPDATE tasks
      .mockResolvedValueOnce({ rows: [{ id: 'pY', resource_id: 'rY', assignment_type: 'PRIMARY', actual_hrs: 4 }] }) // applyTuleapPrimary SELECT
      .mockResolvedValueOnce({ rows: [] })   // demote Y → SECONDARY
      .mockResolvedValueOnce({ rows: [] });  // INSERT W as PRIMARY

    const result = await dispatchAction(unified, config, { query });
    expect(result.action).toBe('updated');

    // W is installed as PRIMARY through the junction (not just resource1_id)
    expect(query.mock.calls.some(c => /INSERT INTO task_resource_assignment/.test(c[0]) && (c[1] || [])[1] === 'rW')).toBe(true);
    // Y had effort → demoted to SECONDARY, never deleted; its hours stay on Y, not W
    expect(query.mock.calls.some(c => /SET assignment_type = 'SECONDARY'/.test(c[0]) && (c[1] || [])[0] === 'pY')).toBe(true);
    expect(query.mock.calls.some(c => /DELETE FROM task_resource_assignment/.test(c[0]))).toBe(false);
  });

  it('soft-deletes a task on delete action', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'delete',
      project_id: 'proj-1',
      tuleap: { artifact_id: 12345, url: 'https://tuleap.example.com' },
      common: {},
    };

    query
      .mockResolvedValueOnce({ rows: [{ id: 'task-uuid', tuleap_artifact_id: 12345, task_name: 'Old task', notes: '', status: 'Backlog', resource1_id: null, project_id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('deleted');
    const historyCall = query.mock.calls.find(c => /INSERT INTO tuleap_task_history/i.test(c[0]));
    expect(historyCall).toBeDefined();
  });

  it('archives a task on archive action (reassigned out)', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'archive',
      project_id: 'proj-1',
      common: {},
      fields: { new_assignee_name: 'Unknown User' },
      tuleap: { artifact_id: 12345, url: 'https://tuleap.example.com' },
    };

    query
      .mockResolvedValueOnce({ rows: [{ id: 'task-uuid', tuleap_artifact_id: 12345, task_name: 'Task', notes: '', status: 'In Progress', resource1_id: null, project_id: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [{ resource_name: 'Alice' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('archived');
    const historyCall = query.mock.calls.find(c => /INSERT INTO tuleap_task_history/i.test(c[0]));
    expect(historyCall).toBeDefined();
    expect(historyCall[1][10]).toBe('reassigned_out');
  });

  it('rejects a new task with unknown assignee on reject action', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'reject',
      project_id: 'proj-1',
      common: { title: 'New task' },
      fields: { new_assignee_name: 'Unknown Person', action_reason: 'No matching resource' },
      tuleap: { artifact_id: 99999, url: 'https://tuleap.example.com/?aid=99999' },
    };

    query.mockResolvedValueOnce({ rows: [] });

    const result = await dispatchAction(unified, config, { query });

    expect(result.action).toBe('rejected');
    const historyCall = query.mock.calls.find(c => /INSERT INTO tuleap_task_history/i.test(c[0]));
    expect(historyCall).toBeDefined();
    expect(historyCall[1][6]).toBe('rejected_new');
    expect(historyCall[1][5]).toBe('Unknown Person');
  });

  

  it('revives a soft-deleted task on re-ingest', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Revived task', status: 'Backlog' },
      fields: {},
      tuleap: { artifact_id: 444 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });
    query
      .mockResolvedValueOnce({ rows: [] })                    // SELECT live tasks (none)
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', tuleap_artifact_id: 444, deleted_at: '2026-01-01' }] }) // SELECT deleted
      .mockResolvedValueOnce({ rows: [{ id: 'deleted-uuid', task_name: 'Revived task' }] }); // UPDATE

    const result = await dispatchAction(unified, config, { query });
    expect(result.action).toBe('revived');

    const updateCall = query.mock.calls.find(c => /UPDATE tasks SET/i.test(c[0]));
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toContain('deleted_at');
  });

  it('resolves parent_story links via tuleapLinkResolver', async () => {
    const unified = {
      artifact_type: 'task',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Task with parent', status: 'In Progress', links: [{ type: 'user_story', target_artifact_id: 5001 }] },
      fields: {},
      tuleap: { artifact_id: 555 },
    };

    resolveLinks.mockResolvedValueOnce({
      resolved: [{ type: 'user_story', qc_id: 'us-uuid-1', tuleap_id: 5001 }],
      pending: [],
    });
    query
      .mockResolvedValueOnce({ rows: [] })                                    // SELECT live tasks (none)
      .mockResolvedValueOnce({ rows: [] })                                    // SELECT deleted (none)
      .mockResolvedValueOnce({ rows: [{ task_id: 'TSK-042' }] })             // generateTaskId
      .mockResolvedValueOnce({ rows: [{ id: 'new-task', task_name: 'Task with parent', parent_story_id: 'us-uuid-1' }] }); // INSERT

    const result = await dispatchAction(unified, config, { query });
    expect(result.action).toBe('created');

    const insertCall = query.mock.calls.find(c => /INSERT INTO tasks/i.test(c[0]));
    expect(insertCall).toBeDefined();
  });
});

describe('task persister — generateTaskId', () => {
  it('skips non-numeric task IDs when generating the next ID', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ task_id: 'TSK-408' }] });

    await expect(generateTaskId(query)).resolves.toBe('TSK-409');

    expect(query.mock.calls[0][0]).toContain("task_id ~ '^TSK-[0-9]+$'");
    expect(query.mock.calls[0][0]).toContain('(substring(task_id from 5))::int DESC');
  });

  it('fails explicitly if the numeric lookup returns an invalid task ID', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ task_id: 'TSK-NaN' }] });

    await expect(generateTaskId(query)).rejects.toThrow('Failed to parse last task_id: TSK-NaN');
  });
});
