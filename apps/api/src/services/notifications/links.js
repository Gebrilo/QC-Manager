'use strict';

// entity_type → function(entityId) → frontend href. Later slices add entries.
const LINK_BUILDERS = {
    task: id => `/work/tasks/${id}`,
    bug: id => `/work/bugs/${id}`,
    user_story: id => `/work/stories/${id}`,
};

function buildLink(entityType, entityId) {
    const fn = LINK_BUILDERS[entityType];
    return fn ? fn(entityId) : null;
}

module.exports = { buildLink, LINK_BUILDERS };
