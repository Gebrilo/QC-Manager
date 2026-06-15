import { describe, expect, it } from 'vitest';
import { buildAutoDetailFields, formatFieldValue, humanizeLabel, isUuid } from './detailFields';

describe('humanizeLabel', () => {
    it('title-cases snake_case keys', () => {
        expect(humanizeLabel('story_points')).toBe('Story Points');
        expect(humanizeLabel('submitted_by_resource_name')).toBe('Submitted By Resource Name');
    });

    it('uppercases known acronyms', () => {
        expect(humanizeLabel('tuleap_artifact_id')).toBe('Tuleap Artifact ID');
        expect(humanizeLabel('tuleap_url')).toBe('Tuleap URL');
        expect(humanizeLabel('qc_verification_notes')).toBe('QC Verification Notes');
        expect(humanizeLabel('cc')).toBe('CC');
    });

    it('handles single words', () => {
        expect(humanizeLabel('priority')).toBe('Priority');
    });
});

describe('isUuid', () => {
    it('detects UUID strings', () => {
        expect(isUuid('7f3a9c2e-1b2c-4d5e-8f90-1a2b3c4d5e6f')).toBe(true);
    });

    it('rejects non-UUIDs', () => {
        expect(isUuid('BUG-123')).toBe(false);
        expect(isUuid('140')).toBe(false);
        expect(isUuid(42)).toBe(false);
        expect(isUuid(null)).toBe(false);
    });
});

describe('formatFieldValue', () => {
    it('skips empty values', () => {
        expect(formatFieldValue(null)).toBeNull();
        expect(formatFieldValue(undefined)).toBeNull();
        expect(formatFieldValue('')).toBeNull();
        expect(formatFieldValue('   ')).toBeNull();
    });

    it('formats booleans', () => {
        expect(formatFieldValue(true)).toBe('Yes');
        expect(formatFieldValue(false)).toBe('No');
    });

    it('joins primitive arrays and skips empty/object arrays', () => {
        expect(formatFieldValue(['a', 'b'])).toBe('a, b');
        expect(formatFieldValue([])).toBeNull();
        expect(formatFieldValue([{ x: 1 }])).toBeNull();
    });

    it('stringifies numbers including zero', () => {
        expect(formatFieldValue(42)).toBe('42');
        expect(formatFieldValue(0)).toBe('0');
    });

    it('formats ISO date strings', () => {
        expect(formatFieldValue('2026-06-14')).toContain('2026');
        expect(formatFieldValue('2026-06-14T10:30:00Z')).toContain('2026');
    });

    it('strips HTML from strings', () => {
        expect(formatFieldValue('<b>hi</b>')).toBe('hi');
    });

    it('skips plain objects', () => {
        expect(formatFieldValue({ a: 1 })).toBeNull();
    });
});

describe('buildAutoDetailFields', () => {
    it('skips denylisted keys', () => {
        const rows = buildAutoDetailFields({ _can: {}, deleted_at: 'x', title: 'T' });
        expect(rows).toEqual([{ key: 'title', label: 'Title', value: 'T' }]);
    });

    it('hides UUID values', () => {
        const rows = buildAutoDetailFields({
            id: '7f3a9c2e-1b2c-4d5e-8f90-1a2b3c4d5e6f',
            name: 'x',
        });
        expect(rows.map(row => row.key)).toEqual(['name']);
    });

    it('hides empty values', () => {
        const rows = buildAutoDetailFields({ a: null, b: '', c: 'v' });
        expect(rows.map(row => row.key)).toEqual(['c']);
    });

    it('honours the exclude list', () => {
        const rows = buildAutoDetailFields({ a: '1', b: '2' }, { exclude: ['a'] });
        expect(rows.map(row => row.key)).toEqual(['b']);
    });

    it('applies label overrides', () => {
        const rows = buildAutoDetailFields({ a: '1' }, { labels: { a: 'Alpha' } });
        expect(rows[0].label).toBe('Alpha');
    });

    it('applies value formatters, skipping null results', () => {
        const formatters = { effort: (value: unknown) => (value == null ? null : `${value}h`) };
        expect(buildAutoDetailFields({ effort: 5 }, { formatters })[0].value).toBe('5h');
        expect(buildAutoDetailFields({ effort: null }, { formatters })).toEqual([]);
    });
});
