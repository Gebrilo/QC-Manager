'use strict';

const {
    WORKLOAD_BALANCE_STATUS,
    WORKLOAD_BALANCE_LOWER,
    WORKLOAD_BALANCE_UPPER,
    classifyWorkloadBalance,
} = require('../src/services/metrics/workloadBalance');

describe('classifyWorkloadBalance', () => {
    test('exposes the tolerance band constants', () => {
        expect(WORKLOAD_BALANCE_LOWER).toBe(0.9);
        expect(WORKLOAD_BALANCE_UPPER).toBe(1.1);
    });

    test('returns NO_TASKS when there are no tasks', () => {
        expect(classifyWorkloadBalance(10, 0)).toBe(WORKLOAD_BALANCE_STATUS.NO_TASKS);
        expect(classifyWorkloadBalance(0, 0)).toBe(WORKLOAD_BALANCE_STATUS.NO_TASKS);
    });

    test('returns NO_TESTS when there are tasks but no completed runs', () => {
        expect(classifyWorkloadBalance(0, 5)).toBe(WORKLOAD_BALANCE_STATUS.NO_TESTS);
    });

    test('returns BALANCED when runs equal tasks (7/7)', () => {
        expect(classifyWorkloadBalance(7, 7)).toBe(WORKLOAD_BALANCE_STATUS.BALANCED);
    });

    test('returns OVER_TESTED when runs exceed the upper band (10/7)', () => {
        expect(classifyWorkloadBalance(10, 7)).toBe(WORKLOAD_BALANCE_STATUS.OVER_TESTED);
    });

    test('returns UNDER_TESTED when runs fall below the lower band (5/7)', () => {
        expect(classifyWorkloadBalance(5, 7)).toBe(WORKLOAD_BALANCE_STATUS.UNDER_TESTED);
    });

    test('band edges are inclusive for BALANCED', () => {
        // ratio exactly 0.9 and exactly 1.1 are BALANCED
        expect(classifyWorkloadBalance(9, 10)).toBe(WORKLOAD_BALANCE_STATUS.BALANCED);   // 0.90
        expect(classifyWorkloadBalance(11, 10)).toBe(WORKLOAD_BALANCE_STATUS.BALANCED);  // 1.10
        expect(classifyWorkloadBalance(12, 10)).toBe(WORKLOAD_BALANCE_STATUS.OVER_TESTED);  // 1.20
        expect(classifyWorkloadBalance(8, 10)).toBe(WORKLOAD_BALANCE_STATUS.UNDER_TESTED);  // 0.80
    });

    test('honours caller-provided band overrides', () => {
        // ratio 1.10 is normally BALANCED; tightening upper to 1.0 makes it OVER_TESTED
        expect(classifyWorkloadBalance(11, 10, { upper: 1.0 })).toBe(WORKLOAD_BALANCE_STATUS.OVER_TESTED);
        // ratio 0.80 is normally UNDER_TESTED; loosening lower to 0.7 makes it BALANCED
        expect(classifyWorkloadBalance(8, 10, { lower: 0.7 })).toBe(WORKLOAD_BALANCE_STATUS.BALANCED);
    });

    test('coerces string/Postgres-style counts and guards bad input', () => {
        expect(classifyWorkloadBalance('7', '7')).toBe(WORKLOAD_BALANCE_STATUS.BALANCED);
        expect(classifyWorkloadBalance(null, 5)).toBe(WORKLOAD_BALANCE_STATUS.NO_TESTS);
        expect(classifyWorkloadBalance(undefined, undefined)).toBe(WORKLOAD_BALANCE_STATUS.NO_TASKS);
    });
});
