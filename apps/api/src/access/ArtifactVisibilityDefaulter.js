'use strict';

const db = require('../config/db');

function resolveQuery(query) {
    return query || db.query.bind(db);
}

async function lookupHumanCreatorTeam(userId, query) {
    if (!userId) return { team_id: null, team_type_id: null, team_type: null };
    const q = resolveQuery(query);
    const result = await q(
        `SELECT u.team_id, t.team_type_id, tt.code AS team_type
         FROM app_user u
         LEFT JOIN teams t ON u.team_id = t.id
         LEFT JOIN team_types tt ON t.team_type_id = tt.id
         WHERE u.id = $1`,
        [userId]
    );
    return result.rows[0] || { team_id: null, team_type_id: null, team_type: null };
}

async function lookupTuleapCreatorTeam(teamId, query) {
    if (!teamId) return { team_id: null, team_type_id: null, team_type: null };
    const q = resolveQuery(query);
    const result = await q(
        `SELECT t.id AS team_id, t.team_type_id, tt.code AS team_type
         FROM teams t
         LEFT JOIN team_types tt ON t.team_type_id = tt.id
         WHERE t.id = $1`,
        [teamId]
    );
    return result.rows[0] || { team_id: teamId, team_type_id: null, team_type: null };
}

async function loadDefaultRow(teamTypeId, artifactType, query) {
    if (!teamTypeId) return null;
    const q = resolveQuery(query);
    const result = await q(
        `SELECT default_scope, default_acl_grants
         FROM default_artifact_visibility
         WHERE team_type_id = $1 AND artifact_type = $2`,
        [teamTypeId, artifactType]
    );
    return result.rows[0] || null;
}

async function defaultsFor({ creator, tuleapDefaults, artifactType, query }) {
    const teamInfo = tuleapDefaults
        ? await lookupTuleapCreatorTeam(tuleapDefaults.default_owner_team_id, query)
        : await lookupHumanCreatorTeam(creator.id, query);

    let visibility_scope = tuleapDefaults && tuleapDefaults.default_visibility_scope
        ? tuleapDefaults.default_visibility_scope
        : null;
    let default_acl_grants = [];

    if (!visibility_scope) {
        const row = await loadDefaultRow(teamInfo.team_type_id, artifactType, query);
        if (row) {
            visibility_scope = row.default_scope;
            default_acl_grants = row.default_acl_grants || [];
        }
    } else {
        // visibility_scope already supplied by tuleapDefaults; still load
        // default ACL grants from the team's matrix so role-based grants
        // (e.g. pm view) follow the team type's defaults.
        const row = await loadDefaultRow(teamInfo.team_type_id, artifactType, query);
        if (row) {
            default_acl_grants = row.default_acl_grants || [];
        }
    }

    return {
        owner_team_id: teamInfo.team_id || null,
        visibility_scope: visibility_scope || 'team',
        default_acl_grants,
    };
}

module.exports = { defaultsFor };
