const {
    getAllowedRelationshipTypes,
    getDefaultRelationshipType,
    getInverseRelationshipLabel,
    isAllowedRelationshipType,
} = require('../src/utils/linkRelationships');

describe('link relationship vocabulary', () => {
    test('exposes curated allowed types with defaults for existing link pairs', () => {
        expect(getAllowedRelationshipTypes('task_test_cases')).toEqual(['covers', 'verified by']);
        expect(getAllowedRelationshipTypes('bug_test_cases')).toEqual(['reveals', 'found in']);
        expect(getAllowedRelationshipTypes('bug_tasks')).toEqual(['blocks', 'is blocked by', 'relates to']);
        expect(getAllowedRelationshipTypes('bug_user_stories')).toEqual(['affects', 'relates to']);
        expect(getAllowedRelationshipTypes('test_case_user_stories')).toEqual(['verifies', 'relates to']);
        expect(getDefaultRelationshipType('bug_tasks')).toBe('blocks');
    });

    test('validates types against the pair-specific allowed set', () => {
        expect(isAllowedRelationshipType('bug_tasks', 'blocks')).toBe(true);
        expect(isAllowedRelationshipType('bug_tasks', 'found in')).toBe(false);
        expect(isAllowedRelationshipType('bug_tasks', '')).toBe(false);
        expect(isAllowedRelationshipType('bug_tasks', null)).toBe(false);
    });

    test('maps relationship labels to their opposite-side label', () => {
        expect(getInverseRelationshipLabel('blocks')).toBe('is blocked by');
        expect(getInverseRelationshipLabel('is blocked by')).toBe('blocks');
        expect(getInverseRelationshipLabel('covers')).toBe('covered by');
        expect(getInverseRelationshipLabel('verified by')).toBe('verifies');
        expect(getInverseRelationshipLabel('relates to')).toBe('relates to');
    });
});
