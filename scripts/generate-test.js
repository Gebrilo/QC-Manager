#!/usr/bin/env node

/**
 * Generate test files from templates
 * Usage: node scripts/generate-test.js --type <TYPE> --name <NAME>
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES = {
  auth: generateAuthTest,
  crud: generateCrudTest,
  api: generateApiTest,
  smoke: generateSmokeTest,
  'page-model': generatePageModel,
  'api-fixture': generateApiFixture,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    opts[key] = value;
  }

  return opts;
}

function capitalCase(str) {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function generateAuthTest(name) {
  const className = capitalCase(name);
  return `import { test, expect } from '@playwright/test';

test.describe('Authentication - ${className}', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
  });

  test('should authenticate user', async ({ page }) => {
    // TODO: Implement authentication test
    await expect(page).toHaveURL('/dashboard');
  });

  test('should validate permissions', async ({ page }) => {
    // TODO: Implement permission validation
  });

  test('should handle logout', async ({ page }) => {
    // TODO: Implement logout test
  });
});
`;
}

function generateCrudTest(name) {
  const className = capitalCase(name);
  const itemName = name.split('-')[0];

  return `import { test, expect } from '@playwright/test';

test.describe('${className} - CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/${name}');
  });

  test('should create new ${itemName}', async ({ page }) => {
    // TODO: Implement create flow
    await expect(page.getByText(/success/i)).toBeVisible();
  });

  test('should read ${itemName}', async ({ page }) => {
    // TODO: Implement read flow
  });

  test('should update ${itemName}', async ({ page }) => {
    // TODO: Implement update flow
  });

  test('should delete ${itemName}', async ({ page }) => {
    // TODO: Implement delete flow
  });

  test('should validate required fields', async ({ page }) => {
    // TODO: Implement validation test
  });
});
`;
}

function generateApiTest(name) {
  const endpoint = name.replace(/^(create|update|delete)-/, '').replace(/-/g, '/');

  return `import { test, expect } from '@playwright/test';

test.describe('API - ${name}', () => {
  const baseURL = 'http://localhost:3001';

  test('should complete request successfully', async ({ request }) => {
    const response = await request.post(baseURL + '/${endpoint}', {
      data: {
        // TODO: Add request data
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('id');
  });

  test('should return error for invalid data', async ({ request }) => {
    const response = await request.post(baseURL + '/${endpoint}', {
      data: {
        // TODO: Add invalid data
      },
    });

    expect(response.ok()).toBeFalsy();
  });

  test('should require authentication', async ({ request }) => {
    // Test without auth token
    // TODO: Implement
  });
});
`;
}

function generateSmokeTest(name) {
  const testName = name.replace(/-/g, ' ');

  return `import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - ${testName}', () => {
  test('should load page', async ({ page }) => {
    await page.goto('/');
    // TODO: Add basic smoke checks
  });

  test('should show main elements', async ({ page }) => {
    await page.goto('/');
    // TODO: Verify critical UI elements are visible
  });

  test('should navigate without errors', async ({ page }) => {
    await page.goto('/');
    // TODO: Test main navigation paths
  });
});
`;
}

function generatePageModel(name) {
  const className = capitalCase(name);

  return `import { Page, Locator } from '@playwright/test';

export class ${className} {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading');
  }

  async goto() {
    await this.page.goto('/');
    // TODO: Update with correct route
  }

  // TODO: Add page-specific methods
}
`;
}

function generateApiFixture(name) {
  const className = capitalCase(name);

  return `import { test as base, APIRequestContext } from '@playwright/test';

type ${className}Fixtures = {
  api: APIRequestContext;
};

export const test = base.extend<${className}Fixtures>({
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: 'http://localhost:3001',
      // TODO: Add headers if needed
    });

    await use(context);
    await context.dispose();
  },
});
`;
}

function main() {
  const opts = parseArgs();

  if (!opts.type || !opts.name) {
    console.error(
      'Usage: node scripts/generate-test.js --type <TYPE> --name <NAME>\n'
    );
    console.error('Available types:');
    Object.keys(TEMPLATES).forEach(t => console.error(`  - ${t}`));
    process.exit(1);
  }

  const { type, name } = opts;

  if (!TEMPLATES[type]) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  // Determine output path
  let outputDir, fileName;

  if (type === 'page-model') {
    outputDir = 'tests/e2e/pages';
    fileName = `${capitalCase(name)}.ts`;
  } else if (type === 'api-fixture') {
    outputDir = 'tests/e2e/fixtures';
    fileName = `${name}.fixture.ts`;
  } else {
    outputDir = 'tests/e2e/specs';
    fileName = `${type}-${name}.spec.ts`;
  }

  const outputPath = path.join(outputDir, fileName);

  // Check if file exists
  if (fs.existsSync(outputPath)) {
    console.error(`File already exists: ${outputPath}`);
    process.exit(1);
  }

  // Create output directory if needed
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate content
  const generator = TEMPLATES[type];
  const content = generator(name);

  // Write file
  fs.writeFileSync(outputPath, content);

  console.log(`Generated: ${outputPath}`);
  console.log(`\nNext steps:\n1. Edit ${outputPath} to implement your tests\n2. Run: npx playwright test ${fileName}`);
}

main();
