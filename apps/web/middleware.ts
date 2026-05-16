import { NextRequest, NextResponse } from 'next/server';

const legacyPathPatterns = [
    /^\/dashboard$/,
    /^\/my-dashboard$/,
    /^\/my-tasks$/,
    /^\/journeys(?:\/.*)?$/,
    /^\/development-plan(?:\/.*)?$/,
    /^\/preferences$/,
    /^\/tasks(?:\/.*)?$/,
    /^\/projects(?:\/.*)?$/,
    /^\/bugs(?:\/.*)?$/,
    /^\/user-stories(?:\/.*)?$/,
    /^\/test-cases(?:\/.*)?$/,
    /^\/test-suites(?:\/.*)?$/,
    /^\/test-executions$/,
    /^\/test-runs(?:\/.*)?$/,
    /^\/test-results(?:\/.*)?$/,
    /^\/governance$/,
    /^\/reports$/,
    /^\/resources(?:\/.*)?$/,
    /^\/manage-development-plans(?:\/.*)?$/,
    /^\/settings(?:\/.*)?$/,
    /^\/users$/,
    /^\/task-history$/,
];

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    if (legacyPathPatterns.some(pattern => pattern.test(pathname))) {
        return new NextResponse(null, { status: 404 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/dashboard',
        '/my-dashboard',
        '/my-tasks',
        '/journeys/:path*',
        '/development-plan/:path*',
        '/preferences',
        '/tasks/:path*',
        '/projects/:path*',
        '/bugs/:path*',
        '/user-stories/:path*',
        '/test-cases/:path*',
        '/test-suites/:path*',
        '/test-executions',
        '/test-runs/:path*',
        '/test-results/:path*',
        '/governance',
        '/reports',
        '/resources/:path*',
        '/manage-development-plans/:path*',
        '/settings/:path*',
        '/users',
        '/task-history',
    ],
};
