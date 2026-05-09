const { reconcileDeletes } = require('../../apps/api/src/services/tuleapReconcileDeletes');

function makePool(state) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) {
                return { rows: state.qcArtifactIds.map(id => ({ tuleap_artifact_id: id })) };
            }
            if (/SELECT tuleap_artifact_id FROM tasks WHERE/i.test(sql)) {
                return { rows: state.qcArtifactIds.map(id => ({ tuleap_artifact_id: id })) };
            }
            if (/SELECT tuleap_artifact_id FROM user_stories WHERE/i.test(sql)) {
                return { rows: state.qcArtifactIds.map(id => ({ tuleap_artifact_id: id })) };
            }
            if (/SELECT tuleap_artifact_id FROM test_case WHERE/i.test(sql)) {
                return { rows: state.qcArtifactIds.map(id => ({ tuleap_artifact_id: id })) };
            }
            if (/SELECT \* FROM tuleap_missing_artifact/i.test(sql)) {
                return { rows: state.missingRows.filter(r => r.tracker_type === params[0] && r.qc_project_id === params[1]) };
            }
            if (/INSERT INTO tuleap_missing_artifact/i.test(sql)) {
                return { rows: [{ tuleap_artifact_id: params[0], miss_count: 1 }], rowCount: 1 };
            }
            if (/UPDATE tuleap_missing_artifact[\s\S]*resolution = 'reappeared'/i.test(sql)) {
                return { rows: [], rowCount: 0 };
            }
            if (/UPDATE tuleap_missing_artifact[\s\S]*resolution = 'soft_deleted'/i.test(sql)) {
                return { rowCount: 1 };
            }
            if (/UPDATE tuleap_missing_artifact/i.test(sql)) {
                return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        },
    };
}

describe('reconcileDeletes', () => {
    test('no diff → no action', async () => {
        const pool = makePool({ qcArtifactIds: [42, 43], missingRows: [] });
        const result = await reconcileDeletes({
            presentIds: [42, 43],
            qcProjectId: 'project-uuid-1',
            trackerType: 'bug',
            pool,
            dispatchByType: { bug: jest.fn() },
            maxMissingPerCycle: 50,
        });
        expect(result.suspected).toEqual([]);
        expect(result.confirmedDeletes).toEqual([]);
        expect(result.aborted).toBe(false);
    });

    test('first miss does not delete, second miss does delete', async () => {
        const dispatch = jest.fn().mockResolvedValue({ action: 'deleted' });

        // Cycle 1: artifact 99 is in QC, NOT in present list → miss_count=1, no delete
        const poolA = makePool({ qcArtifactIds: [99], missingRows: [] });
        poolA.query = async (sql, params) => {
            if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) return { rows: [{ tuleap_artifact_id: 99 }] };
            if (/INSERT INTO tuleap_missing_artifact/i.test(sql)) return { rows: [], rowCount: 1 };
            if (/UPDATE tuleap_missing_artifact[\s\S]*resolved_at = NOW\(\), resolution = 'reappeared'/i.test(sql)) return { rows: [], rowCount: 0 };
            if (/SELECT tuleap_artifact_id FROM tuleap_missing_artifact[\s\S]*miss_count >= /i.test(sql)) return { rows: [] };
            return { rows: [], rowCount: 0 };
        };
        const r1 = await reconcileDeletes({
            presentIds: [],
            qcProjectId: 'project-uuid-1',
            trackerType: 'bug',
            pool: poolA,
            dispatchByType: { bug: dispatch },
        });
        expect(r1.suspected).toEqual([99]);
        expect(r1.confirmedDeletes).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();

        // Cycle 2: still missing. miss_count now 2. Should delete.
        const poolB = makePool({ qcArtifactIds: [99], missingRows: [] });
        poolB.query = async (sql, params) => {
            if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) return { rows: [{ tuleap_artifact_id: 99 }] };
            if (/INSERT INTO tuleap_missing_artifact/i.test(sql)) return { rows: [], rowCount: 1 };
            if (/SELECT tuleap_artifact_id FROM tuleap_missing_artifact[\s\S]*miss_count >= /i.test(sql)) {
                return { rows: [{ tuleap_artifact_id: 99 }] };
            }
            if (/UPDATE tuleap_missing_artifact[\s\S]*resolution = 'soft_deleted'/i.test(sql)) return { rowCount: 1 };
            return { rows: [], rowCount: 0 };
        };
        const r2 = await reconcileDeletes({
            presentIds: [],
            qcProjectId: 'project-uuid-1',
            trackerType: 'bug',
            pool: poolB,
            dispatchByType: { bug: dispatch },
        });
        expect(r2.suspected).toEqual([99]);
        expect(r2.confirmedDeletes).toEqual([99]);
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    test('circuit breaker aborts when suspected count exceeds threshold', async () => {
        const dispatch = jest.fn();
        const big = Array.from({ length: 60 }, (_, i) => 1000 + i);
        const pool = makePool({ qcArtifactIds: big, missingRows: [] });
        pool.query = async (sql, params) => {
            if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) {
                return { rows: big.map(id => ({ tuleap_artifact_id: id })) };
            }
            return { rows: [], rowCount: 0 };
        };
        const result = await reconcileDeletes({
            presentIds: [],
            qcProjectId: 'project-uuid-1',
            trackerType: 'bug',
            pool,
            dispatchByType: { bug: dispatch },
            maxMissingPerCycle: 50,
        });
        expect(result.aborted).toBe(true);
        expect(result.abortedReason).toMatch(/suspected_count=60/);
        expect(result.confirmedDeletes).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();
    });

    test('artifact reappears: clears the missing row, no delete', async () => {
        const dispatch = jest.fn();
        const pool = makePool({ qcArtifactIds: [50], missingRows: [] });
        let resolveCalled = false;
        pool.query = async (sql, params) => {
            if (/SELECT tuleap_artifact_id FROM bugs WHERE/i.test(sql)) return { rows: [{ tuleap_artifact_id: 50 }] };
            if (/UPDATE tuleap_missing_artifact[\s\S]*resolution = 'reappeared'/i.test(sql)) {
                resolveCalled = true;
                return { rows: [{ tuleap_artifact_id: 50 }] };
            }
            if (/SELECT tuleap_artifact_id FROM tuleap_missing_artifact[\s\S]*miss_count >= /i.test(sql)) return { rows: [] };
            return { rows: [], rowCount: 0 };
        };
        const result = await reconcileDeletes({
            presentIds: [50],
            qcProjectId: 'project-uuid-1',
            trackerType: 'bug',
            pool,
            dispatchByType: { bug: dispatch },
        });
        expect(result.suspected).toEqual([]);
        expect(result.recovered).toEqual([50]);
        expect(resolveCalled).toBe(true);
        expect(dispatch).not.toHaveBeenCalled();
    });
});