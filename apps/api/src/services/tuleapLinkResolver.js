const TYPE_TO_TABLE = {
  test_case: 'test_case',
  task: 'tasks',
  user_story: 'user_stories',
  bug: 'bugs',
};

const PENDING_TABLES = ['bugs', 'tasks', 'user_stories', 'test_case'];

const PENDING_LINK_FIELDS = {
  bugs: { test_case: 'linked_test_case_ids' },
};

async function resolveLinks({ qcProjectId, tuleapLinks, query }) {
  const resolved = [];
  const pending = [];
  if (!Array.isArray(tuleapLinks) || tuleapLinks.length === 0) {
    return { resolved, pending };
  }

  for (const link of tuleapLinks) {
    const table = TYPE_TO_TABLE[link.type];
    if (!table) continue;

    const tuleapId = Number(link.target_artifact_id);
    const result = await query(
      `SELECT id FROM ${table} WHERE tuleap_artifact_id = $1 LIMIT 1`,
      [tuleapId]
    );
    if (result.rows.length > 0) {
      resolved.push({ type: link.type, qc_id: result.rows[0].id, tuleap_id: tuleapId });
    } else {
      pending.push({ type: link.type, tuleap_id: tuleapId });
    }
  }
  return { resolved, pending };
}

async function drainPending({ qcProjectId, justPersistedQcId, justPersistedQcType, justPersistedTuleapId, query }) {
  let resolvedCount = 0;

  for (const table of PENDING_TABLES) {
    let selectResult;
    try {
      selectResult = await query(
        `SELECT id, pending_links FROM ${table} WHERE pending_links @> $1::jsonb`,
        [JSON.stringify([{ type: justPersistedQcType, tuleap_id: justPersistedTuleapId }])]
      );
    } catch {
      continue;
    }

    if (!selectResult || !selectResult.rows) continue;

    for (const row of selectResult.rows) {
      const pending = Array.isArray(row.pending_links) ? row.pending_links : [];
      const matching = pending.filter(p =>
        p.type === justPersistedQcType && p.tuleap_id === justPersistedTuleapId
      );
      const remaining = pending.filter(p =>
        !(p.type === justPersistedQcType && p.tuleap_id === justPersistedTuleapId)
      );

      const linkColumn = (PENDING_LINK_FIELDS[table] || {})[justPersistedQcType];
      if (linkColumn) {
        await query(
          `UPDATE ${table}
              SET pending_links = $1::jsonb,
                  ${linkColumn} = ARRAY(SELECT DISTINCT unnest(COALESCE(${linkColumn}, ARRAY[]::uuid[]) || $2::uuid[]))
            WHERE id = $3`,
          [JSON.stringify(remaining), [justPersistedQcId], row.id]
        );
      } else {
        await query(
          `UPDATE ${table} SET pending_links = $1::jsonb WHERE id = $2`,
          [JSON.stringify(remaining), row.id]
        );
      }
      if (matching.length > 0) resolvedCount += 1;
    }
  }

  return { resolvedCount };
}

module.exports = { resolveLinks, drainPending, TYPE_TO_TABLE };
