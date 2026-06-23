'use strict';

/**
 * Issue #268 — last-keyholder invariant + break-glass (ADR 0010 §6).
 *
 * Pins the behavior of access/lockoutGuard.js directly with a mock client
 * (no live DB) and the two integration points: rolePermissions.syncRolePermissions
 * (rejects dropping the last holder / admin '*' removal) and the per-user
 * override guard path.
 */

const { PERMISSIONS } = require('../../shared/rbac/catalog.ts');

function rows(value, rowCount = value.length) { return { rows: value, rowCount }; }

function makeClient() {
    const client = { query: jest.fn() };
    Object.defineProperty(client, 'calls', {
        get() {
            return client.query.mock.calls.map(([text, params]) => ({ text, params }));
        },
    });
    return client;
}

afterEach(() => jest.clearAllMocks());

describe('lockoutGuard.countActiveHoldersOfKey (issue #268)', () => {
    const KEY = PERMISSIONS.ADMIN_MANAGE_PERMISSIONS;

    test('returns 1 when admin has the "*" wildcard, regardless of key', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 1 }]));

        const count = await lockoutGuard.countActiveHoldersOfKey(client, KEY);
        expect(count).toBe(1);
    });

    test('returns 0 when admin wildcard is absent and no holders exist', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        const count = await lockoutGuard.countActiveHoldersOfKey(client, KEY);
        expect(count).toBe(0);
    });

    test('SQL unions admin wildcard, role_key_holders, and override_holders', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        await lockoutGuard.countActiveHoldersOfKey(client, KEY);
        const sql = client.calls[0].text;
        expect(sql).toMatch(/admin_wildcard_holders/);
        expect(sql).toMatch(/role_key_holders/);
        expect(sql).toMatch(/override_holders/);
        expect(sql).toMatch(/COUNT\(DISTINCT id\)/);
    });

    test('SQL guards user_permissions on granted = TRUE so tombstones are excluded', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        await lockoutGuard.countActiveHoldersOfKey(client, KEY);
        const sql = client.calls[0].text;
        expect(sql).toMatch(/up\.granted\s*=\s*TRUE/);
    });

    test('SQL filters users on active=true AND status not in suspended/archived', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        await lockoutGuard.countActiveHoldersOfKey(client, KEY);
        const sql = client.calls[0].text;
        expect(sql).toMatch(/u\.active\s*=\s*TRUE/);
        expect(sql).toMatch(/SUSPENDED/);
        expect(sql).toMatch(/ARCHIVED/);
    });

    test('SQL resolves legacy role aliases (manager→team_manager, user/member→tester)', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        await lockoutGuard.countActiveHoldersOfKey(client, KEY);
        const sql = client.calls[0].text;
        expect(sql).toMatch(/team_manager/);
        expect(sql).toMatch(/manager/);
        expect(sql).toMatch(/tester/);
        expect(sql).toMatch(/'user'/);
        expect(sql).toMatch(/'member'/);
    });
});

describe('lockoutGuard.wouldDropLastHolder / assertNotLastHolder (issue #268)', () => {
    const KEY = PERMISSIONS.ADMIN_MANAGE_ROLES;

    test('wouldDropLastHolder returns true when count <= 1', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 1 }]));

        await expect(lockoutGuard.wouldDropLastHolder(client, KEY, {})).resolves.toBe(true);
    });

    test('wouldDropLastHolder returns false when count >= 2', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 3 }]));

        await expect(lockoutGuard.wouldDropLastHolder(client, KEY, {})).resolves.toBe(false);
    });

    test('wouldDropLastHolder returns true when count is 0', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        await expect(lockoutGuard.wouldDropLastHolder(client, KEY, {})).resolves.toBe(true);
    });

    test('assertNotLastHolder throws with key name in the message when would drop', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 0 }]));

        await expect(lockoutGuard.assertNotLastHolder(client, KEY, {})).rejects.toThrow(KEY);
    });

    test('assertNotLastHolder resolves silently when a holder would remain', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ holder_count: 5 }]));

        await expect(lockoutGuard.assertNotLastHolder(client, KEY, {})).resolves.toBeUndefined();
    });

    test('wouldDropLastHolder with excludingUserId subtracts that user\'s contribution', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();

        const responses = [
            rows([{ holder_count: 1 }]),
            rows([{ contributes: 1 }]),
        ];
        client.query.mockImplementation(() => Promise.resolve(responses.shift()));

        const wouldDrop = await lockoutGuard.wouldDropLastHolder(client, KEY, { excludingUserId: 'user-1' });
        expect(wouldDrop).toBe(true);
    });
});

describe('rolePermissions.syncRolePermissions integration (issue #268)', () => {
    const KEY = PERMISSIONS.ADMIN_MANAGE_PERMISSIONS;

    test('rejects removing the admin role\'s "*" wildcard', async () => {
        const { syncRolePermissions } = require('../src/services/rolePermissions');
        const client = makeClient();

        client.query.mockImplementation((text) => {
            if (/FROM role_permissions\s+WHERE role_identifier\s+=\s+\$1/i.test(text)) {
                return Promise.resolve(rows([{ permission_key: '*' }]));
            }
            return Promise.resolve(rows([]));
        });

        await expect(
            syncRolePermissions(client, 'admin', ['qc.tasks.view'], 'admin@x.test')
        ).rejects.toThrow(/admin/i);

        const wrote = client.calls.some(c =>
            /INSERT INTO role_permissions/.test(c.text)
        );
        expect(wrote).toBe(false);
    });

    test('rejects removing manage_permissions when no other active holders remain', async () => {
        const { syncRolePermissions } = require('../src/services/rolePermissions');
        const client = makeClient();

        client.query.mockImplementation((text) => {
            if (/FROM role_permissions\s+WHERE role_identifier\s+=\s+\$1/i.test(text)) {
                return Promise.resolve(rows([{ permission_key: KEY }]));
            }
            if (/holder_count/i.test(text)) {
                return Promise.resolve(rows([{ holder_count: 0 }]));
            }
            return Promise.resolve(rows([]));
        });

        await expect(
            syncRolePermissions(client, 'team_manager', [], 'admin@x.test')
        ).rejects.toThrow(KEY);

        const wrote = client.calls.some(c =>
            /INSERT INTO role_permissions/.test(c.text)
        );
        expect(wrote).toBe(false);
    });

    test('permits removing manage_permissions when other active holders exist', async () => {
        const { syncRolePermissions } = require('../src/services/rolePermissions');
        const client = makeClient();

        let calls = 0;
        client.query.mockImplementation((text) => {
            if (/FROM role_permissions\s+WHERE role_identifier\s+=\s+\$1/i.test(text)) {
                return Promise.resolve(rows([{ permission_key: KEY }]));
            }
            if (/holder_count/i.test(text)) {
                calls++;
                const value = calls === 1 ? 5 : 2;
                return Promise.resolve(rows([{ holder_count: value }]));
            }
            return Promise.resolve(rows([]));
        });

        await expect(
            syncRolePermissions(client, 'team_manager', ['qc.tasks.view'], 'admin@x.test')
        ).resolves.toEqual(expect.objectContaining({ permissions: ['qc.tasks.view'] }));
    });

    test('does not invoke the invariant for non-keyholder keys', async () => {
        const { syncRolePermissions } = require('../src/services/rolePermissions');
        const client = makeClient();

        client.query.mockImplementation((text) => {
            if (/FROM role_permissions\s+WHERE role_identifier\s+=\s+\$1/i.test(text)) {
                return Promise.resolve(rows([{ permission_key: 'qc.tasks.view' }]));
            }
            return Promise.resolve(rows([]));
        });

        await expect(
            syncRolePermissions(client, 'viewer', [], 'admin@x.test')
        ).resolves.toEqual(expect.objectContaining({ permissions: [] }));
    });
});

describe('lockoutGuard.runBreakGlass (issue #268)', () => {
    function breakGlassClient() {
        const client = makeClient();
        client.query.mockImplementation((text) => {
            if (/FROM role_permissions\s+WHERE role_identifier\s*=\s*'admin'\s+AND permission_key\s*=\s*'\*'/i.test(text)) {
                return Promise.resolve(rows([]));
            }
            if (/holder_count/i.test(text)) {
                return Promise.resolve(rows([{ holder_count: 0 }]));
            }
            if (/INSERT INTO role_permissions/i.test(text)) {
                return Promise.resolve(rows([], 1));
            }
            return Promise.resolve(rows([]));
        });
        return client;
    }

    test('fires and inserts the admin "*" row when wildcard is gone and no holders', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = breakGlassClient();

        const result = await lockoutGuard.runBreakGlass(client);
        expect(result.fired).toBe(true);

        const insertSeen = client.calls.some(c =>
            /INSERT INTO role_permissions/i.test(c.text) &&
            c.params[0] === 'admin' &&
            c.params[1] === '*' &&
            c.params[2] === 'break-glass'
        );
        expect(insertSeen).toBe(true);
    });

    test('is idempotent — re-running when the row already exists is a no-op', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValueOnce(rows([{ '?column?': 1 }]));

        const result = await lockoutGuard.runBreakGlass(client);
        expect(result.fired).toBe(false);
        expect(result.reason).toMatch(/wildcard/i);

        const insertSeen = client.calls.some(c => /INSERT INTO role_permissions/i.test(c.text));
        expect(insertSeen).toBe(false);
    });

    test('skips the insert when active holders of manage_permissions remain', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();

        client.query.mockImplementation((text) => {
            if (/FROM role_permissions\s+WHERE role_identifier\s*=\s*'admin'\s+AND permission_key\s*=\s*'\*'/i.test(text)) {
                return Promise.resolve(rows([]));
            }
            if (/holder_count/i.test(text)) {
                return Promise.resolve(rows([{ holder_count: 2 }]));
            }
            return Promise.resolve(rows([]));
        });

        const result = await lockoutGuard.runBreakGlass(client);
        expect(result.fired).toBe(false);
        const insertSeen = client.calls.some(c => /INSERT INTO role_permissions/i.test(c.text));
        expect(insertSeen).toBe(false);
    });

    test('skips the insert when the admin "*" row is present', async () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        const client = makeClient();
        client.query.mockResolvedValue(rows([{ '?column?': 1 }]));

        const result = await lockoutGuard.runBreakGlass(client);
        expect(result.fired).toBe(false);
    });
});

describe('lockoutGuard constants (issue #268)', () => {
    test('KEYS_THAT_REQUIRE_A_HOLDER is exported with the two admin-domain keys', () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        expect(lockoutGuard.KEYS_THAT_REQUIRE_A_HOLDER).toEqual(expect.arrayContaining([
            PERMISSIONS.ADMIN_MANAGE_PERMISSIONS,
            PERMISSIONS.ADMIN_MANAGE_ROLES,
        ]));
    });

    test('ADMIN_WILDCARD is the "*" sentinel', () => {
        const lockoutGuard = require('../src/access/lockoutGuard');
        expect(lockoutGuard.ADMIN_WILDCARD).toBe('*');
    });
});
