'use strict';

/**
 * ADR 0010 / issue #268 — last-keyholder invariant for the admin-domain
 * permission keys (qc.admin.manage_permissions, qc.admin.manage_roles).
 *
 * Defense-in-depth against lockout: even if the admin '*' wildcard is somehow
 * stripped from role_permissions (criterion 3 enforces it cannot be removed
 * via the Matrix, but a direct SQL edit or a botched migration could still
 * do it), the runtime refuses to remove a key from its last active holder.
 *
 * A holder is an ACTIVE app_user (active = TRUE AND status NOT IN
 * ('SUSPENDED','ARCHIVED')) who effectively holds the key via:
 *   (a) role_permissions for their canonical role — built-in roles use the
 *       legacy alias map (admin, team_manager↔manager, tester↔user/member, pm,
 *       viewer, contributor); custom roles use their own name; or
 *   (b) a user_permissions row with granted = TRUE (a per-user elevation).
 *
 * Admin always counts via the '*' wildcard: any permission_key a holder check
 * is asked about is implicitly held by every active admin user when
 * role_permissions contains ('admin', '*'). When that row is present, the
 * holder count for ANY key is >= 1, so the invariant only fires when admin
 * '*' has been stripped AND every other holder is also gone — exactly the
 * scenario the invariant is designed to catch.
 */

const { ROLE_STORAGE_NAMES } = require('./rbacSeed');

const ADMIN_WILDCARD = '*';

const KEYS_THAT_REQUIRE_A_HOLDER = Object.freeze([
    'qc.admin.manage_permissions',
    'qc.admin.manage_roles',
]);

function activeUserPredicate() {
    return "u.active = TRUE AND (u.status IS NULL OR u.status NOT IN ('SUSPENDED','ARCHIVED'))";
}

function roleStorageCaseSql() {
    const branches = [];
    for (const [canonical, names] of Object.entries(ROLE_STORAGE_NAMES)) {
        const list = names.map(n => `'${n}'`).join(',');
        branches.push(`WHEN '${canonical}' THEN ARRAY[${list}]::text[]`);
    }
    return branches.join(' ');
}

async function countActiveHoldersOfKey(client, permissionKey) {
    const sql = `
        WITH role_mapping AS (
            SELECT u.id,
                   CASE u.role
                       ${roleStorageCaseSql()}
                       ELSE ARRAY[u.role]::text[]
                   END AS storage_names
            FROM app_user u
            WHERE ${activeUserPredicate()}
        ),
        admin_wildcard_holders AS (
            SELECT rm.id
            FROM role_mapping rm
            WHERE 'admin' = ANY(rm.storage_names)
              AND EXISTS (
                  SELECT 1 FROM role_permissions rp
                  WHERE rp.role_identifier = 'admin' AND rp.permission_key = $1
              )
        ),
        role_key_holders AS (
            SELECT DISTINCT rm.id
            FROM role_mapping rm
            JOIN role_permissions rp ON rp.role_identifier = ANY(rm.storage_names)
            WHERE rp.permission_key = $1
        ),
        override_holders AS (
            SELECT u.id
            FROM app_user u
            JOIN user_permissions up ON up.user_id = u.id
            WHERE ${activeUserPredicate()}
              AND up.permission_key = $1
              AND up.granted = TRUE
        )
        SELECT COUNT(DISTINCT id)::int AS holder_count FROM (
            SELECT id FROM admin_wildcard_holders
            UNION
            SELECT id FROM role_key_holders
            UNION
            SELECT id FROM override_holders
        ) combined
    `;
    const result = await client.query(sql, [permissionKey]);
    return result.rows[0]?.holder_count || 0;
}

async function countActiveHoldersExcludingRole(client, permissionKey, canonicalRoleName) {
    const sql = `
        WITH role_mapping AS (
            SELECT u.id,
                   CASE u.role
                       ${roleStorageCaseSql()}
                       ELSE ARRAY[u.role]::text[]
                   END AS storage_names
            FROM app_user u
            WHERE ${activeUserPredicate()}
              AND u.role <> $2
        ),
        admin_wildcard_holders AS (
            SELECT rm.id
            FROM role_mapping rm
            WHERE 'admin' = ANY(rm.storage_names)
              AND EXISTS (
                  SELECT 1 FROM role_permissions rp
                  WHERE rp.role_identifier = 'admin' AND rp.permission_key = $1
              )
        ),
        role_key_holders AS (
            SELECT DISTINCT rm.id
            FROM role_mapping rm
            JOIN role_permissions rp ON rp.role_identifier = ANY(rm.storage_names)
            WHERE rp.permission_key = $1
        ),
        override_holders AS (
            SELECT u.id
            FROM app_user u
            JOIN user_permissions up ON up.user_id = u.id
            WHERE ${activeUserPredicate()}
              AND u.role <> $2
              AND up.permission_key = $1
              AND up.granted = TRUE
        )
        SELECT COUNT(DISTINCT id)::int AS holder_count FROM (
            SELECT id FROM admin_wildcard_holders
            UNION
            SELECT id FROM role_key_holders
            UNION
            SELECT id FROM override_holders
        ) combined
    `;
    const result = await client.query(sql, [permissionKey, canonicalRoleName]);
    return result.rows[0]?.holder_count || 0;
}

async function countActiveHoldersExcludingUser(client, permissionKey, userId) {
    const sql = `
        WITH role_mapping AS (
            SELECT u.id,
                   CASE u.role
                       ${roleStorageCaseSql()}
                       ELSE ARRAY[u.role]::text[]
                   END AS storage_names
            FROM app_user u
            WHERE ${activeUserPredicate()}
              AND u.id <> $2
        ),
        admin_wildcard_holders AS (
            SELECT rm.id
            FROM role_mapping rm
            WHERE 'admin' = ANY(rm.storage_names)
              AND EXISTS (
                  SELECT 1 FROM role_permissions rp
                  WHERE rp.role_identifier = 'admin' AND rp.permission_key = $1
              )
        ),
        role_key_holders AS (
            SELECT DISTINCT rm.id
            FROM role_mapping rm
            JOIN role_permissions rp ON rp.role_identifier = ANY(rm.storage_names)
            WHERE rp.permission_key = $1
        ),
        override_holders AS (
            SELECT u.id
            FROM app_user u
            JOIN user_permissions up ON up.user_id = u.id
            WHERE ${activeUserPredicate()}
              AND u.id <> $2
              AND up.permission_key = $1
              AND up.granted = TRUE
        )
        SELECT COUNT(DISTINCT id)::int AS holder_count FROM (
            SELECT id FROM admin_wildcard_holders
            UNION
            SELECT id FROM role_key_holders
            UNION
            SELECT id FROM override_holders
        ) combined
    `;
    const result = await client.query(sql, [permissionKey, userId]);
    return result.rows[0]?.holder_count || 0;
}

async function wouldDropLastHolder(client, permissionKey, { excludingRoleName, excludingUserId } = {}) {
    const total = await countActiveHoldersOfKey(client, permissionKey);

    let excluded = 0;
    if (excludingRoleName) {
        const roleOnly = await countActiveHoldersOfKeyForRole(client, permissionKey, excludingRoleName);
        excluded += roleOnly;
    }
    if (excludingUserId) {
        const userOnly = await countActiveHoldersOfKeyForUser(client, permissionKey, excludingUserId);
        excluded += userOnly;
    }

    if (!excludingRoleName && !excludingUserId) {
        return total <= 1;
    }

    return total - excluded <= 0;
}

async function countActiveHoldersOfKeyForRole(client, permissionKey, canonicalRoleName) {
    const sql = `
        WITH role_mapping AS (
            SELECT u.id,
                   CASE u.role
                       ${roleStorageCaseSql()}
                       ELSE ARRAY[u.role]::text[]
                   END AS storage_names
            FROM app_user u
            WHERE ${activeUserPredicate()}
        ),
        matched AS (
            SELECT u.id
            FROM app_user u
            WHERE u.role = $2
              AND ${activeUserPredicate()}
              AND (
                  EXISTS (
                      SELECT 1 FROM role_permissions rp
                      WHERE rp.role_identifier = $2 AND rp.permission_key = $1
                  )
                  OR EXISTS (
                      SELECT 1 FROM user_permissions up
                      WHERE up.user_id = u.id
                        AND up.permission_key = $1
                        AND up.granted = TRUE
                  )
                  OR (
                      $2 = 'admin'
                      AND EXISTS (
                          SELECT 1 FROM role_permissions rp
                          WHERE rp.role_identifier = 'admin' AND rp.permission_key = '*'
                      )
                  )
              )
        )
        SELECT COUNT(*)::int AS holder_count FROM matched
    `;
    const result = await client.query(sql, [permissionKey, canonicalRoleName]);
    return result.rows[0]?.holder_count || 0;
}

async function countActiveHoldersOfKeyForUser(client, permissionKey, userId) {
    const sql = `
        SELECT (
            EXISTS (
                SELECT 1 FROM app_user u
                WHERE u.id = $2
                  AND ${activeUserPredicate()}
                  AND u.role = 'admin'
                  AND EXISTS (
                      SELECT 1 FROM role_permissions rp
                      WHERE rp.role_identifier = 'admin' AND rp.permission_key = '*'
                  )
            )
            OR EXISTS (
                SELECT 1 FROM app_user u
                JOIN role_permissions rp ON rp.role_identifier = (
                    CASE u.role
                        ${roleStorageCaseSql()}
                        ELSE u.role
                    END
                )
                WHERE u.id = $2
                  AND ${activeUserPredicate()}
                  AND rp.permission_key = $1
            )
            OR EXISTS (
                SELECT 1 FROM user_permissions up
                WHERE up.user_id = $2
                  AND up.permission_key = $1
                  AND up.granted = TRUE
            )
        )::int AS contributes
    `;
    const result = await client.query(sql, [permissionKey, userId]);
    return result.rows[0]?.contributes ? 1 : 0;
}

async function assertNotLastHolder(client, permissionKey, exclusion) {
    if (await wouldDropLastHolder(client, permissionKey, exclusion)) {
        throw new Error(
            `Refusing to drop the last active holder of '${permissionKey}'. ` +
            `At least one active holder must remain so permission/role administration can continue.`
        );
    }
}

async function runBreakGlass(client) {
    const adminWildcardResult = await client.query(
        "SELECT 1 FROM role_permissions WHERE role_identifier = 'admin' AND permission_key = '*'"
    );
    if (adminWildcardResult.rows.length > 0) {
        return { fired: false, reason: 'admin wildcard present' };
    }

    const holders = await countActiveHoldersOfKey(client, 'qc.admin.manage_permissions');
    if (holders > 0) {
        return { fired: false, reason: `${holders} active holder(s) of qc.admin.manage_permissions` };
    }

    const insertResult = await client.query(
        `INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_identifier, permission_key) DO NOTHING`,
        ['admin', '*', 'break-glass']
    );

    console.warn('[lockoutGuard] Break-glass fired: re-granted admin * wildcard — no active holders of qc.admin.manage_permissions');
    return { fired: true, rowCount: insertResult.rowCount || 0 };
}

module.exports = {
    ADMIN_WILDCARD,
    KEYS_THAT_REQUIRE_A_HOLDER,
    countActiveHoldersOfKey,
    countActiveHoldersExcludingRole,
    countActiveHoldersExcludingUser,
    wouldDropLastHolder,
    assertNotLastHolder,
    runBreakGlass,
};
