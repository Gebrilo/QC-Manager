const { defaultClient } = require('./tuleapClient');

const CACHE_TTL_MS = 5 * 60 * 1000;

class FieldRegistry {
  constructor(client = defaultClient) {
    this._client = client;
    this._cache = new Map();
  }

  async _load(trackerId) {
    const cached = this._cache.get(trackerId);
    if (cached && Date.now() < cached.expiresAt) return cached.fields;

    const { data } = await this._client.get(`/trackers/${trackerId}/used_fields`);
    const fields = new Map(data.map(f => [f.name, f]));
    this._cache.set(trackerId, { fields, expiresAt: Date.now() + CACHE_TTL_MS });
    return fields;
  }

  async getField(trackerId, fieldName) {
    const fields = await this._load(trackerId);
    const f = fields.get(fieldName);
    if (!f) throw new Error(`Field '${fieldName}' not found in tracker ${trackerId}`);
    return f;
  }

  async getFieldId(trackerId, fieldName) {
    return (await this.getField(trackerId, fieldName)).field_id;
  }

  async resolveBindValue(trackerId, fieldName, label) {
    const f = await this.getField(trackerId, fieldName);
    const match = (f.values || []).find(v => v.label === label);
    if (!match) throw new Error(
      `Bind value '${label}' not found for field '${fieldName}' in tracker ${trackerId}. ` +
      `Available: ${(f.values || []).map(v => v.label).join(', ')}`
    );
    return { id: match.id };
  }
}

const defaultRegistry = new FieldRegistry();
module.exports = { FieldRegistry, defaultRegistry };
