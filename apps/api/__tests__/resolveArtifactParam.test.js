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

  test('fast-path 1: loose UUID passes through unchanged without a DB query', async () => {
    const UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
    const req = { params: { id: UUID } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, UUID);
    expect(next).toHaveBeenCalledWith();
    expect(req.params.id).toBe(UUID);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('resolves a non-numeric human id (e.g. TSK-DIAG-001) instead of 404ing', async () => {
    // task_id schema is /^TSK-[A-Z0-9-]+$/, so ids like TSK-DIAG-001 and TSK-560E1333
    // must reach the resolver, not be rejected by the format gate. Regression for #256.
    const UUID = '22222222-2222-4222-8222-222222222222';
    db.query.mockResolvedValue({ rows: [{ id: UUID }] });
    const req = { params: { id: 'TSK-DIAG-001' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, 'TSK-DIAG-001');
    expect(db.query).toHaveBeenCalled();
    expect(req.params.id).toBe(UUID);
    expect(next).toHaveBeenCalledWith();
  });

  test('fast-path 2: unrecognized value responds 404 and does not call next', async () => {
    const req = { params: { id: 'garbage' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, 'garbage');
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(next).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  // Regression: bugs carry two live prefix families — 'TLP-' (Tuleap sync) and
  // 'BUG-' (QC-native creation, bugs.js). The original gate was keyed to the
  // single 'TLP-' prefix, so every BUG-* bug 404'd at the gate before a DB
  // lookup even though the row exists. The gate is now prefix-agnostic.
  test.each(['TLP-1', 'BUG-MQNNSVRS'])('resolves a bug human id %s regardless of prefix family', async (humanId) => {
    const UUID = '33333333-3333-4333-8333-333333333333';
    db.query.mockResolvedValue({ rows: [{ id: UUID }] });
    const req = { params: { id: humanId } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('bug')(req, res, next, humanId);
    expect(db.query).toHaveBeenCalled();
    expect(db.query.mock.calls[0][1]).toEqual([humanId]);
    expect(req.params.id).toBe(UUID);
    expect(next).toHaveBeenCalledWith();
  });

  test('lowercase value (e.g. bug-1) still 404s at the gate without a DB hit', async () => {
    const req = { params: { id: 'bug-1' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('bug')(req, res, next, 'bug-1');
    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
});
