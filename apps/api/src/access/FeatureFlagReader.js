'use strict';

const db = require('../config/db');

async function isEnabled(key, req) {
    if (req && req._featureFlagCache && Object.prototype.hasOwnProperty.call(req._featureFlagCache, key)) {
        return req._featureFlagCache[key];
    }
    const result = await db.query(
        'SELECT value FROM feature_flags WHERE key = $1',
        [key]
    );
    const value = result.rows.length > 0 ? Boolean(result.rows[0].value) : false;
    if (req) {
        req._featureFlagCache = req._featureFlagCache || {};
        req._featureFlagCache[key] = value;
    }
    return value;
}

function clearCache(req) {
    if (req) delete req._featureFlagCache;
}

module.exports = { isEnabled, clearCache };
