'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { defaultsFor } = require('../src/access/ArtifactVisibilityDefaulter');

afterEach(() => jest.clearAllMocks());

describe('ArtifactVisibilityDefaulter.defaultsFor', () => {
    test('human creator: looks up team_type then default_artifact_visibility', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: 'team-qc', team_type_id: 'tt-qc', team_type: 'qc' }] })
            .mockResolvedValueOnce({ rows: [{ default_scope: 'team', default_acl_grants: [{ role: 'pm', action: 'view' }] }] });

        const out = await defaultsFor({ creator: { id: 'u1' }, artifactType: 'bug' });
        expect(out.owner_team_id).toBe('team-qc');
        expect(out.visibility_scope).toBe('team');
        expect(out.default_acl_grants).toEqual([{ role: 'pm', action: 'view' }]);
    });

    test('fallback when no default_artifact_visibility row: scope=team, no acl', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: 'team-x', team_type_id: 'tt-other', team_type: 'other' }] })
            .mockResolvedValueOnce({ rows: [] });

        const out = await defaultsFor({ creator: { id: 'u2' }, artifactType: 'task' });
        expect(out.visibility_scope).toBe('team');
        expect(out.default_acl_grants).toEqual([]);
    });

    test('tuleap-creator path uses tuleapDefaults instead of joining app_user', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: 'team-qc', team_type_id: 'tt-qc', team_type: 'qc' }] })
            .mockResolvedValueOnce({ rows: [{ default_scope: 'team', default_acl_grants: [] }] });

        const out = await defaultsFor({
            tuleapDefaults: { default_owner_team_id: 'team-qc', default_visibility_scope: null },
            artifactType: 'bug',
        });
        expect(out.owner_team_id).toBe('team-qc');
        expect(out.visibility_scope).toBe('team');
    });

    test('tuleap-creator with default_visibility_scope override still loads team-type ACL grants', async () => {
        // The tracker config overrides visibility_scope, but role-based ACL
        // grants (e.g. pm view) still come from the team-type defaults so they
        // remain consistent across artifacts of the same team type.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: 'team-qc', team_type_id: 'tt-qc', team_type: 'qc' }] })
            .mockResolvedValueOnce({ rows: [{ default_scope: 'team', default_acl_grants: [{ role: 'pm', action: 'view' }] }] });

        const out = await defaultsFor({
            tuleapDefaults: { default_owner_team_id: 'team-qc', default_visibility_scope: 'project' },
            artifactType: 'bug',
        });
        expect(out.visibility_scope).toBe('project');
        expect(out.default_acl_grants).toEqual([{ role: 'pm', action: 'view' }]);
    });

    test('human creator with no team: scope defaults to team, owner_team_id null', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ team_id: null, team_type_id: null, team_type: null }] })
            .mockResolvedValueOnce({ rows: [] });

        const out = await defaultsFor({ creator: { id: 'u3' }, artifactType: 'task' });
        expect(out.owner_team_id).toBeNull();
        expect(out.visibility_scope).toBe('team');
        expect(out.default_acl_grants).toEqual([]);
    });

    test('tuleap-creator with no team id: returns owner_team_id null, scope=team fallback', async () => {
        // No team to look up; loadTuleapCreatorTeam should not issue any query
        const out = await defaultsFor({
            tuleapDefaults: { default_owner_team_id: null, default_visibility_scope: null },
            artifactType: 'task',
        });
        expect(out.owner_team_id).toBeNull();
        expect(out.visibility_scope).toBe('team');
        expect(mockQuery).toHaveBeenCalledTimes(0);
    });
});
