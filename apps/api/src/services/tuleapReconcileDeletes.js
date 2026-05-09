const TABLE_BY_TYPE = {
    bug: 'bugs',
    task: 'tasks',
    user_story: 'user_stories',
    test_case: 'test_case',
};

async function reconcileDeletes({
    presentIds,
    qcProjectId,
    trackerType,
    pool,
    dispatchByType,
    maxMissingPerCycle = 50,
    confirmThreshold = 2,
}) {
    if (!TABLE_BY_TYPE[trackerType]) {
        throw new Error(`Unknown tracker_type: ${trackerType}`);
    }
    const table = TABLE_BY_TYPE[trackerType];
    const presentSet = new Set(presentIds);

    const qcRowsRes = await pool.query(
        `SELECT tuleap_artifact_id FROM ${table} WHERE project_id = $1 AND tuleap_artifact_id IS NOT NULL AND deleted_at IS NULL`,
        [qcProjectId]
    );
    const qcIds = qcRowsRes.rows.map(r => r.tuleap_artifact_id);

    const suspected = qcIds.filter(id => !presentSet.has(id));
    const recoveredCandidates = qcIds.filter(id => presentSet.has(id));

    if (suspected.length > maxMissingPerCycle) {
        return {
            suspected,
            confirmedDeletes: [],
            recovered: [],
            aborted: true,
            abortedReason: `suspected_count=${suspected.length} exceeds maxMissingPerCycle=${maxMissingPerCycle}`,
        };
    }

    for (const artifactId of suspected) {
        await pool.query(
            `INSERT INTO tuleap_missing_artifact (tuleap_artifact_id, tracker_type, qc_project_id, miss_count, first_missed_at, last_missed_at)
             VALUES ($1, $2, $3, 1, NOW(), NOW())
             ON CONFLICT (tuleap_artifact_id, tracker_type) DO UPDATE SET
               miss_count = tuleap_missing_artifact.miss_count + 1,
               last_missed_at = NOW(),
               resolved_at = NULL,
               resolution = NULL`,
            [artifactId, trackerType, qcProjectId]
        );
    }

    const recovered = [];
    if (recoveredCandidates.length > 0) {
        const recRes = await pool.query(
            `UPDATE tuleap_missing_artifact
               SET resolved_at = NOW(), resolution = 'reappeared'
             WHERE tracker_type = $1
               AND qc_project_id = $2
               AND resolved_at IS NULL
               AND tuleap_artifact_id = ANY($3::int[])
             RETURNING tuleap_artifact_id`,
            [trackerType, qcProjectId, recoveredCandidates]
        );
        for (const row of recRes.rows) recovered.push(row.tuleap_artifact_id);
    }

    const toDeleteRes = await pool.query(
        `SELECT tuleap_artifact_id FROM tuleap_missing_artifact
           WHERE tracker_type = $1 AND qc_project_id = $2 AND resolved_at IS NULL AND miss_count >= $3`,
        [trackerType, qcProjectId, confirmThreshold]
    );

    const confirmedDeletes = [];
    const dispatch = dispatchByType[trackerType];
    if (!dispatch) {
        throw new Error(`No dispatcher registered for tracker_type=${trackerType}`);
    }

    for (const row of toDeleteRes.rows) {
        const artifactId = row.tuleap_artifact_id;
        try {
            await dispatch(
                { action: 'delete', tuleap: { artifact_id: artifactId }, project_id: qcProjectId },
                { qc_project_id: qcProjectId, tracker_type: trackerType },
                { query: pool.query.bind(pool) }
            );
            await pool.query(
                `UPDATE tuleap_missing_artifact
                   SET resolved_at = NOW(), resolution = 'soft_deleted'
                 WHERE tuleap_artifact_id = $1 AND tracker_type = $2`,
                [artifactId, trackerType]
            );
            confirmedDeletes.push(artifactId);
        } catch (err) {
            console.warn(`[reconcile-deletes] dispatch_failed tracker_type=${trackerType} artifact_id=${artifactId} err="${err.message}"`);
        }
    }

    return {
        suspected,
        confirmedDeletes,
        recovered,
        aborted: false,
        abortedReason: null,
    };
}

module.exports = { reconcileDeletes, TABLE_BY_TYPE };