#!/usr/bin/env node

/**
 * Run Playwright tests locally
 * Wrapper around Playwright CLI with helpful defaults
 *
 * Usage:
 *   node scripts/run-tests.js                    # Run all tests
 *   node scripts/run-tests.js --filter auth      # Run tests matching filter
 *   node scripts/run-tests.js --debug            # Run in debug mode
 *   node scripts/run-tests.js --headed           # Run in headed mode
 */

const { spawn } = require('child_process');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    filter: null,
    debug: false,
    headed: false,
    project: 'chromium',
    extra: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--filter' && args[i + 1]) {
      opts.filter = args[++i];
    } else if (arg === '--debug') {
      opts.debug = true;
    } else if (arg === '--headed') {
      opts.headed = true;
    } else if (arg === '--project' && args[i + 1]) {
      opts.project = args[++i];
    } else if (arg.startsWith('--')) {
      opts.extra.push(arg);
    }
  }

  return opts;
}

function buildCommand(opts) {
  const cmd = ['npx', 'playwright', 'test'];

  if (opts.filter) {
    cmd.push('--grep', opts.filter);
  }

  if (opts.debug) {
    cmd.push('--debug');
  }

  if (opts.headed) {
    cmd.push('--headed');
  }

  // Point to tests/e2e config
  cmd.push('--config', path.join('tests/e2e', 'playwright.config.ts'));

  cmd.push(...opts.extra);

  return cmd;
}

function main() {
  const opts = parseArgs();
  const cmd = buildCommand(opts);

  console.log(`Running: ${cmd.join(' ')}\n`);

  const proc = spawn(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  proc.on('exit', code => {
    process.exit(code);
  });
}

main();
