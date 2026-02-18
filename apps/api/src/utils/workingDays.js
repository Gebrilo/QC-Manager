/**
 * Working Days Calendar Utility
 * ============================
 * Centralized, single source of truth for the organization's working-day logic.
 *
 * Working days: Sunday (0), Monday (1), Tuesday (2), Wednesday (3), Thursday (4)
 * Non-working:  Friday (5), Saturday (6)
 *
 * All date/duration/SLA/utilization calculations across the system MUST use
 * this module to ensure consistency.
 */

// ISO getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const NON_WORKING_DAYS = new Set([5, 6]); // Friday, Saturday

/**
 * Returns true if the given date falls on a working day (Sun–Thu).
 * @param {Date|string} date
 * @returns {boolean}
 */
function isWorkingDay(date) {
    const d = new Date(date);
    return !NON_WORKING_DAYS.has(d.getDay());
}

/**
 * Count the number of working days between two dates.
 * The count is SIGNED: positive when endDate > startDate, negative otherwise.
 * Counting is inclusive of startDate, exclusive of endDate — which equals
 * "how many working days would you traverse going from start to end".
 *
 * Example (Mon Mar 2 → Wed Mar 4): Mon, Tue = 2 working days.
 * Example (Mon Mar 2 → Fri Mar 6): Mon, Tue, Wed, Thu = 4 working days.
 *
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {number} Signed working-day count
 */
function countWorkingDays(startDate, endDate) {
    if (!startDate || !endDate) return null;

    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);

    if (start.getTime() === end.getTime()) return 0;

    const forward = end >= start;
    const from = forward ? new Date(start) : new Date(end);
    const to = forward ? new Date(end) : new Date(start);

    let count = 0;
    const cursor = new Date(from);
    while (cursor < to) {
        if (isWorkingDay(cursor)) count++;
        cursor.setDate(cursor.getDate() + 1);
    }

    return forward ? count : -count;
}

/**
 * Add N working days to a date. Negative values subtract working days.
 * @param {Date|string} date
 * @param {number} days  Working days to add (can be negative)
 * @returns {Date}
 */
function addWorkingDays(date, days) {
    const d = new Date(normalizeDate(date));
    const step = days >= 0 ? 1 : -1;
    let remaining = Math.abs(days);

    while (remaining > 0) {
        d.setDate(d.getDate() + step);
        if (isWorkingDay(d)) remaining--;
    }
    return d;
}

/**
 * Normalize a date value to midnight UTC to avoid timezone drift in comparisons.
 * @param {Date|string} date
 * @returns {Date}
 */
function normalizeDate(date) {
    const d = new Date(date);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Determine the health status of a task based on its dates and variances.
 *
 * 🟢 on_track       — started on time (or early), still in progress
 * 🟡 at_risk        — started late, still in progress, deadline not yet passed
 * 🔴 overdue        — deadline passed without completion, OR completed after deadline
 * 🔵 completed_early — completed before deadline
 *
 * @param {object} task  Must have: expected_start_date, actual_start_date, deadline, completed_date
 * @param {Date}   [now] Current date for testing (defaults to today)
 * @returns {string|null}  Health status key or null if insufficient data
 */
function getTaskHealth(task, now) {
    const { expected_start_date, actual_start_date, deadline, completed_date } = task;

    // Need at least deadline to determine health
    if (!deadline) return null;

    const deadlineD = normalizeDate(deadline);
    const today = now ? normalizeDate(now) : normalizeDate(new Date());

    // Completed tasks
    if (completed_date) {
        const completedD = normalizeDate(completed_date);
        return completedD > deadlineD ? 'overdue' : 'completed_early';
    }

    // In-progress or backlog tasks
    if (today > deadlineD) return 'overdue';

    // Check if started late
    if (expected_start_date && actual_start_date) {
        const expectedD = normalizeDate(expected_start_date);
        const actualD = normalizeDate(actual_start_date);
        if (actualD > expectedD) return 'at_risk';
    }

    return 'on_track';
}

/**
 * Compute all three variance metrics for a task.
 * Returns { start_variance, completion_variance, execution_variance, health_status }.
 * All variance values are in working days (positive = late/over-estimate).
 *
 * @param {object} task
 * @param {Date}   [now]
 * @returns {object}
 */
function computeTaskTimeline(task, now) {
    const { expected_start_date, actual_start_date, deadline, completed_date, estimate_days } = task;

    const start_variance = (expected_start_date && actual_start_date)
        ? countWorkingDays(expected_start_date, actual_start_date)
        : null;

    const completion_variance = (deadline && completed_date)
        ? countWorkingDays(deadline, completed_date)
        : null;

    let execution_variance = null;
    if (actual_start_date && completed_date && estimate_days != null) {
        const actualDuration = countWorkingDays(actual_start_date, completed_date);
        execution_variance = actualDuration - Number(estimate_days);
    }

    const health_status = getTaskHealth(task, now);

    return { start_variance, completion_variance, execution_variance, health_status };
}

module.exports = {
    NON_WORKING_DAYS,
    isWorkingDay,
    countWorkingDays,
    addWorkingDays,
    normalizeDate,
    getTaskHealth,
    computeTaskTimeline,
};
