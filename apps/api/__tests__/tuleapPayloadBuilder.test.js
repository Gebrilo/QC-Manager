const { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload } = require('../src/services/tuleapPayloadBuilder');

const makeRegistry = (fields, binds = {}) => ({
  getFieldId: jest.fn(async (trackerId, name) => {
    if (!(name in fields)) throw new Error(`Field '${name}' not found`);
    return fields[name];
  }),
  resolveBindValue: jest.fn(async (trackerId, name, label) => {
    const key = `${name}:${label}`;
    if (!(key in binds)) throw new Error(`Bind '${key}' not found`);
    return { id: binds[key] };
  }),
});

const USER_STORY_FIELDS = { summary: 1, description: 2, acceptance_criteria: 3, status: 4, requirement_version: 5, ba_author: 6, priority: 7, initial_effort: 8, remaining_effort: 9, change_reason: 10 };
const USER_STORY_BINDS = { 'status:New': 100, 'priority:High': 200 };

describe('buildUserStoryPayload', () => {
  it('includes summary, description, acceptance_criteria, status', async () => {
    const reg = makeRegistry(USER_STORY_FIELDS, USER_STORY_BINDS);
    const payload = await buildUserStoryPayload({
      trackerId: 10,
      summary: 'Login flow',
      description: '## Desc',
      acceptanceCriteria: '## AC',
      status: 'New',
      baAuthor: 'Alice',
      requirementVersion: '1',
    }, reg);
    expect(payload.tracker).toEqual({ id: 10 });
    const find = (id) => payload.values.find(v => v.field_id === id);
    expect(find(1).value).toBe('Login flow');
    expect(find(4).bind_value_ids).toEqual([100]);
  });

  it('throws when summary is missing', async () => {
    const reg = makeRegistry(USER_STORY_FIELDS, USER_STORY_BINDS);
    await expect(buildUserStoryPayload({ trackerId: 10, status: 'New', baAuthor: 'A', requirementVersion: '1' }, reg))
      .rejects.toThrow(/summary.*required/i);
  });
});

describe('buildTestCasePayload', () => {
  const TC_FIELDS = { title: 11, test_steps: 12, expected_result: 13, status: 14, service_name: 15 };
  const TC_BINDS = { 'status:Not Run': 101 };
  it('builds payload with required fields', async () => {
    const reg = makeRegistry(TC_FIELDS, TC_BINDS);
    const payload = await buildTestCasePayload({
      trackerId: 20,
      title: 'TC-001',
      testSteps: '1. Open page',
      expectedResult: 'Page loads',
      status: 'Not Run',
    }, reg);
    expect(payload.values.find(v => v.field_id === 11).value).toBe('TC-001');
  });
});

describe('buildTaskPayload', () => {
  const TASK_FIELDS = { task_title: 21, description: 22, assigned_to: 23, team: 24, status: 25, parent_story: 26 };
  const TASK_BINDS = { 'status:Todo': 102, 'team:Backend': 202 };
  it('includes parent story link', async () => {
    const reg = makeRegistry(TASK_FIELDS, TASK_BINDS);
    const payload = await buildTaskPayload({
      trackerId: 5,
      taskTitle: 'Implement login',
      assignedTo: 'Bob',
      team: 'Backend',
      status: 'Todo',
      parentStoryArtifactId: 999,
    }, reg);
    const link = payload.values.find(v => v.field_id === 26);
    expect(link.links).toEqual([{ id: 999 }]);
  });
});

describe('buildBugPayload', () => {
  const BUG_FIELDS = { bug_title: 31, description: 32, environment: 33, status: 34, service_name: 35, assigned_to: 36, severity: 37, test_case_link: 38 };
  const BUG_BINDS = { 'status:Open': 103, 'environment:TEST': 203, 'severity:medium': 303 };
  it('includes test case link when provided', async () => {
    const reg = makeRegistry(BUG_FIELDS, BUG_BINDS);
    const payload = await buildBugPayload({
      trackerId: 30,
      bugTitle: 'Login crash',
      description: 'Steps...',
      environment: 'TEST',
      serviceName: 'auth-service',
      status: 'Open',
      severity: 'medium',
      testCaseArtifactId: 777,
    }, reg);
    const link = payload.values.find(v => v.field_id === 38);
    expect(link.links).toEqual([{ id: 777 }]);
  });
});