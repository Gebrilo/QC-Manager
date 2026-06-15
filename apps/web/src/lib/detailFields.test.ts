import { describe, expect, it } from 'vitest';
import { humanizeLabel } from './detailFields';

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
