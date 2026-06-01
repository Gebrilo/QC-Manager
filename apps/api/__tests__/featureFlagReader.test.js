'use strict';
const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));
const { isEnabled, clearCache } = require('../src/access/FeatureFlagReader');

afterEach(() => { jest.clearAllMocks(); });

describe('FeatureFlagReader.isEnabled', () => {
    test('returns false when flag row absent', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(isEnabled('access_engine.bugs')).resolves.toBe(false);
    });

    test('returns value from JSONB column', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ value: true }] });
        await expect(isEnabled('access_engine.bugs')).resolves.toBe(true);
    });

    test('coerces non-boolean JSON to boolean', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ value: 'enabled' }] });
        await expect(isEnabled('access_engine.bugs')).resolves.toBe(true);
    });

    test('per-request cache reuses result without second query', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ value: true }] });
        const req = {};
        const a = await isEnabled('access_engine.bugs', req);
        const b = await isEnabled('access_engine.bugs', req);
        expect(a).toBe(true);
        expect(b).toBe(true);
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test('different keys on the same req each issue one query', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ value: true }] })
            .mockResolvedValueOnce({ rows: [{ value: false }] });
        const req = {};
        expect(await isEnabled('access_engine.bugs', req)).toBe(true);
        expect(await isEnabled('access_engine.tasks', req)).toBe(false);
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    test('clearCache(req) forces the next call to re-query', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ value: true }] })
            .mockResolvedValueOnce({ rows: [{ value: false }] });
        const req = {};
        expect(await isEnabled('access_engine.bugs', req)).toBe(true);
        clearCache(req);
        expect(await isEnabled('access_engine.bugs', req)).toBe(false);
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });
});
