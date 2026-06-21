import type { LinkedArtifactRow } from '@/components/shared/LinkedArtifactsSection';
import { artifactPath } from '@/lib/artifactPath';

/** Minimal structural shape of a test-run execution needed to derive the
 *  "Executed Test Cases" linked-artifact rows. Mirrors the relevant fields of
 *  the page-level TestRunExecutionItem, but tolerant of the nulls the API
 *  actually returns for imported (Excel/CSV) executions. */
export interface ExecutedCaseExecution {
    id: string;
    test_case_uuid?: string | null;
    test_case_id?: string | null;
    test_case_id_display?: string | null;
    test_case_title?: string | null;
    status?: string;
}

/**
 * Build the rows for the "Executed Test Cases" linked-artifacts section.
 *
 * Excel/CSV-imported executions are inserted with a NULL test_case_id (the
 * test-case label is kept in the execution notes instead), so they have no
 * linked test case artifact: both test_case_uuid and test_case_id come back
 * null. Such executions are skipped here — they still appear in the executions
 * table on the page. Skipping them also avoids dereferencing a null id with
 * `.slice` ("Cannot read properties of null (reading 'slice')").
 */
export function buildExecutedTestCaseRows(executions: ExecutedCaseExecution[]): LinkedArtifactRow[] {
    const byCaseId = new Map<string, ExecutedCaseExecution>();
    for (const execution of executions) {
        const artifactId = execution.test_case_uuid || execution.test_case_id;
        if (!artifactId) continue;
        if (!byCaseId.has(artifactId)) byCaseId.set(artifactId, execution);
    }
    return Array.from(byCaseId.entries()).map(([artifactId, execution]) => ({
        id: `run-case-${execution.id}`,
        artifactId,
        displayId: execution.test_case_id_display || execution.test_case_id || artifactId.slice(0, 8),
        title: execution.test_case_title || '(no title)',
        status: execution.status,
        href: execution.test_case_uuid ? artifactPath('test_case', { id: execution.test_case_uuid, test_case_id: execution.test_case_id_display || execution.test_case_id }) : undefined,
        source: 'qc' as const,
        relationshipType: 'executes',
        derived: true,
    }));
}
