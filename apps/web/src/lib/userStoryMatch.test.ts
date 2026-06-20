import { describe, expect, it } from 'vitest';
import { filterUserStories, getUserStoryDisplayId, userStoryMatchesQuery } from './userStoryMatch';

const story = {
    id: '11111111-1111-4111-8111-111111111111',
    tuleap_artifact_id: 1234,
    title: 'Checkout remembers saved cards',
    status: 'In Progress',
    priority: 'High',
    description: 'Payment tokenization and wallet reuse',
};

describe('userStoryMatchesQuery', () => {
    it('matches by title', () => {
        expect(userStoryMatchesQuery('saved cards', story)).toBe(true);
    });

    it('matches by readable user story id', () => {
        expect(userStoryMatchesQuery('US-1234', story)).toBe(true);
    });

    it('matches by status and priority case-insensitively', () => {
        expect(userStoryMatchesQuery('in progress', story)).toBe(true);
        expect(userStoryMatchesQuery('high', story)).toBe(true);
    });

    it('matches by description keyword', () => {
        expect(userStoryMatchesQuery('wallet', story)).toBe(true);
    });

    it('excludes non-matches', () => {
        expect(userStoryMatchesQuery('refund', story)).toBe(false);
    });
});

describe('filterUserStories', () => {
    it('returns only matching stories', () => {
        const result = filterUserStories('medium', [
            story,
            { ...story, id: '22222222-2222-4222-8222-222222222222', priority: 'Medium' },
        ]);

        expect(result.map(item => item.id)).toEqual(['22222222-2222-4222-8222-222222222222']);
    });
});

describe('getUserStoryDisplayId', () => {
    it('prefers explicit display id, then Tuleap id, then uuid', () => {
        expect(getUserStoryDisplayId({ id: 'uuid', display_id: 'US-9', tuleap_artifact_id: 8 })).toBe('US-9');
        expect(getUserStoryDisplayId({ id: 'uuid', tuleap_artifact_id: 8 })).toBe('US-8');
        expect(getUserStoryDisplayId({ id: 'uuid' })).toBe('uuid');
    });
});
