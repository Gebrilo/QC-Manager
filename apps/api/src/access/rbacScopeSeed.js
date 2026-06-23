'use strict';

const {
    ROLES,
    canonicalRole,
    collectRoleScopes,
} = require('../../../shared/rbac/catalog.ts');

/**
 * ADR 0010 / issue #269 — RBAC scopes move from code to DB (two-tier).
 *
 * `role_scopes` is the canonical role layer (seeded once from the catalog,
 * admin-editable thereafter). `user_scopes` is a SPARSE delta: only rows that
 * DIFFER from the role survive (`granted=true` = exemption/elevation above the
 * role's restrictive default, `granted=false` = restriction below it). Scope
 * DEFINITIONS (which statuses each scope maps to) stay in `catalog.ts` and are
 * not admin-editable (criterion 5 of issue #269). The terminal-status floor
 * (`SUSPENDED` / `ARCHIVED` cannot be exempted out of) is enforced in
 * `requireStatusScope` — not here.
 *
 * The seed is idempotent and uses a per-role `rbac_scope_seed_marker` so a
 * role an admin has deliberately emptied is never re-seeded (mirrors the
 * `rbac_seed_marker` pattern in `rbacSeed.js`).
 */

async function isRoleScopeSeeded(client, roleIdentifier) {
    const result = await client.query(
        'SELECT 1 FROM rbac_scope_seed_marker WHERE role_identifier = $1',
        [roleIdentifier]
    );
    return result.rows.length > 0;
}

function defaultScopesForRole(roleIdentifier) {
    const canonical = canonicalRole(roleIdentifier);
    const role = ROLES[canonical];
    if (!role) return [];
    if (role.permissions && role.permissions.includes('*')) return [];
    return collectRoleScopes(canonical, new Set());
}

/**
 * Idempotently seed `role_scopes` for every built-in role NOT yet marked
 * seeded. The per-role marker (`rbac_scope_seed_marker`) records that a role
 * has been initialised, so a role an admin has DELIBERATELY EMPTIED is never
 * re-seeded — the marker is independent of row count by design.
 *
 * `admin` is intentionally seeded with ZERO role_scopes rows: admin is
 * gated only by the `active` flag in `requireAuth` and the `*` permission
 * wildcard. The scope vocabulary is subtractive (narrows access), so an
 * empty scope set is the most-permissive default for admin.
 */
async function seedRoleScopes(client) {
    const seeded = [];
    for (const roleIdentifier of Object.keys(ROLES)) {
        if (await isRoleScopeSeeded(client, roleIdentifier)) continue;

        const scopeKeys = defaultScopesForRole(roleIdentifier);

        await client.query('DELETE FROM role_scopes WHERE role_identifier = $1', [roleIdentifier]);
        for (const scopeKey of scopeKeys) {
            await client.query(
                `INSERT INTO role_scopes (role_identifier, scope_key, granted_by)
                 VALUES ($1, $2, 'system-seed')
                 ON CONFLICT (role_identifier, scope_key) DO NOTHING`,
                [roleIdentifier, scopeKey]
            );
        }
        await client.query(
            `INSERT INTO rbac_scope_seed_marker (role_identifier) VALUES ($1) ON CONFLICT DO NOTHING`,
            [roleIdentifier]
        );
        seeded.push(roleIdentifier);
    }
    return seeded;
}

module.exports = {
    seedRoleScopes,
    isRoleScopeSeeded,
    defaultScopesForRole,
};
