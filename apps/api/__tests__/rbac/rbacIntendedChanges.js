'use strict';

/**
 * ADR 0010 / issue #264 — Intended-changes allowlist for the (role × gate)
 * truth-table harness.
 *
 * The harness (`rbacTruthTable.test.js`) enumerates every API auth gate, derives
 * its OLD decision (the legacy catalog path) and its NEW decision (the unified
 * Access Engine resolver), and fails on ANY divergence not listed here. Each
 * listed divergence must carry a rationale — this file is the reviewed spec of
 * every deliberate behaviour change in the RBAC-unification effort.
 *
 * BASELINE (issue #264): both maps are EMPTY. The unified resolver must preserve
 * every existing authorization decision, so the baseline run proves parity
 * (zero diffs). Subsequent issues populate the maps:
 *   - #265 / #266 / #267 add ROLE_GATE_REPLACEMENTS entries as they convert a
 *     `requireRole(...)` gate into a `requirePermission(...)` gate, and add an
 *     INTENDED_CHANGES entry only when that conversion intentionally shifts
 *     reachability for a role (a parity-preserving conversion needs none).
 */

// Divergences on PERMISSION gates that are deliberate.
// Shape: { [permissionKey]: { [role]: <rationale string> } }
const INTENDED_CHANGES = Object.freeze({
    // (no entries at baseline — issue #264)
});

// `requireRole(...)` gates that have been converted to a permission gate.
// Shape: { [roleGateSignature]: { replacementKey: <qc.* key>, rationale: <string> } }
// where `roleGateSignature` is the canonical gate key produced by the harness
// (the LOWER-CASED, SORTED, '|'-joined role list, e.g. 'admin|team_manager').
// Once an entry exists here, the harness asserts that for EVERY role the old
// role-list decision equals the new replacement-key decision (parity), and any
// intentional shift must also appear in INTENDED_CHANGES.
const ROLE_GATE_REPLACEMENTS = Object.freeze({
    // (no entries at baseline — populated by #265 / #266 / #267)
});

module.exports = { INTENDED_CHANGES, ROLE_GATE_REPLACEMENTS };
