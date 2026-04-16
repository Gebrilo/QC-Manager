'use strict';

const db = require('../config/db');

function lifecycleError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function activateUser(userId, actorId, options = {}, actorRole = 'manager') {
    const { weekly_capacity_hrs = 40, department = null } = options;

    const userResult = await db.query(
        `SELECT id, name, email, role, status, team_id, ready_for_activation, manager_id
         FROM app_user WHERE id = $1`,
        [userId]
    );
    if (userResult.rows.length === 0) throw lifecycleError(404, 'User not found');

    const user = userResult.rows[0];

    if (user.status === 'ACTIVE')       throw lifecycleError(409, 'User is already active');
    if (!user.team_id)                  throw lifecycleError(400, 'User must be assigned to a team before activation');
    if (!user.ready_for_activation)     throw lifecycleError(400, 'User is not marked as ready for activation');
    if (actorRole !== 'admin' && user.manager_id !== actorId) {
        throw lifecycleError(403, 'You can only activate users directly managed by you');
    }

    await db.query('BEGIN');
    try {
        const updated = await db.query(
            `UPDATE app_user
             SET status = 'ACTIVE', team_membership_active = true, updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, email, role, status, team_membership_active`,
            [userId]
        );

        await db.query(
            `INSERT INTO resources (resource_name, user_id, email, role, department, weekly_capacity_hrs)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) WHERE deleted_at IS NULL AND user_id IS NOT NULL
             DO UPDATE SET is_active = true, updated_at = NOW()`,
            [user.name, userId, user.email, user.role, department, weekly_capacity_hrs]
        );

        await db.query(
            `INSERT INTO notification (user_id, type, title, message)
             VALUES ($1, 'LIFECYCLE_ACTIVATED', 'You are now an Active Resource',
                     'Your account has been activated. You now have full system access.')`,
            [userId]
        );

        await db.query('COMMIT');
        return updated.rows[0];
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    }
}

async function rollbackUser(userId, actorId) {
    const userResult = await db.query(
        `SELECT id, status FROM app_user WHERE id = $1`,
        [userId]
    );
    if (userResult.rows.length === 0) throw lifecycleError(404, 'User not found');
    if (userResult.rows[0].status !== 'ACTIVE') throw lifecycleError(409, 'User is not currently active');

    await db.query('BEGIN');
    try {
        const updated = await db.query(
            `UPDATE app_user
             SET status = 'PREPARATION', team_membership_active = false, updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, email, role, status, team_membership_active`,
            [userId]
        );

        await db.query(
            `UPDATE resources SET is_active = false, updated_at = NOW()
             WHERE user_id = $1 AND deleted_at IS NULL`,
            [userId]
        );

        await db.query('COMMIT');
        return updated.rows[0];
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    }
}

async function markReadyForActivation(userId, actorId, ready, actorRole = 'manager') {
    const userResult = await db.query(
        `SELECT id, status, manager_id FROM app_user WHERE id = $1`,
        [userId]
    );
    if (userResult.rows.length === 0) throw lifecycleError(404, 'User not found');

    const user = userResult.rows[0];
    if (user.status !== 'PREPARATION') {
        throw lifecycleError(400, 'Can only update ready_for_activation for users in PREPARATION status');
    }
    if (actorRole !== 'admin' && user.manager_id !== actorId) {
        throw lifecycleError(403, 'You can only update users directly managed by you');
    }

    const result = await db.query(
        `UPDATE app_user SET ready_for_activation = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, ready_for_activation`,
        [!!ready, userId]
    );
    return result.rows[0];
}

async function suspendUser(_userId, _actorId, _reason) {
    throw lifecycleError(501, 'SUSPENDED state is not yet implemented');
}

async function archiveUser(_userId, _actorId) {
    throw lifecycleError(501, 'ARCHIVED state is not yet implemented');
}

module.exports = { activateUser, rollbackUser, markReadyForActivation, suspendUser, archiveUser };
