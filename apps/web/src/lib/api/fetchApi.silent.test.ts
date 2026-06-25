import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchApi, onApiError } from './index';

// A 403 background load (e.g. a tester opening a form whose assignee picker
// fetches /resources) must NOT trigger the global ApiErrorToaster red toast.
// The opt-out is `{ silent: true }`; without it, the global emit still fires
// for user-initiated actions.
function forbidden() {
    return { ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) } as Response;
}

describe('fetchApi global 403 emission', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => forbidden()));
    });

    it('emits a global apiError on 403 by default', async () => {
        const events: number[] = [];
        const off = onApiError(e => events.push(e.status));
        await expect(fetchApi('/resources')).rejects.toThrow();
        off();
        expect(events).toEqual([403]);
    });

    it('stays silent with { silent: true } — background loads do not toast', async () => {
        const events: number[] = [];
        const off = onApiError(e => events.push(e.status));
        await expect(fetchApi('/resources', { silent: true })).rejects.toThrow();
        off();
        expect(events).toEqual([]);
    });
});
