// apps/api/__tests__/resolveArtifactParam.test.js
const { resolveArtifactParam } = require('../src/middleware/resolveArtifactParam');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));
const db = require('../src/config/db');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe('resolveArtifactParam', () => {
  beforeEach(() => db.query.mockReset());

  test('rewrites req.params.id to the resolved UUID and calls next', async () => {
    const UUID = '11111111-1111-4111-8111-111111111111';
    db.query.mockResolvedValue({ rows: [{ id: UUID }] });
    const req = { params: { id: 'TSK-001' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, 'TSK-001');
    expect(req.params.id).toBe(UUID);
    expect(next).toHaveBeenCalledWith();
  });

  test('responds 404 when the human id does not resolve', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'TSK-999' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, 'TSK-999');
    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });
});
