/**
 * Guard test: no hand-built artifact path interpolations remain in the web app.
 *
 * Any file that still contains a template literal of the form
 *   `/work/bugs/${...}`, `/work/stories/${...}`, `/work/tasks/${...}`,
 *   `/test/cases/${...}`, `/test/runs/${...}`, `/test/suites/${...}`
 * is a regression — those must use `artifactPath(type, artifact)` instead.
 *
 * ALLOWLIST:
 *   - artifactPath.ts itself (defines the PREFIX table)
 *   - artifactPath.test.ts (unit tests that assert returned strings)
 *   - this guard test file
 *   - e2e/ tests (navigate by raw UUID/ID intentionally)
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';

const WEB_ROOT = path.resolve(__dirname, '../../..');

const ALLOWLIST = [
  '/src/lib/artifactPath.ts',            // defines the PREFIX table (canonical source)
  '/src/lib/artifactPath.test.ts',       // unit tests assert the string the function returns
  '/src/lib/artifactPath.guard.test.ts', // this file's own docstring examples
  '/e2e/',                               // e2e tests navigate by raw UUID/ID intentionally
];

describe('artifactPath guard: no hand-built artifact URL interpolations', () => {
  it('has zero hand-built /(work|test)/(bugs|stories|tasks|cases|runs|suites)/${...} in .tsx/.ts files', () => {
    // Use spawnSync (no shell) so the backtick in the pattern isn't misinterpreted
    // as a command substitution by /bin/sh.
    // Pattern: backtick + /(work|test)/(artifact-type)/${ — a hand-built URL interpolation.
    const backtick = String.fromCharCode(96);
    const pattern = `${backtick}/(work|test)/(bugs|stories|tasks|cases|runs|suites)/\\$\\{`;

    const result = spawnSync('grep', [
      '-rPn',
      '--include=*.tsx',
      '--include=*.ts',
      pattern,
      WEB_ROOT,
    ], { encoding: 'utf8', cwd: WEB_ROOT });

    if (result.status !== 0 && result.status !== 1) {
      // grep exits 0 (matches found), 1 (no matches), or 2 (error).
      // Status 2 means a real grep error — fail loudly.
      throw new Error(`grep error (status ${result.status}): ${result.stderr}`);
    }

    const output = result.status === 0 ? result.stdout : '';

    const offenders = output
      .split('\n')
      .filter(Boolean)
      .filter(line => !ALLOWLIST.some(allowed => line.includes(allowed)));

    if (offenders.length > 0) {
      console.error('Files still using hand-built artifact URL interpolations:');
      offenders.forEach(line => console.error(' ', line));
    }

    expect(offenders).toHaveLength(0);
  });
});
