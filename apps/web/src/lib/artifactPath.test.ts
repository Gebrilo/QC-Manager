import { describe, it, expect } from 'vitest';
import { artifactPath, artifactPublicId } from './artifactPath';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('artifactPath', () => {
  it('uses the human id when present', () => {
    expect(artifactPath('bug', { id: UUID, bug_id: 'TLP-12345' })).toBe('/work/bugs/TLP-12345');
    expect(artifactPath('task', { id: UUID, task_id: 'TSK-001' })).toBe('/work/tasks/TSK-001');
    expect(artifactPath('test_case', { id: UUID, test_case_id: 'TC-00001' })).toBe('/test/cases/TC-00001');
    expect(artifactPath('test_run', { id: UUID, run_id: 'RUN-7' })).toBe('/test/runs/RUN-7');
    expect(artifactPath('test_suite', { id: UUID, suite_id: 'TS-3' })).toBe('/test/suites/TS-3');
  });

  it('derives US-<tuleap> for user stories (no human column)', () => {
    expect(artifactPath('user_story', { id: UUID, tuleap_artifact_id: 12345 })).toBe('/work/stories/US-12345');
  });

  it('falls back to UUID when no human id exists', () => {
    expect(artifactPath('task', { id: UUID })).toBe(`/work/tasks/${UUID}`);
    expect(artifactPath('user_story', { id: UUID })).toBe(`/work/stories/${UUID}`);
  });

  it('artifactPublicId returns just the id segment', () => {
    expect(artifactPublicId('bug', { id: UUID, bug_id: 'TLP-1' })).toBe('TLP-1');
  });
});
