import { test, expect } from '@playwright/test';

// Regression: the public landing nav "Sign up" CTA is a fixed affordance that
// must send new visitors to the registration page, independent of the
// admin-configurable hero CTA.

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

test.describe('Landing page CTAs', () => {
    test('nav "Sign up" button links to the register page', async ({ page }) => {
        await page.route('**/public/landing-page', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(LANDING_FIXTURE),
            }),
        );

        await page.goto('/');

        const signUp = page.locator('header a', { hasText: 'Sign up' });
        await expect(signUp).toBeVisible();
        await expect(signUp).toHaveAttribute('href', 'https://gebrils.cloud/register');

        // The configurable hero CTA must stay independent of the Sign up button.
        const heroCta = page.locator('#top a', { hasText: 'Open QC-Manager' }).first();
        await expect(heroCta).toHaveAttribute('href', '/login');
    });
});
