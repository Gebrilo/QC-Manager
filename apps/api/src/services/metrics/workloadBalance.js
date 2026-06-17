'use strict';

// Workload balance compares completed test runs against the number of tasks
// in a project. A project is "balanced" when it has roughly one completed run
// per task (ratio within the tolerance band below).
const WORKLOAD_BALANCE_LOWER = 0.9;
const WORKLOAD_BALANCE_UPPER = 1.1;

const WORKLOAD_BALANCE_STATUS = Object.freeze({
    NO_TASKS: 'NO_TASKS',
    NO_TESTS: 'NO_TESTS',
    UNDER_TESTED: 'UNDER_TESTED',
    BALANCED: 'BALANCED',
    OVER_TESTED: 'OVER_TESTED',
});

function toCount(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Classify a project's workload balance from completed-run and task counts.
 * @param {number|string} totalRuns  completed test_run count
 * @param {number|string} totalTasks task count
 * @returns {string} one of WORKLOAD_BALANCE_STATUS values
 */
function classifyWorkloadBalance(
    totalRuns,
    totalTasks,
    { lower = WORKLOAD_BALANCE_LOWER, upper = WORKLOAD_BALANCE_UPPER } = {},
) {
    const runs = toCount(totalRuns);
    const tasks = toCount(totalTasks);

    if (tasks === 0) return WORKLOAD_BALANCE_STATUS.NO_TASKS;
    if (runs === 0) return WORKLOAD_BALANCE_STATUS.NO_TESTS;

    const ratio = runs / tasks;
    if (ratio > upper) return WORKLOAD_BALANCE_STATUS.OVER_TESTED;
    if (ratio >= lower) return WORKLOAD_BALANCE_STATUS.BALANCED;
    return WORKLOAD_BALANCE_STATUS.UNDER_TESTED;
}

module.exports = {
    WORKLOAD_BALANCE_LOWER,
    WORKLOAD_BALANCE_UPPER,
    WORKLOAD_BALANCE_STATUS,
    classifyWorkloadBalance,
};
