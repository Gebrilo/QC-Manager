const mockQuery = jest.fn();
const mockDispatchFromAudit = jest.fn();

jest.mock('../src/config/db', () => ({
    query: (...args) => mockQuery(...args),
}));

jest.mock('../src/services/notifications/dispatcher', () => ({
    dispatchFromAudit: (...args) => mockDispatchFromAudit(...args),
}));

const { auditLog } = require('../src/middleware/audit');

describe('auditLog', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockDispatchFromAudit.mockResolvedValue(undefined);
    });

    test('stores UUID entities in both legacy and current id columns with details payload', async () => {
        const entityId = '55555555-5555-5555-5555-555555555555';
        const afterState = { event_type: 'artifact_link', counterpart: { id: 'other-id' } };

        await auditLog('bug', entityId, 'CREATE', afterState, null, 'actor@example.com');

        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain('entity_uuid, entity_id, entity_key');
        expect(sql).toContain('details');
        expect(params[0]).toBe('bug');
        expect(params[1]).toBe(entityId);
        expect(params[2]).toBe(entityId);
        expect(params[3]).toBeNull();
        expect(JSON.parse(params[6])).toEqual(afterState);
        expect(JSON.parse(params[8])).toEqual(afterState);
        expect(params[10]).toBe('actor@example.com');
        expect(mockDispatchFromAudit).toHaveBeenCalledWith(expect.objectContaining({
            entityType: 'bug',
            entityId,
            action: 'CREATE',
            after: afterState,
            actorEmail: 'actor@example.com',
        }));
    });
});
