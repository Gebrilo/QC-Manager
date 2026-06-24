/**
 * Team-Based Access Control Middleware & Helpers
 *
 * All data access for managers is scoped to their team:
 *   User → team_id → Team → manager_id
 *   Project → team_id
 *   Task → project_id → Project → team_id
 *
 * Admins bypass all team-scope checks.
 */

const db = require('../config/db');
const { SCOPES, PERMISSIONS, canUserUseScope, isTeamManagerRole } = require('../../../shared/rbac/catalog.ts');
const { userHasAnyPermission } = require('./authMiddleware');

// Manager team-view access is permission-driven (not tied to the teams.manager_id
// assignment). Two grantable permissions decide reach:
//   - ALL_TEAMS  → every team, unscoped (like admin). Default-seeded to `pm`.
//   - OWN_TEAM   → only the actor's team (the team they manage, else the team
//                  they belong to). Default-seeded to `team_manager`.
const ALL_TEAMS_VIEW_PERMISSION = PERMISSIONS.JOURNEYS_VIEW_ALL_TEAMS_PROGRESS;
const OWN_TEAM_VIEW_PERMISSION = PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS;

/**
 * The team an actor is scoped to for the own-team grant: the team they manage
 * (teams.manager_id), falling back to the team they belong to (app_user.team_id).
 * Returns null when the actor is associated with no team.
 */
async function resolveOwnTeamId(userId) {
    return (await getManagerTeamId(userId)) || (await getUserTeamId(userId));
}

/**
 * Get the team record for the current manager (req.user).
 * Returns null if the user has no team or is not a manager.
 */
async function getManagerTeam(userId) {
    const result = await db.query(
        `SELECT id, name, manager_id FROM teams WHERE manager_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get the team_id that a manager manages.
 * Returns null if not found.
 */
async function getManagerTeamId(userId) {
    const team = await getManagerTeam(userId);
    return team ? team.id : null;
}

/**
 * Get the team_id that a user belongs to.
 */
async function getUserTeamId(userId) {
    const result = await db.query(
        `SELECT team_id FROM app_user WHERE id = $1`,
        [userId]
    );
    return result.rows.length > 0 ? result.rows[0].team_id : null;
}

/**
 * Verify that a project belongs to the manager's team.
 * Returns true if admin, or if project.team_id === manager's team_id.
 */
async function canAccessProject(user, projectId) {
    if (user.role === 'admin') return true;

    const teamId = await getManagerTeamId(user.id);
    if (!teamId) return false;

    const result = await db.query(
        `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
        [projectId, teamId]
    );
    return result.rows.length > 0;
}

/**
 * Verify that a task belongs to a project that belongs to the manager's team.
 */
async function canAccessTask(user, taskId) {
    if (user.role === 'admin') return true;

    const teamId = await getManagerTeamId(user.id);
    if (!teamId) return false;

    const result = await db.query(
        `SELECT t.id FROM tasks t
         JOIN projects p ON t.project_id = p.id
         WHERE t.id = $1 AND p.team_id = $2 AND t.deleted_at IS NULL`,
        [taskId, teamId]
    );
    return result.rows.length > 0;
}

/**
 * @deprecated Use canAccessUser() instead, which also handles self-access
 * and explicit role rejection.
 */
async function canAccessTeamMember(user, memberId) {
    if (user.role === 'admin') return true;

    const teamId = await getManagerTeamId(user.id);
    if (!teamId) return false;

    const result = await db.query(
        `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
        [memberId, teamId]
    );
    return result.rows.length > 0;
}

/**
 * Middleware: Enforce team scope. Admins pass unrestricted (req.teamId = null).
 * Managers must have a team; req.teamId is set to their team UUID.
 * Managers with no team and non-manager/non-admin roles receive 403.
 * Supersedes attachTeamScope (which silently passes null for unassigned managers).
 */
async function requireTeamScope(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role === 'admin') {
        req.teamId = null;
        return next();
    }
    try {
        // All-teams grant → unscoped, every team is visible (like admin).
        if (await userHasAnyPermission(req.user, [ALL_TEAMS_VIEW_PERMISSION], req)) {
            req.teamId = null;
            return next();
        }
        // Own-team grant → scope to the actor's team (manage-first, else belong).
        if (await userHasAnyPermission(req.user, [OWN_TEAM_VIEW_PERMISSION], req)) {
            const teamId = await resolveOwnTeamId(req.user.id);
            if (!teamId) {
                return res.status(403).json({ error: 'You are not assigned to a team' });
            }
            req.teamId = teamId;
            return next();
        }
        return res.status(403).json({ error: 'Manager or admin access required' });
    } catch (err) {
        next(err);
    }
}

/**
 * Check whether requestUser can access a target user record. Mirrors the tiers
 * in requireTeamScope so per-user endpoints and list endpoints agree:
 *   Admin → always true. Self-access → true.
 *   All-teams grant → any user. Own-team grant → users on the actor's team
 *   (manage-first, else belong). Anyone else → false.
 *
 * @param {object} requestUser - req.user
 * @param {string} targetUserId - UUID of the user being accessed
 * @returns {Promise<boolean>}
 */
async function canAccessUser(requestUser, targetUserId) {
    if (requestUser.role === 'admin') return true;
    if (requestUser.id === targetUserId) return true;

    // All-teams grant can reach any user.
    if (await userHasAnyPermission(requestUser, [ALL_TEAMS_VIEW_PERMISSION])) return true;

    // Own-team grant can reach users on the actor's team only.
    if (await userHasAnyPermission(requestUser, [OWN_TEAM_VIEW_PERMISSION])) {
        const teamId = await resolveOwnTeamId(requestUser.id);
        if (!teamId) return false;
        const result = await db.query(
            `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
            [targetUserId, teamId]
        );
        return result.rows.length > 0;
    }
    return false;
}

/**
 * Build a SQL WHERE clause fragment scoping app_user queries to a manager's team.
 * Follows the same pattern as projectTeamClause / taskTeamClause.
 * Use this in routes that do NOT use requireTeamScope middleware (e.g. resources.js).
 * Routes that already use requireTeamScope should read req.teamId directly.
 *
 * @param {object} user - req.user
 * @param {string} tableAlias - SQL alias for app_user table (default 'u')
 * @param {number} startIdx - first $N parameter index (default 1)
 * @returns {Promise<{ clause: string, params: any[], nextIdx: number, teamId: string|null }>}
 * If the manager has no team, returns `AND 1=0` as a safe empty-result guard —
 * callers do not need to handle the null-team case separately.
 */
async function getTeamScopeFilter(user, tableAlias = 'u', startIdx = 1) {
    if (user.role === 'admin') {
        return { clause: '', params: [], nextIdx: startIdx, teamId: null };
    }
    if (!canUserUseScope(user, SCOPES.TEAM.key)) {
        return { clause: '', params: [], nextIdx: startIdx, teamId: null };
    }
    const teamId = await getManagerTeamId(user.id);
    if (!teamId) {
        return { clause: 'AND 1=0', params: [], nextIdx: startIdx, teamId: null };
    }
    return {
        clause: `AND ${tableAlias}.team_id = $${startIdx}`,
        params: [teamId],
        nextIdx: startIdx + 1,
        teamId,
    };
}

/**
 * Middleware: Attach manager's team to req.teamId.
 * Admins get req.teamId = null (meaning no scope restriction).
 * Managers get req.teamId = their team's ID (or null if unassigned).
 * Non-managers/non-admins get 403.
 */
function attachTeamScope(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'admin') {
        req.teamId = null; // Admin sees everything
        return next();
    }

    if (!isTeamManagerRole(req.user.role)) {
        return res.status(403).json({ error: 'Manager or admin access required' });
    }

    getManagerTeamId(req.user.id)
        .then(teamId => {
            req.teamId = teamId; // May be null if manager has no team yet
            next();
        })
        .catch(next);
}

/**
 * Build a SQL WHERE clause fragment that scopes projects to a team.
 * For admins (teamId = null), returns '' (no restriction).
 * For managers, returns a parameterized condition.
 *
 * Usage:
 *   const { clause, params, nextIdx } = projectTeamClause(teamId, 1);
 *   // clause = 'AND team_id = $1'
 *   // params = [teamId]
 */
function projectTeamClause(teamId, startIdx = 1) {
    if (!teamId) return { clause: '', params: [], nextIdx: startIdx };
    return {
        clause: `AND team_id = $${startIdx}`,
        params: [teamId],
        nextIdx: startIdx + 1,
    };
}

/**
 * Build a SQL WHERE clause fragment that scopes tasks by their project's team.
 */
function taskTeamClause(teamId, tableAlias = 'p', startIdx = 1) {
    if (!teamId) return { clause: '', params: [], nextIdx: startIdx };
    return {
        clause: `AND ${tableAlias}.team_id = $${startIdx}`,
        params: [teamId],
        nextIdx: startIdx + 1,
    };
}

module.exports = {
    getManagerTeam,
    getManagerTeamId,
    getUserTeamId,
    canAccessProject,
    canAccessTask,
    canAccessTeamMember,
    attachTeamScope,
    projectTeamClause,
    taskTeamClause,
    requireTeamScope,
    canAccessUser,
    getTeamScopeFilter,
};
