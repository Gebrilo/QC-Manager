'use strict';

const queries = [];
let queryHandler = async () => ({ rows: [] });

const mockQuery = jest.fn(async (sql, params) => {
    queries.push({ sql: String(sql), params });
    return queryHandler(String(sql), params);
});

jest.mock('../src/config/db', () => ({
    query: (...args) => mockQuery(...args),
    pool: { query: (...args) => mockQuery(...args) },
}));

const mockCurrentUser = { value: null };
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = mockCurrentUser.value; next(); },
    blockContributors: (_req, _res, next) => next(),
    requirePermission: () => (_req, _res, next) => next(),
    requireAnyPermission: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/resolveArtifactParam', () => ({
    resolveArtifactParam: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (role) => role,
}));

jest.mock('../src/services/emitters/bug', () => ({
    emitToTuleap: jest.fn(),
}));

const roleResolver = require('../src/access/RoleResolver');
const { emitToTuleap } = require('../src/services/emitters/bug');
const express = require('express');
const request = require('supertest');
const router = require('../src/routes/bugs');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/bugs', router);
    return app;
}

function bug(overrides = {}) {
    return {
        id: 'bug-1',
        bug_id: 'BUG-1',
        title: 'Bug',
        description: '',
        status: 'New',
        severity: 'None',
        priority: 'Medium',
        project_id: 'project-1',
        owner_team_id: 'team-qc',
        visibility_scope: 'team',
        tuleap_artifact_id: 123,
        ...overrides,
    };
}

beforeEach(() => {
    queries.length = 0;
    jest.clearAllMocks();
    mockCurrentUser.value = { id: 'tester-1', email: 'tester@example.com', role: 'tester' };
    roleResolver.resolve.mockResolvedValue({
        effectivePermissions: new Set(['qc.bugs.change_severity']),
        scope: { team_id: 'team-qc', team_type: 'qc', pm_of_projects: [] },
    });
    emitToTuleap.mockResolvedValue({
        tuleap_artifact_id: 123,
        tuleap_url: 'https://tuleap.example.test/plugins/tracker/?aid=123',
    });
});

test('PATCH /bugs/:id/severity lets tester change severity on a team bug and emits to Tuleap', async () => {
    const original = bug();
    const updated = bug({ severity: 'Major impact', sync_status: 'pending' });
    const synced = bug({
        severity: 'Major impact',
        sync_status: 'synced',
        tuleap_url: 'https://tuleap.example.test/plugins/tracker/?aid=123',
    });
    queryHandler = async (sql) => {
        if (/SELECT \* FROM bugs WHERE id = \$1 AND deleted_at IS NULL/.test(sql)) return { rows: [original] };
        if (/UPDATE bugs SET\s+severity = \$1/.test(sql)) return { rows: [updated] };
        if (/SELECT \* FROM tuleap_sync_config/.test(sql)) {
            return { rows: [{ id: 'cfg-1', qc_project_id: 'project-1', tuleap_tracker_id: 99, value_maps: {} }] };
        }
        if (/UPDATE bugs SET\s+sync_status = 'synced'/.test(sql)) return { rows: [synced] };
        return { rows: [], rowCount: 0 };
    };

    const res = await request(makeApp())
        .patch('/bugs/bug-1/severity')
        .send({ severity: 'Major impact' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'bug-1', severity: 'Major impact', sync_status: 'synced' });
    expect(emitToTuleap).toHaveBeenCalledWith(
        expect.objectContaining({
            artifact_type: 'bug',
            fields: expect.objectContaining({ severity: 'Major impact' }),
            tuleap: { artifact_id: 123 },
        }),
        expect.objectContaining({ tuleap_tracker_id: 99 }),
        'update',
        expect.any(Object)
    );
});

test('PATCH /bugs/:id/severity rejects bugs outside the tester team', async () => {
    queryHandler = async (sql) => {
        if (/SELECT \* FROM bugs WHERE id = \$1 AND deleted_at IS NULL/.test(sql)) {
            return { rows: [bug({ owner_team_id: 'team-other' })] };
        }
        return { rows: [], rowCount: 0 };
    };

    const res = await request(makeApp())
        .patch('/bugs/bug-1/severity')
        .send({ severity: 'Critical Impact' });

    expect(res.status).toBe(403);
    expect(queries.some(call => /UPDATE bugs SET\s+severity = \$1/.test(call.sql))).toBe(false);
    expect(emitToTuleap).not.toHaveBeenCalled();
});
