import { test as base, APIRequestContext } from '@playwright/test';

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
