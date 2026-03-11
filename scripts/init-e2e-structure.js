#!/usr/bin/env node

/**
 * Initialize E2E test structure for Playwright
 * Creates tests/e2e directory with proper structure and configuration
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = 'tests/e2e';
const DIRS = [
  'fixtures',
  'pages',
  'specs',
];

const PLAYWRIGHT_CONFIG = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  testMatch: '*.spec.ts',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: 'html',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like \`await page.goto('/')\` */
    baseURL: 'http://localhost:3000',
    navigationTimeout: 10000,
    actionTimeout: 5000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run dev:web',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:api',
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
`;

const EXAMPLE_FIXTURE = `import { test as base, APIRequestContext } from '@playwright/test';

type ApiFixtures = {
  api: APIRequestContext;
};

export const test = base.extend<ApiFixtures>({
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: 'http://localhost:3001',
    });
    await use(context);
    await context.dispose();
  },
});
`;

function createDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
}

function createFile(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
    console.log(`✓ Created file: ${filePath}`);
  } else {
    console.log(`⊘ File already exists: ${filePath}`);
  }
}

function main() {
  console.log('Initializing Playwright E2E structure...\n');

  // Create directories
  for (const dir of DIRS) {
    const fullPath = path.join(BASE_DIR, dir);
    createDirectory(fullPath);
  }

  // Create playwright.config.ts
  createFile(
    path.join(BASE_DIR, 'playwright.config.ts'),
    PLAYWRIGHT_CONFIG
  );

  // Create example fixture
  createFile(
    path.join(BASE_DIR, 'fixtures', 'api.fixture.ts'),
    EXAMPLE_FIXTURE
  );

  // Create .gitkeep for empty directories
  createFile(path.join(BASE_DIR, 'pages', '.gitkeep'), '');
  createFile(path.join(BASE_DIR, 'specs', '.gitkeep'), '');

  console.log(`
✓ E2E structure initialized successfully!

Next steps:
1. node scripts/generate-test.js --type auth --name login
2. node scripts/generate-test.js --type crud --name tasks
3. npm run test:e2e

For more help, see the Playwright E2E Testing skill documentation.
  `);
}

main();
