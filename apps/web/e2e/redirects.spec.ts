import { test, expect } from '@playwright/test';

const redirects = [
    ['/quality/runs', '/test/runs'],
    ['/runs', '/test/runs'],
    ['/test-runs', '/test/runs'],
    ['/quality/results', '/test/runs?tab=results'],
    ['/results', '/test/runs?tab=results'],
    ['/quality/projects', '/work/projects'],
    ['/quality/tasks', '/work/tasks'],
    ['/quality/bugs', '/work/bugs'],
    ['/quality/cases', '/test/cases'],
    ['/quality/suites', '/test/suites'],
] as const;

test.describe('Legacy route redirects', () => {
    for (const [source, destination] of redirects) {
        test(`${source} redirects to ${destination}`, async ({ request }) => {
            const response = await request.get(source, { maxRedirects: 0 });

            expect(response.status()).toBe(307);
            expect(response.headers().location).toBe(destination);
        });
    }
});
