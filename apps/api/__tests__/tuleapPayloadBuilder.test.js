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

// Real field names from Tuleap tracker 6 (User Stories)
const USER_STORY_FIELDS = { story_title: 1, overview_description: 2, acceptance_criteria: 3, status: 4, requirement_version: 5, ba_author: 6, priority: 7, initial_effort: 8, remaining_effort: 9, change_reason: 10 };
const USER_STORY_BINDS = { 'status:Draft': 100, 'ba_author:BA-Team': 150, 'priority:P2-High': 200 };

describe('buildUserStoryPayload', () => {
  it('includes summary (story_title), description (overview_description), status', async () => {
    const reg = makeRegistry(USER_STORY_FIELDS, USER_STORY_BINDS);
    const payload = await buildUserStoryPayload({
      trackerId: 10,
      summary: 'Login flow',
      description: '## Desc',
      acceptanceCriteria: '## AC',
      status: 'Draft',
      requirementVersion: '1',
    }, reg);
    expect(payload.tracker).toEqual({ id: 10 });
    const find = (id) => payload.values.find(v => v.field_id === id);
    expect(find(1).value).toBe('Login flow');           // story_title
    expect(find(4).bind_value_ids).toEqual([100]);      // status:Draft
  });

  it('throws when summary is missing', async () => {
    const reg = makeRegistry(USER_STORY_FIELDS, USER_STORY_BINDS);
    await expect(buildUserStoryPayload({ trackerId: 10, status: 'Draft', requirementVersion: '1' }, reg))
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
  // Real field names from Tuleap tracker 5 (Tasks): title, details, assigned_to (sb), team (sb)
  const TASK_FIELDS = { title: 21, details: 22, assigned_to: 23, team: 24, status: 25, parent_story: 26 };
  const TASK_BINDS = { 'status:Todo': 102, 'team:QA-Team': 129, 'assigned_to:belal.z': 105 };
  it('includes parent story link', async () => {
    const reg = makeRegistry(TASK_FIELDS, TASK_BINDS);
    const payload = await buildTaskPayload({
      trackerId: 5,
      taskTitle: 'Implement login',
      assignedTo: 'belal.z',
      team: 'QA-Team',
      status: 'Todo',
      parentStoryArtifactId: 999,
    }, reg);
    const link = payload.values.find(v => v.field_id === 26);
    expect(link.links).toEqual([{ id: 999 }]);
  });
});

describe('buildBugPayload', () => {
  // Real field names from Tuleap tracker 1 (Bugs): steps_to_reproduce, test-case (art_link)
  // severity labels: 'Cosmetic impact' | 'Minor impact' | 'Major impact' | 'Critical impact'
  // status labels: 'New' | 'In Progress' | 'Assigned' | 'Fixed' | 'Verified' | 'Reopened'
  const BUG_FIELDS = { bug_title: 31, steps_to_reproduce: 32, environment: 33, status: 34, service_name: 35, assigned_to: 36, severity: 37, 'test-case': 38 };
  const BUG_BINDS = { 'status:New': 103, 'environment:TEST': 203, 'severity:Major impact': 303 };
  it('includes test case link when provided', async () => {
    const reg = makeRegistry(BUG_FIELDS, BUG_BINDS);
    const payload = await buildBugPayload({
      trackerId: 30,
      bugTitle: 'Login crash',
      description: 'Steps...',
      environment: 'TEST',
      serviceName: 'auth-service',
      status: 'New',
      severity: 'Major impact',
      testCaseArtifactId: 777,
    }, reg);
    const link = payload.values.find(v => v.field_id === 38);
    expect(link.links).toEqual([{ id: 777 }]);
  });
});