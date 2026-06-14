import { test, expect } from '@playwright/test';

// Regression: the public landing page is a fixed light design. A returning
// visitor whose saved theme is `dark` left `.dark` on <html>, which let the
// global base rule `.dark h1 { color:#fff }` repaint the landing's headings
// white on its white background (invisible). The landing route must force
// light, while the rest of the app must still honour the saved dark theme.

const LANDING_FIXTURE = {
    config: {
        hero_title: 'Quality control, in one place',
        hero_subtitle: 'Plan, test, govern and report quality work.',
        hero_cta_label: 'Open QC-Manager',
        hero_cta_url: '/login',
        marketing_intro_title: 'Everything quality, connected',
        marketing_intro_description: 'One traceable chain.',
        show_features: false,
        show_roadmap: false,
        show_changelog: false,
        show_footer_cta: false,
        is_public: true,
    },
    features: [],
    roadmap_items: [],
    changelog_entries: [],
};

test.describe('Landing page theme', () => {
    test('forces light mode even when the saved theme is dark', async ({ page }) => {
        // Returning dark-mode visitor.
        await page.addInitScript(() => {
            try { localStorage.setItem('theme', 'dark'); } catch (_) { /* noop */ }
        });
        await page.route('**/public/landing-page', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(LANDING_FIXTURE),
            }),
        );

        await page.goto('/');

        const heading = page.getByRole('heading', { name: 'Quality control, in one place' });
        await expect(heading).toBeVisible();

        // The landing route must strip the persisted `.dark` class...
        await expect.poll(async () =>
            page.evaluate(() => document.documentElement.classList.contains('dark')),
        ).toBe(false);

        // ...so the hero heading is dark text, not the white-on-white symptom.
        const color = await heading.evaluate((el) => getComputedStyle(el).color);
        expect(color).not.toBe('rgb(255, 255, 255)');
    });

    test('keeps dark mode on app routes when the saved theme is dark', async ({ page }) => {
        await page.addInitScript(() => {
            try { localStorage.setItem('theme', 'dark'); } catch (_) { /* noop */ }
        });

        // /login is an app surface (not a light-only route): dark must survive.
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

        await expect.poll(async () =>
            page.evaluate(() => document.documentElement.classList.contains('dark')),
        ).toBe(true);
    });
});
