const { resolveArtifactUuid, ARTIFACT_ID_CONFIG, UUID_RE } = require('../src/services/artifactResolver');

const UUID = '11111111-1111-4111-8111-111111111111';

function fakeQuery(rows) {
  return async () => ({ rows });
}

describe('resolveArtifactUuid', () => {
  test('passes a UUID through without querying', async () => {
    const query = jest.fn(fakeQuery([]));
    await expect(resolveArtifactUuid('bug', UUID, query)).resolves.toBe(UUID);
    expect(query).not.toHaveBeenCalled();
  });

  test('resolves a human id via the human column', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('task', 'TSK-001', query)).resolves.toBe(UUID);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM tasks/);
    expect(sql).toMatch(/task_id = \$1/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(['TSK-001']);
  });

  test('resolves a test_run against the singular test_run table', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('test_run', 'RUN-1', query)).resolves.toBe(UUID);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM test_run\b/);
    expect(sql).not.toMatch(/FROM test_runs\b/);
    expect(sql).toMatch(/run_id = \$1/);
    expect(params).toEqual(['RUN-1']);
  });

  test('resolves a test_case, test_suite, and bug against their tables', async () => {
    for (const [type, value, table, col] of [
      ['test_case', 'TC-1', 'test_case', 'test_case_id'],
      ['test_suite', 'TS-1', 'test_suites', 'suite_id'],
      ['bug', 'TLP-1', 'bugs', 'bug_id'],
    ]) {
      const query = jest.fn(fakeQuery([{ id: UUID }]));
      await expect(resolveArtifactUuid(type, value, query)).resolves.toBe(UUID);
      const [sql] = query.mock.calls[0];
      expect(sql).toMatch(new RegExp(`FROM ${table}\\b`));
      expect(sql).toMatch(new RegExp(`${col} = \\$1`));
    }
  });

  test('resolves a user_story by stripping US- to the tuleap id', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('user_story', 'US-12345', query)).resolves.toBe(UUID);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/tuleap_artifact_id = \$1/);
    expect(params).toEqual([12345]);
  });

  test('resolves a user_story from a bare tuleap number', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('user_story', '12345', query)).resolves.toBe(UUID);
    expect(query.mock.calls[0][1]).toEqual([12345]);
  });

  test('throws 404 when no row matches', async () => {
    const query = jest.fn(fakeQuery([]));
    await expect(resolveArtifactUuid('bug', 'TLP-999', query)).rejects.toMatchObject({ status: 404 });
  });

  test('throws 400 for an unknown artifact type', async () => {
    await expect(resolveArtifactUuid('project', 'X', jest.fn())).rejects.toMatchObject({ status: 400 });
  });
});
