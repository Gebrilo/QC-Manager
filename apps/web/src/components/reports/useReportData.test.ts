import { describe, it, expect, vi, beforeEach } from 'vitest';

// fetchProjectStatus pulls project health rows off the API. The `pg` driver
// serializes Postgres `bigint`/`COUNT(*)` columns (e.g. v_workload_balance.total_tasks,
// which lacks the `::INTEGER` cast the other governance views use) as JS *strings*.
// So `total_tasks` arrives over the wire as "20", "1", … not 20, 1, ….
vi.mock('@/services/governanceApi', () => ({
    getReleaseReadiness: vi.fn(),
    getExecutionTrend: vi.fn(),
    getBugSummary: vi.fn(),
    getProjectHealth: vi.fn(),
    getTestCoverage: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ fetchApi: vi.fn() }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: vi.fn() }));

import { fetchProjectStatus } from './useReportData';
import { getProjectHealth } from '@/services/governanceApi';

const mockedGetProjectHealth = vi.mocked(getProjectHealth);

describe('fetchProjectStatus — "Total tasks" KPI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sums per-project task counts numerically when the API returns them as strings', async () => {
        // Per-project counts as the API actually sends them (pg bigint -> string).
        mockedGetProjectHealth.mockResolvedValue([
            { project_id: 'a', project_name: 'Alpha', overall_health_status: 'GREEN', latest_pass_rate_pct: '90', latest_failed_count: 0, total_tasks: '20' },
            { project_id: 'b', project_name: 'Beta',  overall_health_status: 'AMBER', latest_pass_rate_pct: '50', latest_failed_count: 2, total_tasks: '1' },
            { project_id: 'c', project_name: 'Gamma', overall_health_status: 'RED',   latest_pass_rate_pct: '10', latest_failed_count: 5, total_tasks: '17' },
        ] as unknown as Awaited<ReturnType<typeof getProjectHealth>>);

        const result = await fetchProjectStatus({});
        const totalTasksKpi = result.kpis.find(k => k.label === 'Total tasks');

        // Regression: must be the arithmetic sum "38", not the string concatenation
        // "0" + "20" + "1" + "17" => "020117" that the user saw as 02011000017.
        expect(totalTasksKpi?.value).toBe('38');
    });
});
