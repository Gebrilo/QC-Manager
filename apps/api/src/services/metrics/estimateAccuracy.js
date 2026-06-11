'use strict';

const ESTIMATE_ACCURACY_THRESHOLD = 0.25;

const ESTIMATE_ACCURACY_VERDICTS = Object.freeze({
    PADDED: 'padded',
    ACCURATE: 'accurate',
    BLEW_PAST: 'blew_past',
});

const ESTIMATE_ACCURACY_LABELS = Object.freeze({
    [ESTIMATE_ACCURACY_VERDICTS.PADDED]: 'Over-estimated (padded)',
    [ESTIMATE_ACCURACY_VERDICTS.ACCURATE]: 'Accurate',
    [ESTIMATE_ACCURACY_VERDICTS.BLEW_PAST]: 'Under-estimated (blew past)',
});

function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function estimateAccuracy(estimateHrs, actualHrs, { threshold = ESTIMATE_ACCURACY_THRESHOLD } = {}) {
    const estimate = finiteNumber(estimateHrs);
    const actual = finiteNumber(actualHrs) ?? 0;
    const lowerBound = 1 - threshold;
    const upperBound = 1 + threshold;

    if (estimate === null || estimate <= 0) {
        return {
            ratio: null,
            verdict: null,
            label: null,
            threshold,
            lower_bound: lowerBound,
            upper_bound: upperBound,
        };
    }

    const ratio = actual / estimate;
    const verdict = ratio < lowerBound
        ? ESTIMATE_ACCURACY_VERDICTS.PADDED
        : ratio > upperBound
            ? ESTIMATE_ACCURACY_VERDICTS.BLEW_PAST
            : ESTIMATE_ACCURACY_VERDICTS.ACCURATE;

    return {
        ratio,
        verdict,
        label: ESTIMATE_ACCURACY_LABELS[verdict],
        threshold,
        lower_bound: lowerBound,
        upper_bound: upperBound,
    };
}

function isClosedWorkStatus(status) {
    return ['Done', 'Closed', 'Completed', 'Released'].includes(status);
}

module.exports = {
    ESTIMATE_ACCURACY_THRESHOLD,
    ESTIMATE_ACCURACY_VERDICTS,
    ESTIMATE_ACCURACY_LABELS,
    estimateAccuracy,
    isClosedWorkStatus,
};
