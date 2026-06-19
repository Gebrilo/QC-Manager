const RELATIONSHIP_TYPES_BY_PAIR = Object.freeze({
    task_test_cases: Object.freeze(['covers', 'verified by']),
    bug_test_cases: Object.freeze(['reveals', 'found in']),
    bug_tasks: Object.freeze(['blocks', 'is blocked by', 'relates to']),
    bug_user_stories: Object.freeze(['affects', 'relates to']),
    test_case_user_stories: Object.freeze(['verifies', 'relates to']),
    story_suites: Object.freeze(['validated by', 'relates to']),
    story_runs: Object.freeze(['validated by', 'relates to']),
    task_runs: Object.freeze(['exercised by', 'relates to']),
    bug_runs: Object.freeze(['found in', 'relates to']),
});

const INVERSE_RELATIONSHIP_LABELS = Object.freeze({
    covers: 'covered by',
    'covered by': 'covers',
    verifies: 'verified by',
    'verified by': 'verifies',
    reveals: 'revealed by',
    'revealed by': 'reveals',
    'found in': 'finds',
    finds: 'found in',
    'validated by': 'validates',
    validates: 'validated by',
    'exercised by': 'exercises',
    exercises: 'exercised by',
    blocks: 'is blocked by',
    'is blocked by': 'blocks',
    affects: 'affected by',
    'affected by': 'affects',
    'relates to': 'relates to',
});

function getAllowedRelationshipTypes(table) {
    return RELATIONSHIP_TYPES_BY_PAIR[table] || [];
}

function getDefaultRelationshipType(table) {
    return getAllowedRelationshipTypes(table)[0];
}

function isAllowedRelationshipType(table, relationshipType) {
    return typeof relationshipType === 'string' && getAllowedRelationshipTypes(table).includes(relationshipType);
}

function getInverseRelationshipLabel(relationshipType) {
    return INVERSE_RELATIONSHIP_LABELS[relationshipType] || relationshipType;
}

module.exports = {
    RELATIONSHIP_TYPES_BY_PAIR,
    INVERSE_RELATIONSHIP_LABELS,
    getAllowedRelationshipTypes,
    getDefaultRelationshipType,
    isAllowedRelationshipType,
    getInverseRelationshipLabel,
};
