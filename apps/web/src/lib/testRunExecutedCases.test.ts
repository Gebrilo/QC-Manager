import { describe, it, expect } from 'vitest';
import { buildExecutedTestCaseRows, type ExecutedCaseExecution } from './testRunExecutedCases';

describe('buildExecutedTestCaseRows', () => {
    // Regression: Excel/CSV-imported executions have NULL test_case_id and
    // test_case_uuid. The previous inline mapping called `.slice` on the null
    // id, crashing the run details page with
    // "Cannot read properties of null (reading 'slice')".
    it('skips imported executions with no linked test case instead of throwing', () => {
        const executions: ExecutedCaseExecution[] = [
            { id: 'e1', test_case_uuid: null, test_case_id: null, status: 'pass' },
            { id: 'e2', test_case_uuid: null, test_case_id: null, status: 'fail' },
        ];

        expect(() => buildExecutedTestCaseRows(executions)).not.toThrow();
        expect(buildExecutedTestCaseRows(executions)).toEqual([]);
    });

    it('maps executions linked to a real test case', () => {
        const executions: ExecutedCaseExecution[] = [
            {
                id: 'e1',
                test_case_uuid: 'uuid-1234abcd',
                test_case_id: 'TC-001',
                test_case_id_display: 'TC-001',
                test_case_title: 'Login works',
                status: 'pass',
            },
        ];

        expect(buildExecutedTestCaseRows(executions)).toEqual([
            {
                id: 'run-case-e1',
                artifactId: 'uuid-1234abcd',
                displayId: 'TC-001',
                title: 'Login works',
                status: 'pass',
                href: '/test/cases/uuid-1234abcd',
                source: 'qc',
                relationshipType: 'executes',
                derived: true,
            },
        ]);
    });

    it('deduplicates by test case and only keeps real ones from a mixed run', () => {
        const executions: ExecutedCaseExecution[] = [
            { id: 'e1', test_case_uuid: null, test_case_id: null, status: 'pass' },
            { id: 'e2', test_case_uuid: 'uuid-aaaa1111', test_case_id: 'TC-010', status: 'pass' },
            { id: 'e3', test_case_uuid: 'uuid-aaaa1111', test_case_id: 'TC-010', status: 'fail' },
        ];

        const rows = buildExecutedTestCaseRows(executions);
        expect(rows).toHaveLength(1);
        expect(rows[0].artifactId).toBe('uuid-aaaa1111');
        expect(rows[0].id).toBe('run-case-e2');
    });

    it('falls back to a sliced id when no display id is present', () => {
        const executions: ExecutedCaseExecution[] = [
            { id: 'e1', test_case_uuid: 'uuid-1234abcd5678', test_case_id: null, status: 'pass' },
        ];

        expect(buildExecutedTestCaseRows(executions)[0].displayId).toBe('uuid-123');
    });
});
