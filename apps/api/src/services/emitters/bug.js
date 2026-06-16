const { toTuleap } = require('../tuleapTransformEngine');
const { defaultRegistry } = require('../tuleapFieldRegistry');
const { defaultClient } = require('../tuleapClient');
const { dispatchAction } = require('../persisters/bug');
const { normalizeBugSeverity } = require('../normalizers/bug');

const SEVERITY_TO_TULEAP = {
  'None': '',
  'Cosmetic impact': 'Cosmetic impact',
  'Minor Impact': 'Minor impact',
  'Major impact': 'Major impact',
  'Critical Impact': 'Critical impact',
};

function applyValueMap(fieldName, value, valueMaps) {
  if (!valueMaps || !valueMaps[fieldName] || value === null || value === undefined) return value;
  return valueMaps[fieldName][value] || value;
}

async function buildTuleapValues(tuleapPayload, trackerId, registry) {
  const values = [];
  for (const [tuleapFieldName, fieldValue] of Object.entries(tuleapPayload)) {
    if (fieldValue === undefined || fieldValue === null) continue;

    let field;
    try {
      field = await registry.getField(trackerId, tuleapFieldName);
    } catch {
      continue;
    }

    let shape;
    if (['sb', 'rb', 'msb', 'cb'].includes(field.type)) {
      if (fieldValue === '') continue;
      if (Array.isArray(fieldValue)) {
        const boundIds = [];
        for (const value of fieldValue) {
          try {
            const bound = await registry.resolveBindValue(trackerId, tuleapFieldName, value);
            boundIds.push(bound.id);
          } catch (err) {
            if (field.required) throw err;
            console.log(`[emit:bug] skip optional bind '${value}' for '${tuleapFieldName}' — ${err.message}`);
          }
        }
        if (boundIds.length === 0) continue;
        shape = { bind_value_ids: boundIds };
      } else {
        let bound;
        try {
          bound = await registry.resolveBindValue(trackerId, tuleapFieldName, fieldValue);
        } catch (err) {
          if (field.required) throw err;
          console.log(`[emit:bug] skip optional bind '${fieldValue}' for '${tuleapFieldName}' — ${err.message}`);
          continue;
        }
        shape = { bind_value_ids: [bound.id] };
      }
    } else if (field.type === 'art_link') {
      const raw = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      const links = raw.map(id => Number(id)).filter(id => !isNaN(id)).map(id => ({ id }));
      if (links.length === 0) continue;
      shape = { links };
    } else if (field.type === 'int') {
      const n = parseInt(fieldValue, 10);
      if (Number.isNaN(n)) {
        console.log(`[emit:bug] skip non-numeric int '${tuleapFieldName}'='${fieldValue}'`);
        continue;
      }
      shape = { value: n };
    } else if (field.type === 'float' || field.type === 'computed') {
      const n = Number(fieldValue);
      if (Number.isNaN(n)) continue;
      shape = { value: n };
    } else {
      shape = { value: fieldValue };
    }

    values.push({ field_id: field.field_id, ...shape });
  }
  return values;
}

async function resolveLinkedIds(linkedIds, query) {
  if (!Array.isArray(linkedIds) || linkedIds.length === 0) return [];
  const tuleapIds = [];
  for (const qcId of linkedIds) {
    const result = await query('SELECT tuleap_artifact_id FROM test_cases WHERE id = $1', [qcId]);
    if (result.rows.length > 0 && result.rows[0].tuleap_artifact_id) {
      tuleapIds.push(result.rows[0].tuleap_artifact_id);
    }
  }
  return tuleapIds;
}

async function emitToTuleap(unified, config, mode, deps = {}) {
  try {
    const client = deps.client || defaultClient;
    const registry = deps.registry || defaultRegistry;
    const query = deps.query || null;
    const trackerId = config.tuleap_tracker_id;
    const valueMaps = config.value_maps || {};
    const baseUrl = config.tuleap_base_url || process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';

    if (mode === 'delete') {
      const artifactId = unified.tuleap?.artifact_id;
      if (!artifactId) throw new Error('tuleap.artifact_id required for delete');

      await client.delete(`/artifacts/${artifactId}`);
      console.log(`[emit:bug] tuleap_delete_ok artifact_id=${artifactId} project=${config.qc_project_id}`);

      try {
        await dispatchAction(
          { ...unified, action: 'delete', tuleap: { ...(unified.tuleap || {}), artifact_id: artifactId } },
          config,
          { query: deps.query }
        );
        console.log(`[emit:bug] persist_delete_ok artifact_id=${artifactId}`);
      } catch (persistErr) {
        console.warn(`[emit:bug] persist_delete_failed artifact_id=${artifactId} err="${persistErr.message}" — drift; poll will repair`);
      }

      return { deleted: true };
    }

    const statusMap = config.status_value_map || {};
    const mappedPayload = toTuleap(unified, config);

    for (const [key, val] of Object.entries(mappedPayload)) {
      if (key === 'status') {
        mappedPayload[key] = applyValueMap(key, val, valueMaps) || val;
      } else if (key === 'severity') {
        const hasSeverityMap = valueMaps && valueMaps[key] && valueMaps[key][val] != null;
        if (hasSeverityMap) {
          mappedPayload[key] = valueMaps[key][val];
        } else {
          // Normalize raw input ('critical', 'high') to QC canonical, then map to Tuleap label.
          const canonical = normalizeBugSeverity(val);
          mappedPayload[key] = SEVERITY_TO_TULEAP[canonical] !== undefined ? SEVERITY_TO_TULEAP[canonical] : canonical;
        }
      } else if (valueMaps[key]) {
        mappedPayload[key] = applyValueMap(key, val, valueMaps);
      }
    }

    if (mappedPayload.linked_test_case_ids && query) {
      const tuleapIds = await resolveLinkedIds(mappedPayload.linked_test_case_ids, query);
      if (tuleapIds.length > 0) {
        mappedPayload['test-case'] = tuleapIds;
      }
      delete mappedPayload.linked_test_case_ids;
    }

    const values = await buildTuleapValues(mappedPayload, trackerId, registry);

    if (mode === 'update') {
      const artifactId = unified.tuleap?.artifact_id;
      if (!artifactId) throw new Error('tuleap.artifact_id required for update');
      await client.put(`/artifacts/${artifactId}`, { values });
      console.log(`[emit:bug] tuleap_update_ok artifact_id=${artifactId} project=${config.qc_project_id}`);

      try {
        await dispatchAction(
          { ...unified, action: 'sync', tuleap: { ...(unified.tuleap || {}), artifact_id: artifactId } },
          config,
          { query: deps.query }
        );
        console.log(`[emit:bug] persist_update_ok artifact_id=${artifactId}`);
      } catch (persistErr) {
        console.warn(`[emit:bug] persist_update_failed artifact_id=${artifactId} err="${persistErr.message}" — drift; poll will repair`);
      }

      return { updated: true, tuleap_artifact_id: artifactId };
    }

    const payload = { tracker: { id: trackerId }, values };
    const response = await client.post('/artifacts', payload);
    const artifact = response.data;
    const newTuleapUrl = `${baseUrl}/plugins/tracker/?aid=${artifact.id}`;
    console.log(`[emit:bug] tuleap_create_ok artifact_id=${artifact.id} project=${config.qc_project_id}`);

    let persistResult;
    try {
      persistResult = await dispatchAction(
        {
          ...unified,
          action: 'sync',
          tuleap: { ...(unified.tuleap || {}), artifact_id: artifact.id, url: newTuleapUrl },
        },
        config,
        { query: deps.query }
      );
      console.log(`[emit:bug] persist_create_ok artifact_id=${artifact.id}`);
    } catch (persistErr) {
      console.warn(`[emit:bug] persist_create_failed artifact_id=${artifact.id} err="${persistErr.message}" — drift; poll will repair`);
    }

    return {
      tuleap_artifact_id: artifact.id,
      tuleap_url: newTuleapUrl,
      qc_id: persistResult?.id || null,
      artifact_type: 'bug',
      xref: artifact.xref || null,
    };
  } catch (err) {
    console.error(`[emit:bug] tuleap_${mode}_failed project=${config?.qc_project_id} err="${err.message}" status=${err.status || 'unknown'}`);
    throw err;
  }
}

module.exports = { emitToTuleap };
