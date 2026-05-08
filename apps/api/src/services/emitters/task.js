const { toTuleap } = require('../tuleapTransformEngine');
const { defaultRegistry } = require('../tuleapFieldRegistry');
const { defaultClient } = require('../tuleapClient');

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
      if (Array.isArray(fieldValue)) {
        const boundIds = await Promise.all(
          fieldValue.map(v => registry.resolveBindValue(trackerId, tuleapFieldName, v).then(b => b.id))
        );
        shape = { bind_value_ids: boundIds };
      } else {
        const bound = await registry.resolveBindValue(trackerId, tuleapFieldName, fieldValue);
        shape = { bind_value_ids: [bound.id] };
      }
    } else if (field.type === 'art_link') {
      const raw = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      const links = raw.map(id => Number(id)).filter(id => !isNaN(id)).map(id => ({ id }));
      if (links.length === 0) continue;
      shape = { links };
    } else {
      shape = { value: fieldValue };
    }

    values.push({ field_id: field.field_id, ...shape });
  }
  return values;
}

async function emitToTuleap(unified, config, mode, deps = {}) {
  const client = deps.client || defaultClient;
  const registry = deps.registry || defaultRegistry;
  const trackerId = config.tuleap_tracker_id;
  const valueMaps = config.value_maps || {};
  const baseUrl = config.tuleap_base_url || process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';

  if (mode === 'delete') {
    const artifactId = unified.tuleap?.artifact_id;
    if (!artifactId) throw new Error('tuleap.artifact_id required for delete');
    await client.delete(`/artifacts/${artifactId}`);
    return { deleted: true };
  }

  const mappedPayload = toTuleap(unified, config);

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
    await client.put(`/artifacts/${artifactId}`, { values });
    return { updated: true, tuleap_artifact_id: artifactId };
  }

  const payload = { tracker: { id: trackerId }, values };
  const response = await client.post('/artifacts', payload);
  const artifact = response.data;

  return {
    tuleap_artifact_id: artifact.id,
    tuleap_url: `${baseUrl}/plugins/tracker/?aid=${artifact.id}`,
    artifact_type: 'task',
    xref: artifact.xref || null,
  };
}

module.exports = { emitToTuleap };