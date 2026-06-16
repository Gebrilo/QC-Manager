const { toTuleap } = require('../tuleapTransformEngine');
const { defaultRegistry } = require('../tuleapFieldRegistry');
const { defaultClient } = require('../tuleapClient');
const { dispatchAction } = require('../persisters/test_case');

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
            console.log(`[emit:test_case] skip optional bind '${value}' for '${tuleapFieldName}' — ${err.message}`);
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
          console.log(`[emit:test_case] skip optional bind '${fieldValue}' for '${tuleapFieldName}' — ${err.message}`);
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
        console.log(`[emit:test_case] skip non-numeric int '${tuleapFieldName}'='${fieldValue}'`);
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

async function emitToTuleap(unified, config, mode, deps = {}) {
  try {
    const client = deps.client || defaultClient;
    const registry = deps.registry || defaultRegistry;
    const trackerId = config.tuleap_tracker_id;
    const valueMaps = config.value_maps || {};
    const baseUrl = config.tuleap_base_url || process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';

    if (mode === 'delete') {
      const artifactId = unified.tuleap?.artifact_id;
      if (!artifactId) throw new Error('tuleap.artifact_id required for delete');

      await client.delete(`/artifacts/${artifactId}`);
      console.log(`[emit:test_case] tuleap_delete_ok artifact_id=${artifactId} project=${config.qc_project_id}`);

      try {
        await dispatchAction(
          { ...unified, action: 'delete', tuleap: { ...(unified.tuleap || {}), artifact_id: artifactId } },
          config,
          { query: deps.query }
        );
        console.log(`[emit:test_case] persist_delete_ok artifact_id=${artifactId}`);
      } catch (persistErr) {
        console.warn(`[emit:test_case] persist_delete_failed artifact_id=${artifactId} err="${persistErr.message}" — drift; poll will repair`);
      }

      return { deleted: true };
    }

    if (mode === 'update' && !unified.tuleap?.artifact_id) {
      throw new Error('tuleap.artifact_id required for update');
    }

    const effectiveConfig = { ...config, tracker_type: 'test_case' };
    const mappedPayload = toTuleap(unified, effectiveConfig);

    for (const [key, val] of Object.entries(mappedPayload)) {
      if (key === 'status') {
        mappedPayload[key] = applyValueMap(key, val, valueMaps) || val;
      } else if (valueMaps[key]) {
        mappedPayload[key] = applyValueMap(key, val, valueMaps);
      }
    }

    const values = await buildTuleapValues(mappedPayload, trackerId, registry);

    if (mode === 'update') {
      const artifactId = unified.tuleap?.artifact_id;
      if (!artifactId) throw new Error('tuleap.artifact_id required for update');
      try {
        await client.put(`/artifacts/${artifactId}`, { values });
      } catch (updateErr) {
        if (updateErr.status === 400 && /transition/i.test(updateErr.message)) {
          const { status: _s, ...restPayload } = mappedPayload;
          const retryValues = await buildTuleapValues(restPayload, trackerId, registry);
          await client.put(`/artifacts/${artifactId}`, { values: retryValues });
          console.warn(`[emit:test_case] retry_without_status artifact_id=${artifactId} — workflow transition rejected`);
        } else {
          throw updateErr;
        }
      }
      console.log(`[emit:test_case] tuleap_update_ok artifact_id=${artifactId} project=${config.qc_project_id}`);

      try {
        await dispatchAction(
          { ...unified, action: 'sync', tuleap: { ...(unified.tuleap || {}), artifact_id: artifactId } },
          config,
          { query: deps.query }
        );
        console.log(`[emit:test_case] persist_update_ok artifact_id=${artifactId}`);
      } catch (persistErr) {
        console.warn(`[emit:test_case] persist_update_failed artifact_id=${artifactId} err="${persistErr.message}" — drift; poll will repair`);
      }

      return { updated: true, tuleap_artifact_id: artifactId };
    }

    const payload = { tracker: { id: trackerId }, values };
    const response = await client.post('/artifacts', payload);
    const artifact = response.data;
    const newTuleapUrl = `${baseUrl}/plugins/tracker/?aid=${artifact.id}`;
    console.log(`[emit:test_case] tuleap_create_ok artifact_id=${artifact.id} project=${config.qc_project_id}`);

    if (!deps.skipPersist) {
      try {
        await dispatchAction(
          {
            ...unified,
            action: 'sync',
            tuleap: { ...(unified.tuleap || {}), artifact_id: artifact.id, url: newTuleapUrl },
          },
          config,
          { query: deps.query }
        );
        console.log(`[emit:test_case] persist_create_ok artifact_id=${artifact.id}`);
      } catch (persistErr) {
        console.warn(`[emit:test_case] persist_create_failed artifact_id=${artifact.id} err="${persistErr.message}" — drift; poll will repair`);
      }
    }

    return {
      tuleap_artifact_id: artifact.id,
      tuleap_url: newTuleapUrl,
      artifact_type: 'test_case',
      xref: artifact.xref || null,
    };
  } catch (err) {
    console.error(`[emit:test_case] tuleap_${mode}_failed project=${config?.qc_project_id} err="${err.message}" status=${err.status || 'unknown'}`);
    throw err;
  }
}

module.exports = { emitToTuleap };
