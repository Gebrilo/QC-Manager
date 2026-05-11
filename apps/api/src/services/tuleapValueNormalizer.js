function getKey(v, tracker) {
  if (v.name) return v.name;
  if (tracker && tracker.fields instanceof Map && v.field_id != null) {
    for (const f of tracker.fields.values()) {
      if (f.field_id === v.field_id) return f.name;
    }
  }
  if (tracker && Array.isArray(tracker.fields) && v.field_id != null) {
    const f = tracker.fields.find(x => x.field_id === v.field_id);
    if (f) return f.name;
  }
  return v.label || null;
}

function valueFromInlineValues(values) {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const labels = values.map(item => {
    if (item && typeof item === 'object') {
      return item.label != null ? item.label : (item.display_name || item.name);
    }
    return item;
  });
  if (labels.length === 1) return labels[0];
  return labels;
}

function valueFromBindIds(bindIds, fieldName, tracker) {
  if (!Array.isArray(bindIds) || bindIds.length === 0) return undefined;
  if (!tracker || !Array.isArray(tracker.fields)) return undefined;
  const field = tracker.fields.find(f => f.name === fieldName);
  if (!field || !Array.isArray(field.values)) return undefined;
  const labels = bindIds
    .map(id => {
      const match = field.values.find(opt => opt.id === id);
      return match ? match.label : undefined;
    })
    .filter(l => l !== undefined);
  if (labels.length === 0) return undefined;
  if (labels.length === 1) return labels[0];
  return labels;
}

function normalize(rawTuleapPayload, tracker) {
  const out = {};
  const values = (rawTuleapPayload && rawTuleapPayload.values) || [];
  for (const v of values) {
    const key = getKey(v, tracker);
    if (!key) continue;

    if (v.value !== undefined && v.value !== null) {
      out[key] = v.value;
      continue;
    }

    const inline = valueFromInlineValues(v.values);
    if (inline !== undefined) {
      out[key] = inline;
      continue;
    }

    const resolved = valueFromBindIds(v.bind_value_ids, key, tracker);
    if (resolved !== undefined) {
      out[key] = resolved;
      continue;
    }
  }
  return out;
}

module.exports = { normalize };
