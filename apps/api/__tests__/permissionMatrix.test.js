'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/access/RoleResolver', () => ({
  resolve: jest.fn(),
  canonicalRole: (role) => role === 'manager' ? 'team_manager' : role,
}));

const { resolve: mockResolve } = require('../src/access/RoleResolver');
const { canPerform } = require('../src/access/AccessEngine');

const NS = {
  user_story: 'user_stories',
  test_execution: 'testexecutions',
  test_suite: 'testsuites',
};

const ACTIONS = ['view', 'edit', 'delete', 'assign', 'comment'];
const ARTIFACTS = ['user_story', 'test_execution', 'test_suite'];

function permissions(artifactType, scope, actions) {
  return new Set(actions.map(action => `qc.${NS[artifactType]}.${action}_${scope}`));
}

function artifactFor(role, artifactType) {
  const base = {
    type: artifactType,
    id: `${artifactType}-1`,
    project_id: role === 'pm' ? 'p-pm' : 'p-other',
    owner_team_id: role === 'team_manager' || role === 'viewer' ? 't-role' : 't-other',
    owner_user_id: role === 'member' ? 'u-member' : 'u-other',
    visibility_scope: 'team',
  };
  return base;
}

function roleFixture(role, artifactType) {
  if (role === 'admin') {
    return {
      user: { id: 'u-admin', role },
      resolved: { effectivePermissions: new Set(['*']), scope: { team_id: null, team_type: null, pm_of_projects: [] } },
      allowed: ACTIONS,
    };
  }
  if (role === 'pm') {
    return {
      user: { id: 'u-pm', role },
      resolved: { effectivePermissions: permissions(artifactType, 'any', ACTIONS), scope: { team_id: null, team_type: 'pm', pm_of_projects: ['p-pm'] } },
      allowed: ACTIONS,
    };
  }
  if (role === 'team_manager') {
    return {
      user: { id: 'u-team', role },
      resolved: { effectivePermissions: permissions(artifactType, 'team', ACTIONS), scope: { team_id: 't-role', team_type: 'qc', pm_of_projects: [] } },
      allowed: ACTIONS,
    };
  }
  if (role === 'member') {
    return {
      user: { id: 'u-member', role },
      resolved: { effectivePermissions: permissions(artifactType, 'own', ACTIONS), scope: { team_id: 't-member', team_type: 'qc', pm_of_projects: [] } },
      allowed: ACTIONS,
    };
  }
  return {
    user: { id: 'u-viewer', role },
    resolved: { effectivePermissions: permissions(artifactType, 'team', ['view']), scope: { team_id: 't-role', team_type: 'qc', pm_of_projects: [] } },
    allowed: ['view'],
  };
}

describe('AccessEngine permission matrix — issue #82 artifacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  for (const role of ['admin', 'pm', 'team_manager', 'member', 'viewer']) {
    for (const artifactType of ARTIFACTS) {
      for (const action of ACTIONS) {
        test(`${role} / ${artifactType} / ${action}`, async () => {
          const fixture = roleFixture(role, artifactType);
          mockResolve.mockResolvedValueOnce(fixture.resolved);

          const out = await canPerform(
            fixture.user,
            artifactFor(role, artifactType),
            action
          );

          expect(out.allowed).toBe(fixture.allowed.includes(action));
        });
      }
    }
  }
});
