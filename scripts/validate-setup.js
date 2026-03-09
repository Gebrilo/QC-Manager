#!/usr/bin/env node

/**
 * Validate E2E test setup
 * Checks dependencies, configuration, and directory structure
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REQUIRED_DIRS = [
  'tests/e2e',
  'tests/e2e/specs',
  'tests/e2e/pages',
  'tests/e2e/fixtures',
];

const REQUIRED_FILES = [
  'tests/e2e/playwright.config.ts',
  'package.json',
];

function checkDirectory(dir) {
  const exists = fs.existsSync(dir);
  if (exists) {
    console.log(`✓ ${dir}`);
  } else {
    console.log(`✗ ${dir} (missing)`);
  }
  return exists;
}

function checkFile(file) {
  const exists = fs.existsSync(file);
  if (exists) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} (missing)`);
  }
  return exists;
}

function checkDependency(pkg) {
  try {
    require.resolve(pkg);
    console.log(`✓ ${pkg}`);
    return true;
  } catch {
    console.log(`✗ ${pkg} (not installed)`);
    return false;
  }
}

function checkDevServer(name, url, port) {
  try {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" ${url}`, {
      timeout: 2000,
      stdio: 'pipe',
    }).toString();

    if (result === '200' || result === '302' || result === '304') {
      console.log(`✓ ${name} running on http://localhost:${port}`);
      return true;
    } else {
      console.log(`✗ ${name} not responding (status: ${result})`);
      return false;
    }
  } catch {
    console.log(`✗ ${name} not running on http://localhost:${port}`);
    return false;
  }
}

function main() {
  console.log('Validating E2E Setup\n');

  let allGood = true;

  // Check directories
  console.log('Directories:');
  for (const dir of REQUIRED_DIRS) {
    if (!checkDirectory(dir)) allGood = false;
  }

  console.log('\nFiles:');
  for (const file of REQUIRED_FILES) {
    if (!checkFile(file)) allGood = false;
  }

  console.log('\nDependencies:');
  const deps = [
    '@playwright/test',
    'typescript',
  ];
  for (const dep of deps) {
    if (!checkDependency(dep)) allGood = false;
  }

  console.log('\nDevelopment Servers:');
  if (!checkDevServer('Frontend', 'http://localhost:3000', 3000)) {
    console.log('  Run: npm run dev:web');
  }
  if (!checkDevServer('API', 'http://localhost:3001/health', 3001)) {
    console.log('  Run: npm run dev:api');
  }

  console.log('\n' + (allGood ? '✓ All checks passed!' : '✗ Some checks failed.'));
  console.log(`
Run tests with:
  npx playwright test --config tests/e2e/playwright.config.ts

Or use the helper script:
  node scripts/run-tests.js
  `);

  process.exit(allGood ? 0 : 1);
}

main();
