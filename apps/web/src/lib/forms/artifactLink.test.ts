import { describe, expect, it } from 'vitest';
import { addLinkValue, pickStoredValue, removeLinkValue } from './artifactLink';

const testCase = {
    id: '11111111-1111-1111-1111-111111111111',
    display_id: 'TC-42',
    title: 'Login with valid credentials',
};

describe('pickStoredValue', () => {
    // Regression: the bug form previously took free text like "TC-42" and tried
    // to write it into bugs.linked_test_case_ids (a UUID[] column). A picked
    // artifact must persist its UUID, not its display id or title.
    it('stores the UUID for id-keyed fields (linked_test_case_ids)', () => {
        expect(pickStoredValue(testCase, 'id')).toBe(testCase.id);
    });

    it('stores the display id for display_id-keyed fields (linked_requirement_id)', () => {
        expect(pickStoredValue(testCase, 'display_id')).toBe('TC-42');
    });

    it('stores the title for title-keyed fields (suite_title)', () => {
        expect(pickStoredValue(testCase, 'title')).toBe('Login with valid credentials');
    });
});

describe('addLinkValue', () => {
    it('replaces the value for single-select', () => {
        expect(addLinkValue('old', 'new', false)).toBe('new');
    });

    it('appends without duplicating for multi-select', () => {
        expect(addLinkValue(['a'], 'b', true)).toEqual(['a', 'b']);
        expect(addLinkValue(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    });

    it('normalises empty/scalar current values to a list for multi-select', () => {
        expect(addLinkValue('', 'a', true)).toEqual(['a']);
    });
});

describe('removeLinkValue', () => {
    it('clears the value for single-select', () => {
        expect(removeLinkValue('x', 'x', false)).toBe('');
    });

    it('filters the removed item for multi-select', () => {
        expect(removeLinkValue(['a', 'b'], 'a', true)).toEqual(['b']);
    });
});
