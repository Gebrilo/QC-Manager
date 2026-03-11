import { Page } from '@playwright/test';

type MockUser = {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'user' | 'viewer' | 'contributor';
    activated: boolean;
    preferences?: Record<string, unknown>;
};

const defaultUser: MockUser = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'E2E Admin',
    email: 'e2e-admin@example.com',
    role: 'admin',
    activated: true,
    preferences: { default_page: '/dashboard' },
};

const adminPermissions = [
    'page:dashboard',
    'page:tasks',
    'page:projects',
    'page:resources',
    'page:governance',
    'page:test-executions',
    'page:reports',
    'page:my-tasks',
    'page:task-history',
    'page:roles',
    'page:journeys',
    'page:teams',
    'page:users',
    'action:tasks:create',
    'action:projects:create',
    'action:resources:create',
];

export async function mockAuthenticatedSession(
    page: Page,
    options?: { user?: Partial<MockUser>; permissions?: string[]; token?: string }
) {
    const user = { ...defaultUser, ...options?.user };
    const permissions = options?.permissions || adminPermissions;
    const token = options?.token || 'e2e-auth-token';

    await page.addInitScript((value) => {
        window.localStorage.setItem('auth_token', value);
    }, token);

    // Mock both the old production API and new localhost API URLs
    await page.route('**/auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user, permissions }),
        });
    });
    await page.route('http://localhost:3001/auth/me*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user, permissions }),
        });
    });
}

export async function seedAuth(page: Page, token = 'e2e-auth-token') {
    await mockAuthenticatedSession(page, { token });
}
