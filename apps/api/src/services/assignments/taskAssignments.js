'use strict';

/**
 * ADR 0009 — task_resource_assignment write service.
 *
 * Single source of truth for who is on a Task and each person's effort. The
 * Phase-1 dual-write trigger (sync_task_assignment_cache) mirrors the PRIMARY
 * assignment and the earliest SECONDARY back onto the legacy two-slot columns
 * (resource1_id/resource2_id, their r1_/r2_ hour columns, plus the task-level
 * initial_estimate/final_estimate/actual_effort), so callers writing through
 * this service do not have to maintain those columns themselves.
 *
 * Backward compatibility: callers may still send the legacy
 * resource1_uuid/resource2_uuid + rN_* fields; assignmentsFromPayload() maps
 * them to a canonical assignment list. New callers send an `assignments` array.
 */

const ASSIGNMENT_TYPES = ['PRIMARY', 'SECONDARY'];

/** Thrown for assignment rule violations; mapped to HTTP 400 by the error handler. */
class AssignmentValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssignmentValidationError';
        this.statusCode = 400;
    }
}

function num(value, dflt = 0) {
    if (value === undefined || value === null || value === '') return dflt;
    const n = Number(value);
    return Number.isFinite(n) ? n : dflt;
}

function nullableNum(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function has(obj, key) {
    return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function pick(data, key, fallback) {
    return has(data, key) ? data[key] : fallback;
}

function normalizeAssignment(a) {
    return {
        resource_id: a.resource_id,
        assignment_type: a.assignment_type,
        estimate_hrs: num(a.estimate_hrs, 0),
        actual_hrs: num(a.actual_hrs, 0),
        initial_estimate: nullableNum(a.initial_estimate),
        final_estimate: nullableNum(a.final_estimate),
        planned_working_days: nullableNum(a.planned_working_days),
        completion_status: a.completion_status || 'Pending',
        completed_at: a.completed_at || null,
    };
}

/**
 * Build the canonical assignment list from a task payload.
 *
 * - If `data.assignments` is an array, it is the desired full set.
 * - Otherwise, if any legacy resource/hours field is present, derive a 1–2
 *   element list from resource1_uuid/resource2_uuid + rN_* (with `fallbackTo`,
 *   typically the original task row, supplying values for slots not in the patch).
 * - Otherwise return `null` — the caller should leave assignments untouched.
 */
function assignmentsFromPayload(data, { fallbackTo = null } = {}) {
    if (Array.isArray(data.assignments)) {
        return data.assignments.map(normalizeAssignment);
    }

    const LEGACY_KEYS = [
        'resource1_uuid', 'resource2_uuid',
        'r1_estimate_hrs', 'r1_actual_hrs', 'r2_estimate_hrs', 'r2_actual_hrs',
        'initial_estimate', 'final_estimate',
    ];
    if (!LEGACY_KEYS.some(k => has(data, k))) return null;

    const base = fallbackTo || {};
    const list = [];

    const primaryResource = pick(data, 'resource1_uuid', base.resource1_id);
    if (primaryResource) {
        list.push(normalizeAssignment({
            resource_id: primaryResource,
            assignment_type: 'PRIMARY',
            estimate_hrs: pick(data, 'r1_estimate_hrs', base.r1_estimate_hrs),
            actual_hrs: pick(data, 'r1_actual_hrs', base.r1_actual_hrs),
            initial_estimate: pick(data, 'initial_estimate', base.initial_estimate),
            final_estimate: pick(data, 'final_estimate', base.final_estimate),
        }));
    }

    const secondaryResource = pick(data, 'resource2_uuid', base.resource2_id);
    if (secondaryResource) {
        list.push(normalizeAssignment({
            resource_id: secondaryResource,
            assignment_type: 'SECONDARY',
            estimate_hrs: pick(data, 'r2_estimate_hrs', base.r2_estimate_hrs),
            actual_hrs: pick(data, 'r2_actual_hrs', base.r2_actual_hrs),
        }));
    }

    return list;
}

/**
 * Enforce the assignment rules. An empty list is allowed (an unassigned Task,
 * preserving today's behaviour). A non-empty list must have exactly one PRIMARY
 * and no resource assigned more than once (which also forbids a resource being
 * both PRIMARY and SECONDARY).
 */
function validateAssignments(list) {
    if (!Array.isArray(list)) {
        throw new AssignmentValidationError('assignments must be an array');
    }
    if (list.length === 0) return list;

    const primaries = list.filter(a => a.assignment_type === 'PRIMARY');
    if (primaries.length === 0) {
        throw new AssignmentValidationError('A task requires a primary resource');
    }
    if (primaries.length > 1) {
        throw new AssignmentValidationError('A task can have only one primary resource');
    }

    const seen = new Set();
    for (const a of list) {
        if (!a.resource_id) {
            throw new AssignmentValidationError('Each assignment must reference a resource');
        }
        if (!ASSIGNMENT_TYPES.includes(a.assignment_type)) {
            throw new AssignmentValidationError(`Invalid assignment_type: ${a.assignment_type}`);
        }
        if (num(a.estimate_hrs) < 0 || num(a.actual_hrs) < 0) {
            throw new AssignmentValidationError('Effort hours cannot be negative');
        }
        if (seen.has(a.resource_id)) {
            throw new AssignmentValidationError(
                'A resource cannot be assigned to the same task more than once (a resource cannot be both primary and secondary)'
            );
        }
        seen.add(a.resource_id);
    }
    return list;
}

/** PRIMARY first, then SECONDARY in input order (drives the deterministic legacy r2_ slot). */
function orderAssignments(list) {
    return [
        ...list.filter(a => a.assignment_type === 'PRIMARY'),
        ...list.filter(a => a.assignment_type === 'SECONDARY'),
    ];
}

function totalActualHrs(list) {
    return (list || []).reduce((sum, a) => sum + num(a.actual_hrs), 0);
}

/**
 * Replace the full set of assignments for a task. Validates first (so a bad set
 * never mutates), deletes the existing rows, then inserts the new set with
 * monotonically increasing created_at so the first listed SECONDARY is the
 * earliest (matching the legacy r2_ slot the cache trigger fills).
 *
 * `query` is the injected db query function; callers in production pass the
 * pooled query. (Transaction hardening — wrapping delete+insert in a single
 * client tx — is a follow-up; validation runs before any write.)
 */
async function replaceTaskAssignments({ query, taskId, assignments }) {
    const validated = validateAssignments(assignments || []);
    await query('DELETE FROM task_resource_assignment WHERE task_id = $1', [taskId]);

    const ordered = orderAssignments(validated).map(normalizeAssignment);
    const baseMs = Date.now();
    const inserted = [];
    for (let i = 0; i < ordered.length; i++) {
        const a = ordered[i];
        const createdAt = new Date(baseMs + i).toISOString();
        const r = await query(
            `INSERT INTO task_resource_assignment
                (task_id, resource_id, assignment_type, initial_estimate, final_estimate,
                 estimate_hrs, actual_hrs, planned_working_days, completion_status, completed_at,
                 created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
             RETURNING *`,
            [
                taskId, a.resource_id, a.assignment_type, a.initial_estimate, a.final_estimate,
                a.estimate_hrs, a.actual_hrs, a.planned_working_days, a.completion_status, a.completed_at,
                createdAt,
            ]
        );
        inserted.push(r.rows[0]);
    }
    return inserted;
}

/** Fetch a task's assignments (PRIMARY first), joined to resource names for display. */
async function getTaskAssignments(query, taskId) {
    const r = await query(
        `SELECT tra.*, res.resource_name
           FROM task_resource_assignment tra
           JOIN resources res ON res.id = tra.resource_id
          WHERE tra.task_id = $1
          ORDER BY (tra.assignment_type = 'PRIMARY') DESC, tra.created_at, tra.id`,
        [taskId]
    );
    return r.rows;
}

/** Sum of actual_hrs across a task's assignments (Done-gate total). */
async function sumActualHrs(query, taskId) {
    const r = await query(
        `SELECT COALESCE(SUM(actual_hrs), 0)::float AS total
           FROM task_resource_assignment WHERE task_id = $1`,
        [taskId]
    );
    return r.rows[0] ? Number(r.rows[0].total) : 0;
}

function primaryOf(list) {
    return (list || []).find(a => a.assignment_type === 'PRIMARY') || null;
}

function firstSecondaryOf(list) {
    return (list || []).find(a => a.assignment_type === 'SECONDARY') || null;
}

module.exports = {
    AssignmentValidationError,
    assignmentsFromPayload,
    validateAssignments,
    replaceTaskAssignments,
    getTaskAssignments,
    sumActualHrs,
    totalActualHrs,
    primaryOf,
    firstSecondaryOf,
    orderAssignments,
};
