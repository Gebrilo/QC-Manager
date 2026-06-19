import { describe, expect, test } from 'vitest';
import {
    LINK_RELATIONSHIP_OPTIONS_BY_PAIR,
    getDirectionalRelationshipLabel,
    getInverseRelationshipLabel,
} from './linkRelationships';

describe('linkRelationships', () => {
    test('defines curated options for the existing artifact link pairs', () => {
        expect(LINK_RELATIONSHIP_OPTIONS_BY_PAIR.taskTestCases.map(option => option.value)).toEqual(['covers', 'verified by']);
        expect(LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugTestCases.map(option => option.value)).toEqual(['reveals', 'found in']);
        expect(LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugTasks.map(option => option.value)).toEqual(['blocks', 'is blocked by', 'relates to']);
        expect(LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugUserStories.map(option => option.value)).toEqual(['affects', 'relates to']);
        expect(LINK_RELATIONSHIP_OPTIONS_BY_PAIR.testCaseUserStories.map(option => option.value)).toEqual(['verifies', 'relates to']);
    });

    test('returns inverse labels for opposite-side rendering', () => {
        expect(getInverseRelationshipLabel('blocks')).toBe('is blocked by');
        expect(getInverseRelationshipLabel('is blocked by')).toBe('blocks');
        expect(getDirectionalRelationshipLabel('covers', 'from')).toBe('covers');
        expect(getDirectionalRelationshipLabel('covers', 'to')).toBe('covered by');
        expect(getDirectionalRelationshipLabel('relates to', 'to')).toBe('relates to');
    });
});
