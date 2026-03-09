import { Page, Locator } from '@playwright/test';

export class TaskBoard {
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
