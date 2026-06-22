export type ArtifactType =
  | 'bug' | 'user_story' | 'task' | 'test_case' | 'test_run' | 'test_suite';

export interface ArtifactLike {
  id?: string | null;
  bug_id?: string | null;
  task_id?: string | null;
  test_case_id?: string | null;
  run_id?: string | null;
  suite_id?: string | null;
  display_id?: string | null;
  tuleap_artifact_id?: number | string | null;
}

const PREFIX: Record<ArtifactType, string> = {
  bug: '/work/bugs/',
  user_story: '/work/stories/',
  task: '/work/tasks/',
  test_case: '/test/cases/',
  test_run: '/test/runs/',
  test_suite: '/test/suites/',
};

export function artifactPublicId(type: ArtifactType, artifact: ArtifactLike): string {
  switch (type) {
    case 'bug': return artifact.bug_id || artifact.id || '';
    case 'task': return artifact.task_id || artifact.id || '';
    case 'test_case': return artifact.test_case_id || artifact.id || '';
    case 'test_run': return artifact.run_id || artifact.id || '';
    case 'test_suite': return artifact.suite_id || artifact.id || '';
    case 'user_story':
      if (artifact.display_id) return artifact.display_id;
      if (artifact.tuleap_artifact_id != null) return `US-${artifact.tuleap_artifact_id}`;
      return artifact.id || '';
  }
}

export function artifactPath(type: ArtifactType, artifact: ArtifactLike): string {
  return PREFIX[type] + artifactPublicId(type, artifact);
}
