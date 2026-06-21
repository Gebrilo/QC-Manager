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
 *   - this guard test file
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

const WEB_ROOT = path.resolve(__dirname, '../../..');

const ALLOWLIST = [
  '/src/lib/artifactPath.ts',
  '/src/lib/artifactPath.guard.test.ts',
];

describe('artifactPath guard: no hand-built artifact URL interpolations', () => {
  it('has zero hand-built /(work|test)/(bugs|stories|tasks|cases|runs|suites)/${...} in .tsx/.ts files', () => {
    let output = '';
    // Pattern: backtick followed by /(work|test)/(artifact-type)/${ — hand-built interpolation
    const pattern = String.fromCharCode(96) + '/(work|test)/(bugs|stories|tasks|cases|runs|suites)/${';
    try {
      output = execSync(
        `grep -rn --include="*.tsx" --include="*.ts" '${pattern}' "${WEB_ROOT}"`,
        { encoding: 'utf8', cwd: WEB_ROOT }
      );
    } catch (err: any) {
      // grep exits with code 1 when no matches found — that is our success case
      if (err.status === 1) {
        output = '';
      } else {
        throw err;
      }
    }

    const offenders = output
      .split('\n')
      .filter(Boolean)
      .filter(line => !ALLOWLIST.some(allowed => line.includes(allowed)));

    expect(offenders).toHaveLength(0);
    if (offenders.length > 0) {
      console.error('Files still using hand-built artifact URL interpolations:');
      offenders.forEach(line => console.error(' ', line));
    }
  });
});
