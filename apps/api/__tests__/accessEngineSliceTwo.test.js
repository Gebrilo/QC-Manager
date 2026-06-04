'use strict';

// Slice 2 integration tests for issue #81 — verify the Tuleap and direct-create
// paths apply ArtifactVisibilityDefaulter on INSERT, materialize ACL grants,
// and never touch owner_team_id / visibility_scope on UPDATE.

jest.mock('../src/services/tuleapLinkResolver', () => ({
  resolveLinks: jest.fn(),
  drainPending: jest.fn(),
}));

const { resolveLinks } = require('../src/services/tuleapLinkResolver');
const bugPersister = require('../src/services/persisters/bug');
const taskPersister = require('../src/services/persisters/task');

function makeQueryStub(responses) {
  const calls = [];
  const fn = jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    const matcher = responses.find(r => !r.consumed && r.match(sql, params));
    if (!matcher) {
      throw new Error(`No mocked response for query: ${sql.slice(0, 120)}`);
    }
    matcher.consumed = true;
    return typeof matcher.response === 'function' ? matcher.response(sql, params) : matcher.response;
  });
  fn._calls = calls;
  return fn;
}

describe('Access Engine Slice 2 wiring (issue #81)', () => {
  beforeEach(() => {
    resolveLinks.mockReset();
  });

  test('Tuleap bug webhook → owner_team_id = QC team id, visibility_scope = team, ACL row for pm', async () => {
    const tuleapConfig = {
      id: 'cfg-1',
      tracker_type: 'bug',
      qc_project_id: 'proj-1',
      tuleap_project_id: 42,
      tuleap_tracker_id: 102,
      default_owner_team_id: 'team-qc-uuid',
      default_visibility_scope: 'team',
      value_maps: {},
    };

    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Tuleap bug', description: 'desc', status: 'Open' },
      fields: { severity: 'Major impact' },
      tuleap: { artifact_id: 8888, url: 'https://tuleap.example.com/?aid=8888' },
      reported_by: 'alice.tuleap',
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });

    const responses = [
      // existing bug select
      { match: (sql) => /SELECT id, deleted_at FROM bugs WHERE tuleap_artifact_id/i.test(sql), response: { rows: [] } },
      // reporter resource lookup
      { match: (sql) => /FROM resources WHERE deleted_at IS NULL AND \(LOWER\(email\)/i.test(sql), response: { rows: [{ id: 'rsrc-1' }] } },
      // tuleap creator → resources.user_id
      { match: (sql) => /FROM resources\s+WHERE tuleap_username/i.test(sql), response: { rows: [{ user_id: 'user-alice' }] } },
      // lookupTuleapCreatorTeam — team-qc
      { match: (sql) => /FROM teams t\s+LEFT JOIN team_types/i.test(sql), response: { rows: [{ team_id: 'team-qc-uuid', team_type_id: 'tt-qc', team_type: 'qc' }] } },
      // loadDefaultRow — bug for qc
      { match: (sql) => /FROM default_artifact_visibility/i.test(sql), response: { rows: [{ default_scope: 'team', default_acl_grants: [{ role: 'pm', action: 'view' }] }] } },
      // INSERT INTO bugs
      { match: (sql) => /INSERT INTO bugs/i.test(sql), response: { rows: [{ id: 'new-bug-uuid', owner_team_id: 'team-qc-uuid', visibility_scope: 'team' }] } },
      // INSERT INTO artifact_access for pm view
      { match: (sql) => /INSERT INTO artifact_access/i.test(sql), response: { rows: [{ id: 'acl-1' }] } },
    ];

    const query = makeQueryStub(responses);

    const result = await bugPersister.dispatchAction(unified, tuleapConfig, { query });

    expect(result.action).toBe('created');
    expect(result.id).toBe('new-bug-uuid');

    const insertBugCall = query._calls.find(c => /INSERT INTO bugs/i.test(c.sql));
    expect(insertBugCall).toBeDefined();
    expect(insertBugCall.sql).toContain('owner_team_id');
    expect(insertBugCall.sql).toContain('visibility_scope');
    expect(insertBugCall.sql).toContain('created_by_user_id');
    // owner_team_id, visibility_scope, created_by_user_id are the last 3 params
    const p = insertBugCall.params;
    expect(p[p.length - 3]).toBe('team-qc-uuid');
    expect(p[p.length - 2]).toBe('team');
    expect(p[p.length - 1]).toBe('user-alice');

    const aclCall = query._calls.find(c => /INSERT INTO artifact_access/i.test(c.sql));
    expect(aclCall).toBeDefined();
    expect(aclCall.params[0]).toBe('bug');
    expect(aclCall.params[1]).toBe('new-bug-uuid');
    expect(aclCall.params[2]).toBe('pm');
    expect(aclCall.params[3]).toBe('view');
  });

  test('Tuleap bug update preserves owner_team_id and visibility_scope (sticky ownership)', async () => {
    const tuleapConfig = {
      id: 'cfg-1',
      tracker_type: 'bug',
      qc_project_id: 'proj-1',
      tuleap_project_id: 42,
      tuleap_tracker_id: 102,
      default_owner_team_id: 'team-qc-uuid',
      default_visibility_scope: 'team',
      value_maps: {},
    };

    const unified = {
      artifact_type: 'bug',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'Bug', status: 'In Progress', assigned_to: 'someone-else' },
      fields: { severity: 'Minor Impact' },
      tuleap: { artifact_id: 8888 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });

    const responses = [
      { match: (sql) => /SELECT id, deleted_at FROM bugs WHERE tuleap_artifact_id/i.test(sql), response: { rows: [{ id: 'existing-uuid', deleted_at: null }] } },
      { match: (sql) => /UPDATE bugs SET/i.test(sql), response: { rows: [{ id: 'existing-uuid', title: 'Bug', owner_team_id: 'team-qc-uuid', visibility_scope: 'team' }] } },
    ];

    const query = makeQueryStub(responses);

    const result = await bugPersister.dispatchAction(unified, tuleapConfig, { query });
    expect(result.action).toBe('updated');

    const updateCall = query._calls.find(c => /UPDATE bugs SET/i.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall.sql).not.toMatch(/owner_team_id\s*=/);
    expect(updateCall.sql).not.toMatch(/visibility_scope\s*=/);
    expect(updateCall.sql).not.toMatch(/created_by_user_id\s*=/);
  });

  test('Member POSTs a task → owner_team_id matches member team, visibility_scope matches default', async () => {
    // Direct-create flow is exercised via the buildAccessDefaults helper called
    // from the route. We exercise the helper directly with a member-like creator.
    const { buildAccessDefaults, materializeAclGrants } = require('../src/services/accessDefaults');

    const responses = [
      // lookupHumanCreatorTeam — member belongs to a QC team
      { match: (sql) => /FROM app_user u\s+LEFT JOIN teams/i.test(sql), response: { rows: [{ team_id: 'team-qc-uuid', team_type_id: 'tt-qc', team_type: 'qc' }] } },
      // loadDefaultRow — task for qc
      { match: (sql) => /FROM default_artifact_visibility/i.test(sql), response: { rows: [{ default_scope: 'team', default_acl_grants: [{ role: 'pm', action: 'view' }] }] } },
      // ACL insert
      { match: (sql) => /INSERT INTO artifact_access/i.test(sql), response: { rows: [{ id: 'acl-2' }] } },
    ];

    const query = makeQueryStub(responses);

    const defaults = await buildAccessDefaults({
      creator: { id: 'user-bob' },
      artifactType: 'task',
      query,
    });

    expect(defaults.owner_team_id).toBe('team-qc-uuid');
    expect(defaults.visibility_scope).toBe('team');
    expect(defaults.default_acl_grants).toEqual([{ role: 'pm', action: 'view' }]);

    const inserted = await materializeAclGrants({
      artifactType: 'task',
      artifactId: 'new-task-uuid',
      grants: defaults.default_acl_grants,
      grantedBy: 'user-bob',
      query,
    });
    expect(inserted).toBe(1);

    const aclCall = query._calls.find(c => /INSERT INTO artifact_access/i.test(c.sql));
    expect(aclCall.params[0]).toBe('task');
    expect(aclCall.params[1]).toBe('new-task-uuid');
    expect(aclCall.params[2]).toBe('pm');
    expect(aclCall.params[3]).toBe('view');
  });

  test('Tuleap task INSERT passes owner_team_id and visibility_scope from config', async () => {
    const tuleapConfig = {
      id: 'cfg-task',
      tracker_type: 'task',
      qc_project_id: 'proj-1',
      tuleap_project_id: 42,
      tuleap_tracker_id: 5,
      default_owner_team_id: 'team-dev-uuid',
      default_visibility_scope: 'team',
      value_maps: {},
    };

    const unified = {
      artifact_type: 'task',
      action: 'sync',
      project_id: 'proj-1',
      common: { title: 'New task', description: '', status: 'In Progress', assigned_to: 'bob' },
      fields: { team: 'Dev', parent_story_id: null },
      tuleap: { artifact_id: 9001, tracker_id: 5 },
    };

    resolveLinks.mockResolvedValueOnce({ resolved: [], pending: [] });

    const responses = [
      // select live tasks
      { match: (sql) => /SELECT \* FROM tasks WHERE tuleap_artifact_id = \$1 AND deleted_at IS NULL/i.test(sql), response: { rows: [] } },
      // resolveResourceByName
      { match: (sql) => /FROM resources WHERE deleted_at IS NULL AND \(LOWER\(resource_name\)/i.test(sql), response: { rows: [] } },
      // select deleted tasks (revival check)
      { match: (sql) => /SELECT \* FROM tasks WHERE tuleap_artifact_id = \$1 AND deleted_at IS NOT NULL/i.test(sql), response: { rows: [] } },
      // resolveResourceByName again for second branch
      { match: (sql) => /FROM resources WHERE deleted_at IS NULL AND \(LOWER\(resource_name\)/i.test(sql), response: { rows: [] } },
      // generateTaskId
      { match: (sql) => /FROM tasks WHERE task_id LIKE/i.test(sql), response: { rows: [{ task_id: 'TSK-007' }] } },
      // lookupTuleapCreatorTeam
      { match: (sql) => /FROM teams t\s+LEFT JOIN team_types/i.test(sql), response: { rows: [{ team_id: 'team-dev-uuid', team_type_id: 'tt-dev', team_type: 'dev' }] } },
      // loadDefaultRow for dev/task
      { match: (sql) => /FROM default_artifact_visibility/i.test(sql), response: { rows: [{ default_scope: 'team', default_acl_grants: [{ role: 'pm', action: 'view' }] }] } },
      // INSERT INTO tasks
      { match: (sql) => /INSERT INTO tasks/i.test(sql), response: { rows: [{ id: 'new-task', task_id: 'TSK-007' }] } },
      // INSERT INTO artifact_access
      { match: (sql) => /INSERT INTO artifact_access/i.test(sql), response: { rows: [{ id: 'acl-task' }] } },
    ];

    const query = makeQueryStub(responses);

    const result = await taskPersister.dispatchAction(unified, tuleapConfig, { query });

    expect(result.action).toBe('created');

    const insertCall = query._calls.find(c => /INSERT INTO tasks/i.test(c.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toContain('owner_team_id');
    expect(insertCall.sql).toContain('visibility_scope');
    expect(insertCall.sql).toContain('created_by_user_id');
    const p = insertCall.params;
    expect(p[p.length - 3]).toBe('team-dev-uuid');
    expect(p[p.length - 2]).toBe('team');

    const aclCall = query._calls.find(c => /INSERT INTO artifact_access/i.test(c.sql));
    expect(aclCall.params[0]).toBe('task');
  });
});
