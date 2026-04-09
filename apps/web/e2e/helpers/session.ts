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

    const supabaseSession = JSON.stringify({
        access_token: token,
        refresh_token: 'e2e-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
            id: user.id,
            email: user.email,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: { full_name: user.name },
        },
    });

    await page.addInitScript((values) => {
        window.localStorage.setItem('auth_token', values.token);
        window.localStorage.setItem('sb-placeholder-auth-token', values.session);
    }, { token, session: supabaseSession });

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

    // Mock Supabase GoTrue auth endpoints
    await page.route('**/placeholder.supabase.co/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/token') || url.includes('/oauth')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: token,
                    refresh_token: 'e2e-refresh-token',
                    token_type: 'bearer',
                    expires_in: 3600,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                    user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' },
                }),
            });
        } else if (url.includes('/user')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' }),
            });
        } else {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
    });
}

export async function seedAuth(page: Page, token = 'e2e-auth-token') {
    await mockAuthenticatedSession(page, { token });
}
