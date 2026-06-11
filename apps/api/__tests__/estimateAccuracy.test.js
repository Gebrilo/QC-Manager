'use strict';

const {
    ESTIMATE_ACCURACY_THRESHOLD,
    ESTIMATE_ACCURACY_VERDICTS,
    estimateAccuracy,
    isClosedWorkStatus,
} = require('../src/services/metrics/estimateAccuracy');

describe('estimateAccuracy', () => {
    test('uses a single ±25% threshold by default', () => {
        expect(ESTIMATE_ACCURACY_THRESHOLD).toBe(0.25);
        const result = estimateAccuracy(100, 100);
        expect(result.lower_bound).toBe(0.75);
        expect(result.upper_bound).toBe(1.25);
        expect(result.threshold).toBe(0.25);
    });

    test.each([
        [100, 74, 0.74, ESTIMATE_ACCURACY_VERDICTS.PADDED, 'Over-estimated (padded)'],
        [100, 75, 0.75, ESTIMATE_ACCURACY_VERDICTS.ACCURATE, 'Accurate'],
        [100, 100, 1, ESTIMATE_ACCURACY_VERDICTS.ACCURATE, 'Accurate'],
        [100, 125, 1.25, ESTIMATE_ACCURACY_VERDICTS.ACCURATE, 'Accurate'],
        [100, 126, 1.26, ESTIMATE_ACCURACY_VERDICTS.BLEW_PAST, 'Under-estimated (blew past)'],
    ])('estimate=%p actual=%p returns ratio %p and verdict %p', (estimate, actual, ratio, verdict, label) => {
        expect(estimateAccuracy(estimate, actual)).toEqual(expect.objectContaining({
            ratio,
            verdict,
            label,
        }));
    });

    test('allows the threshold to be configured in one option', () => {
        expect(estimateAccuracy(100, 111, { threshold: 0.1 }).verdict)
            .toBe(ESTIMATE_ACCURACY_VERDICTS.BLEW_PAST);
        expect(estimateAccuracy(100, 110, { threshold: 0.1 }).verdict)
            .toBe(ESTIMATE_ACCURACY_VERDICTS.ACCURATE);
    });

    test('returns a null verdict when ratio cannot be computed', () => {
        expect(estimateAccuracy(0, 5)).toEqual(expect.objectContaining({
            ratio: null,
            verdict: null,
            label: null,
        }));
    });
});

describe('isClosedWorkStatus', () => {
    test.each(['Done', 'Closed', 'Completed', 'Released'])('%s is closed', status => {
        expect(isClosedWorkStatus(status)).toBe(true);
    });

    test.each(['Backlog', 'In Progress', 'Blocked', null, undefined])('%s is not closed', status => {
        expect(isClosedWorkStatus(status)).toBe(false);
    });
});
