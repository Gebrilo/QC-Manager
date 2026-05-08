const { resolveLinks, drainPending } = require('../src/services/tuleapLinkResolver');

describe('tuleapLinkResolver.resolveLinks', () => {
  it('returns empty resolved/pending when no links given', async () => {
    const out = await resolveLinks({
      qcProjectId: 'proj-1',
      tuleapLinks: [],
      query: jest.fn()
    });
    expect(out).toEqual({ resolved: [], pending: [] });
  });

  it('resolves a single test_case link when QC artifact exists', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [{ id: 'qc-uuid-1' }]
    });
    const out = await resolveLinks({
      qcProjectId: 'proj-1',
      tuleapLinks: [{ type: 'test_case', target_artifact_id: 140 }],
      query
    });
    expect(out.resolved).toEqual([
      { type: 'test_case', qc_id: 'qc-uuid-1', tuleap_id: 140 }
    ]);
    expect(out.pending).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('queues link as pending when QC artifact not yet ingested', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const out = await resolveLinks({
      qcProjectId: 'proj-1',
      tuleapLinks: [{ type: 'test_case', target_artifact_id: 999 }],
      query
    });
    expect(out.resolved).toEqual([]);
    expect(out.pending).toEqual([
      { type: 'test_case', tuleap_id: 999 }
    ]);
  });

  it('handles a mix of resolvable and pending links', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'qc-tc-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const out = await resolveLinks({
      qcProjectId: 'proj-1',
      tuleapLinks: [
        { type: 'test_case', target_artifact_id: 140 },
        { type: 'test_case', target_artifact_id: 999 }
      ],
      query
    });
    expect(out.resolved).toEqual([
      { type: 'test_case', qc_id: 'qc-tc-1', tuleap_id: 140 }
    ]);
    expect(out.pending).toEqual([
      { type: 'test_case', tuleap_id: 999 }
    ]);
  });

  it('routes link types to the correct table', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'qc-tc-1' }] })   // test_case
      .mockResolvedValueOnce({ rows: [{ id: 'qc-task-1' }] }) // task
      .mockResolvedValueOnce({ rows: [{ id: 'qc-us-1' }] })   // user_story
      .mockResolvedValueOnce({ rows: [{ id: 'qc-bug-1' }] }); // bug
    await resolveLinks({
      qcProjectId: 'proj-1',
      tuleapLinks: [
        { type: 'test_case', target_artifact_id: 1 },
        { type: 'task', target_artifact_id: 2 },
        { type: 'user_story', target_artifact_id: 3 },
        { type: 'bug', target_artifact_id: 4 }
      ],
      query
    });
    expect(query.mock.calls[0][0]).toMatch(/FROM\s+test_case/);
    expect(query.mock.calls[1][0]).toMatch(/FROM\s+tasks/);
    expect(query.mock.calls[2][0]).toMatch(/FROM\s+user_stories/);
    expect(query.mock.calls[3][0]).toMatch(/FROM\s+bugs/);
  });

  it('skips links whose type is unknown', async () => {
    const query = jest.fn();
    const out = await resolveLinks({
      qcProjectId: 'proj-1',
      tuleapLinks: [{ type: 'mystery', target_artifact_id: 1 }],
      query
    });
    expect(out.resolved).toEqual([]);
    expect(out.pending).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('tuleapLinkResolver.drainPending', () => {
  it('returns 0 resolved when no rows have pending_links matching', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const out = await drainPending({
      qcProjectId: 'proj-1',
      justPersistedQcId: 'qc-bug-1',
      justPersistedQcType: 'bug',
      justPersistedTuleapId: 7,
      query
    });
    expect(out).toEqual({ resolvedCount: 0 });
  });

  it('updates artifacts whose pending_links reference the just-persisted Tuleap id', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qc-bug-A',
            pending_links: [
              { type: 'bug', tuleap_id: 7 },
              { type: 'test_case', tuleap_id: 99 }
            ],
            linked_test_case_ids: []
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const out = await drainPending({
      qcProjectId: 'proj-1',
      justPersistedQcId: 'qc-bug-NEW',
      justPersistedQcType: 'bug',
      justPersistedTuleapId: 7,
      query
    });
    expect(out.resolvedCount).toBe(1);
    const updateCall = query.mock.calls.find(c => typeof c[0] === 'string' && /UPDATE/i.test(c[0]));
    expect(updateCall).toBeDefined();
  });

  it('drains links from multiple tables (bug, task, user_story, test_case)', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await drainPending({
      qcProjectId: 'proj-1',
      justPersistedQcId: 'qc-tc-NEW',
      justPersistedQcType: 'test_case',
      justPersistedTuleapId: 140,
      query
    });
    // Expect SELECT against each artifact table that may have pending links
    const selectCalls = query.mock.calls.filter(c => /SELECT/i.test(c[0]));
    const tables = selectCalls.map(c => c[0]);
    expect(tables.some(s => /FROM\s+bugs/.test(s))).toBe(true);
    expect(tables.some(s => /FROM\s+tasks/.test(s))).toBe(true);
    expect(tables.some(s => /FROM\s+user_stories/.test(s))).toBe(true);
    expect(tables.some(s => /FROM\s+test_case/.test(s))).toBe(true);
  });
});
