'use strict';

/**
 * Issue #264 — (role × gate) truth-table verification harness (ADR 0010).
 *
 * Enumerates every API auth gate by scanning the route sources, then for each
 * (role × gate) pair derives two decisions and diffs them:
 *
 *   OLD — the legacy catalog path:
 *           requirePermission(key)  -> canUserPerform({ role }, key)
 *           requireRole(roles)      -> canonicalRole(role) ∈ roles
 *   NEW — the unified Access Engine resolver (the #262 path):
 *           RoleResolver.resolve (fed the catalog seed as role_permissions and
 *           no per-user deltas) -> hasPermission(effective, key)
 *
 * The two must match for EVERY pair EXCEPT entries in the intended-changes
 * allowlist (`rbac/rbacIntendedChanges.js`). The allowlist is the reviewed spec
 * of every deliberate behaviour change in this effort; an unlisted divergence
 * fails CI. Baseline (before any gate rewrite) asserts ZERO diffs — parity
 * between the old and new resolver is proven.
 *
 * Role gates become parity-checkable once a replacement permission key is
 * registered in ROLE_GATE_REPLACEMENTS (done by #265 / #266 / #267 as they
 * convert each requireRole into a requirePermission).
 */

const fs = require('fs');
const path = require('path');

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { canUserPerform, canonicalRole, BUILT_IN_ROLE_PERMISSION_DEFAULTS, ROLES } =
    require('../../shared/rbac/catalog.ts');
const { resolve } = require('../src/access/RoleResolver');
const { INTENDED_CHANGES, ROLE_GATE_REPLACEMENTS } = require('./rbac/rbacIntendedChanges');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const ALL_ROLES = Object.keys(ROLES);

// ─── gate discovery ──────────────────────────────────────────────────────────

function discoverGates() {
    const permissionKeys = new Set();
    const roleGateSignatures = new Set();

    for (const file of fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');

        for (const m of src.matchAll(/requirePermission\(\s*'([^']+)'\s*\)/g)) {
            permissionKeys.add(m[1]);
        }
        for (const m of src.matchAll(/requireAnyPermission\(\s*([^)]+)\)/g)) {
            // Split the arg list into individual keys. Spread args —
            // requireAnyPermission(...SOME_CONSTANT) — reference a constant the
            // static scanner cannot resolve, so skip them rather than register
            // the literal "...SOME_CONSTANT" as a bogus permission key (which
            // would diff against the resolver for admin's `*` wildcard).
            for (const part of m[1].split(',')) {
                const trimmed = part.trim();
                if (trimmed.startsWith('...')) continue;
                const k = trimmed.replace(/^'|'$/g, '');
                if (k) permissionKeys.add(k);
            }
        }
        for (const m of src.matchAll(/requireRole\(\s*([^)]+)\)/g)) {
            const roles = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '').toLowerCase()).sort();
            roleGateSignatures.add(roles.join('|'));
        }
    }
    return {
        permissionKeys: [...permissionKeys].sort(),
        roleGateSignatures: [...roleGateSignatures].sort(),
    };
}

// ─── OLD decision (legacy catalog path) ──────────────────────────────────────

function oldPermissionDecision(role, key) {
    return canUserPerform({ role }, key);
}

function oldRoleDecision(role, roleList) {
    return roleList.map(r => canonicalRole(r)).includes(canonicalRole(role));
}

// ─── NEW decision (unified resolver, fed the catalog seed) ────────────────────
//
// Resolve via the real RoleResolver, mocking the DB so role_permissions returns
// the catalog seed for the queried role and user_permissions is empty. This
// exercises the resolver's load + merge algebra against the same vocabulary the
// OLD path uses, so a divergence is a real resolver/catalog mismatch.

function mockResolverForRole(role) {
    mockQuery.mockImplementation((text, params) => {
        const sql = String(text);
        if (sql.includes('FROM role_permissions')) {
            const seed = BUILT_IN_ROLE_PERMISSION_DEFAULTS[canonicalRole(params[0])] || [];
            return Promise.resolve({ rows: seed.map(k => ({ permission_key: k })) });
        }
        if (sql.includes('FROM user_permissions')) {
            return Promise.resolve({ rows: [] });
        }
        if (sql.includes('FROM role_scopes')) {
            const catalog = require('../../shared/rbac/catalog.ts');
            const scopes = catalog.collectRoleScopes(canonicalRole(params[0]), new Set());
            return Promise.resolve({ rows: scopes.map(k => ({ scope_key: k })) });
        }
        if (sql.includes('FROM user_scopes')) {
            return Promise.resolve({ rows: [] });
        }
        // scope queries (team join / project_managers)
        return Promise.resolve({ rows: [] });
    });
}

async function newEffectiveSet(role) {
    mockQuery.mockReset();
    mockResolverForRole(role);
    const { effectivePermissions } = await resolve({ id: `${role}-1`, role });
    return effectivePermissions;
}

// ─── harness ─────────────────────────────────────────────────────────────────

const { permissionKeys, roleGateSignatures } = discoverGates();

describe('RBAC truth-table (issue #264)', () => {
    describe('permission-gate parity: OLD canUserPerform === NEW unified resolver', () => {
        test.each(ALL_ROLES)('role=%s — zero unlisted diffs across %i permission gates', async (role) => {
            const effective = await newEffectiveSet(role);
            const diffs = [];

            for (const key of permissionKeys) {
                const oldDecision = oldPermissionDecision(role, key);
                const newDecision = effective.has('*') || effective.has(key);

                if (oldDecision !== newDecision) {
                    const allowed = INTENDED_CHANGES[key]?.[role];
                    if (!allowed) {
                        diffs.push({ key, old: oldDecision, new: newDecision });
                    }
                }
            }
            expect(diffs).toEqual([]);
        });
    });

    describe('role-gate registry + replacement parity', () => {
        test('every role-gate signature discovered is accounted for', () => {
            // After the role-gate cutover (#265/#266/#267) there are NO remaining
            // requireRole(...) calls in app code. The truth table enforces that:
            // a NEW role gate appearing in the routes must be converted (or
            // explicitly registered as an exception) — no regressions allowed.
            expect(new Set(roleGateSignatures)).toEqual(new Set());
        });

        test('repo-wide sweep: no requireRole( calls remain in app code (#267)', () => {
            // Scans every .js / .ts source under apps/api/src and apps/web/ for
            // requireRole(. The requireRole middleware itself has been removed
            // (authMiddleware.js), so any occurrence is a regression.
            const roots = [
                path.join(__dirname, '..', 'src'),
                path.join(__dirname, '..', '..', 'web'),
            ];
            const hits = [];
            function walk(dir) {
                if (!fs.existsSync(dir)) return;
                for (const entry of fs.readdirSync(dir)) {
                    const full = path.join(dir, entry);
                    const stat = fs.statSync(full);
                    if (stat.isDirectory()) walk(full);
                    else if (/\.(js|ts)$/.test(entry)) {
                        const text = fs.readFileSync(full, 'utf8');
                        if (/requireRole\(/.test(text)) hits.push(full);
                    }
                }
            }
            for (const r of roots) walk(r);
            expect(hits).toEqual([]);
        });

        test('each REGISTERED role-gate replacement preserves reachability (modulo allowlist)', async () => {
            // Resolved once per role and reused across replacement checks.
            const effectiveByRole = {};
            for (const role of ALL_ROLES) {
                effectiveByRole[role] = await newEffectiveSet(role);
            }

            for (const [signature, replacements] of Object.entries(ROLE_GATE_REPLACEMENTS)) {
                const roleList = signature.split('|');
                for (const { replacementKey } of replacements) {
                    for (const role of ALL_ROLES) {
                        const oldDecision = oldRoleDecision(role, roleList);
                        const eff = effectiveByRole[role];
                        const newDecision = eff.has('*') || eff.has(replacementKey);
                        if (oldDecision === newDecision) continue;

                        // Divergence allowed only if explicitly intended.
                        const allowed = INTENDED_CHANGES[replacementKey]?.[role];
                        expect({ signature, role, replacementKey, old: oldDecision, new: newDecision, allowed: Boolean(allowed) })
                            .toEqual(expect.objectContaining({ allowed: true }));
                    }
                }
            }
        });
    });

    describe('allowlist hygiene', () => {
        test('every INTENDED_CHANGES entry references a key the routes actually gate on, or a registered replacement', () => {
            const gateKeys = new Set(permissionKeys);
            const replacementKeys = new Set(
                Object.values(ROLE_GATE_REPLACEMENTS).flatMap(list => list.map(r => r.replacementKey))
            );
            for (const [key, roles] of Object.entries(INTENDED_CHANGES)) {
                const known = gateKeys.has(key) || replacementKeys.has(key);
                expect({ key, known, roles: Object.keys(roles) }).toEqual(expect.objectContaining({ known: true }));
            }
        });

        test('every INTENDED_CHANGES entry has a non-empty rationale per role', () => {
            for (const [key, roles] of Object.entries(INTENDED_CHANGES)) {
                for (const [role, rationale] of Object.entries(roles)) {
                    expect({ key, role, rationale }).toEqual(expect.objectContaining({ rationale: expect.any(String) }));
                    expect(String(rationale).trim().length).toBeGreaterThan(0);
                }
            }
        });
    });
});
