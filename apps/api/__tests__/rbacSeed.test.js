'use strict';

/**
 * Issue #263 — RBAC bootstrap seed + collapse user_permissions to a sparse delta.
 *
 * The seed/collapse logic lives in access/rbacSeed.js and is invoked from the
 * db.js bootstrap (the only path guaranteed to run on deploy). These tests pin
 * its invariants directly with a mock client:
 *   - Idempotent seed: un-seeded roles get catalog defaults; re-running is a no-op.
 *   - Per-role seeded-marker: an emptied role is never re-seeded.
 *   - Collapse: only role-redundant granted=true rows are deleted; genuine
 *     elevations (granted=true, key NOT in role) and restrictions (granted=false)
 *     survive.
 */

const { seedRolePermissions, collapseUserPermissions, isRoleSeeded } = require('../src/access/rbacSeed');
const { BUILT_IN_ROLE_PERMISSION_DEFAULTS } = require('../../shared/rbac/catalog.ts');

function makeClient() {
    const queries = [];
    const client = {
        query: jest.fn((text, params) => {
            queries.push({ text, params });
            // Default: marker lookup returns "not seeded"; everything else no-rows.
            if (typeof text === 'string' && text.includes('rbac_seed_marker') && text.trim().toUpperCase().startsWith('SELECT')) {
                return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        }),
    };
    return { client, queries };
}

afterEach(() => jest.clearAllMocks());

describe('seedRolePermissions (issue #263)', () => {
    test('seeds every built-in role on a fresh database (no markers)', async () => {
        const { client, queries } = makeClient();
        const seeded = await seedRolePermissions(client);

        // Every built-in role is seeded exactly once.
        expect(new Set(seeded)).toEqual(new Set(Object.keys(BUILT_IN_ROLE_PERMISSION_DEFAULTS)));

        // admin is seeded the '*' wildcard.
        const adminInserts = queries.filter(q => q.params[0] === 'admin' && /INSERT INTO role_permissions/.test(q.text));
        expect(adminInserts.map(q => q.params[1])).toEqual(['*']);

        // Each seeded role gets a marker insert.
        const markerInserts = queries.filter(q => /INSERT INTO rbac_seed_marker/.test(q.text));
        expect(markerInserts.length).toBe(Object.keys(BUILT_IN_ROLE_PERMISSION_DEFAULTS).length);
    });

    test('admin seed replaces partial residue with the catalog wildcard', async () => {
        const { client, queries } = makeClient();
        await seedRolePermissions(client);
        // admin gets a DELETE of old role_permissions before seeding '*'.
        const adminDelete = queries.find(q => q.params[0] === 'admin' && /DELETE FROM role_permissions/.test(q.text));
        expect(adminDelete).toBeDefined();
    });

    test('is idempotent — re-running with markers present is a no-op', async () => {
        // Mark every role as already seeded.
        const client = {
            query: jest.fn(text => {
                if (typeof text === 'string' && text.includes('rbac_seed_marker') && text.trim().toUpperCase().startsWith('SELECT')) {
                    return Promise.resolve({ rows: [{ '?column?': 1 }] });
                }
                return Promise.resolve({ rows: [] });
            }),
        };
        const seeded = await seedRolePermissions(client);
        expect(seeded).toEqual([]);
        // No DELETE/INSERT into role_permissions, no marker writes.
        const writes = client.query.mock.calls.filter(([text]) =>
            /DELETE FROM role_permissions|INSERT INTO role_permissions|INSERT INTO rbac_seed_marker/.test(text)
        );
        expect(writes.length).toBe(0);
    });

    test('does NOT re-seed a role an admin has deliberately emptied', async () => {
        // 'tester' is marked seeded (so it should be skipped) even though its
        // role_permissions were emptied. Other un-seeded roles still get seeded.
        const client = {
            query: jest.fn((text, params) => {
                if (typeof text === 'string' && text.includes('rbac_seed_marker') && text.trim().toUpperCase().startsWith('SELECT')) {
                    // tester already seeded
                    if (params && params[0] === 'tester') return Promise.resolve({ rows: [{ '?column?': 1 }] });
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            }),
        };
        const seeded = await seedRolePermissions(client);
        expect(seeded).not.toContain('tester');
        expect(seeded).toContain('admin');
    });
});

describe('collapseUserPermissions (issue #263)', () => {
    test('deletes only role-redundant granted=true rows, per canonical role', async () => {
        const deleted = {};
        const client = {
            query: jest.fn(async (text, params) => {
                if (/DELETE FROM user_permissions/.test(text)) {
                    deleted[params[0]] = params[1]; // canonical -> storageNames
                    return { rows: [], rowCount: 3 };
                }
                return { rows: [], rowCount: 0 };
            }),
        };
        const collapsed = await collapseUserPermissions(client);

        expect(collapsed).toBe(3 * Object.keys(BUILT_IN_ROLE_PERMISSION_DEFAULTS).length);
        // The tester collapse must match legacy aliases too (safety net).
        expect(deleted['tester']).toEqual(['tester', 'user', 'member']);
        expect(deleted['team_manager']).toEqual(['team_manager', 'manager']);
    });

    test('the DELETE clause guards granted=true so tombstones survive', async () => {
        const seen = [];
        const client = {
            query: jest.fn(async (text) => {
                if (/DELETE FROM user_permissions/.test(text)) seen.push(text);
                return { rows: [], rowCount: 0 };
            }),
        };
        await collapseUserPermissions(client);
        // Every collapse statement must restrict to granted = true so that
        // per-user restrictions (granted=false) are preserved.
        for (const sql of seen) {
            expect(sql).toMatch(/up\.granted\s*=\s*true/);
        }
    });

    test('survives an empty database (rowCount 0, no throw)', async () => {
        const { client } = makeClient();
        await expect(collapseUserPermissions(client)).resolves.toBe(0);
    });
});

describe('isRoleSeeded', () => {
    test('returns true when the marker row exists', async () => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
        await expect(isRoleSeeded(client, 'tester')).resolves.toBe(true);
    });
    test('returns false when no marker row exists', async () => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        await expect(isRoleSeeded(client, 'tester')).resolves.toBe(false);
    });
});
