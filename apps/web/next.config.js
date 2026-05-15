/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {},
    async rewrites() {
        const apiInternal = process.env.API_INTERNAL_URL || 'http://qc-api:3001';
        return [
            {
                source: '/api-proxy/:path*',
                destination: `${apiInternal}/:path*`,
            },
        ];
    },
    async redirects() {
        return [
            // /me/*
            { source: '/my-tasks', destination: '/me/tasks', permanent: true },
            { source: '/journeys', destination: '/me/journeys', permanent: true },
            { source: '/journeys/:id', destination: '/me/journeys/:id', permanent: true },
            { source: '/development-plan', destination: '/me/idp', permanent: true },
            { source: '/development-plan/history', destination: '/me/idp/history', permanent: true },
            { source: '/development-plan/history/:planId', destination: '/me/idp/history/:planId', permanent: true },
            { source: '/my-dashboard', destination: '/me/dashboard', permanent: true },
            { source: '/preferences', destination: '/me/preferences', permanent: true },
            // /work/*
            { source: '/tasks', destination: '/work/tasks', permanent: true },
            { source: '/tasks/create', destination: '/work/tasks/create', permanent: true },
            { source: '/tasks/:id', destination: '/work/tasks/:id', permanent: true },
            { source: '/tasks/:id/edit', destination: '/work/tasks/:id/edit', permanent: true },
            { source: '/projects', destination: '/work/projects', permanent: true },
            { source: '/projects/create', destination: '/work/projects/create', permanent: true },
            { source: '/projects/:id', destination: '/work/projects/:id', permanent: true },
            { source: '/projects/:id/edit', destination: '/work/projects/:id/edit', permanent: true },
            { source: '/projects/:id/quality', destination: '/work/projects/:id/quality', permanent: true },
            { source: '/bugs', destination: '/work/bugs', permanent: true },
            { source: '/bugs/create', destination: '/work/bugs/create', permanent: true },
            { source: '/bugs/:id', destination: '/work/bugs/:id', permanent: true },
            { source: '/bugs/:id/edit', destination: '/work/bugs/:id/edit', permanent: true },
            { source: '/user-stories', destination: '/work/stories', permanent: true },
            { source: '/user-stories/create', destination: '/work/stories/create', permanent: true },
            { source: '/user-stories/:id', destination: '/work/stories/:id', permanent: true },
            { source: '/user-stories/:id/edit', destination: '/work/stories/:id/edit', permanent: true },
            // /test/*
            { source: '/test-cases', destination: '/test/cases', permanent: true },
            { source: '/test-cases/create', destination: '/test/cases/create', permanent: true },
            { source: '/test-cases/:id', destination: '/test/cases/:id', permanent: true },
            { source: '/test-cases/:id/edit', destination: '/test/cases/:id/edit', permanent: true },
            { source: '/test-suites', destination: '/test/suites', permanent: true },
            { source: '/test-suites/create', destination: '/test/suites/create', permanent: true },
            { source: '/test-suites/:id', destination: '/test/suites/:id', permanent: true },
            { source: '/test-suites/:id/edit', destination: '/test/suites/:id/edit', permanent: true },
            { source: '/test-executions', destination: '/test/runs', permanent: true },
            { source: '/test-runs/create', destination: '/test/runs/create', permanent: true },
            { source: '/test-runs/:id', destination: '/test/runs/:id', permanent: true },
            { source: '/test-results', destination: '/test/results', permanent: true },
            { source: '/test-results/upload', destination: '/test/results/upload', permanent: true },
            // /quality/*
            { source: '/governance', destination: '/quality/governance', permanent: true },
            { source: '/reports', destination: '/quality/reports', permanent: true },
            // /dashboard → /me/dashboard
            { source: '/dashboard', destination: '/me/dashboard', permanent: true },
            // /team/*
            { source: '/resources', destination: '/team/resources', permanent: true },
            { source: '/resources/create', destination: '/team/resources/create', permanent: true },
            { source: '/resources/:id', destination: '/team/resources/:id', permanent: true },
            { source: '/manage-development-plans', destination: '/team/idp', permanent: true },
            { source: '/manage-development-plans/:userId', destination: '/team/idp/:userId', permanent: true },
            { source: '/settings/team-journeys', destination: '/team/journeys', permanent: true },
            { source: '/settings/team-journeys/:userId/:journeyId', destination: '/team/journeys/:userId/:journeyId', permanent: true },
            { source: '/task-history', destination: '/team/history', permanent: true },
            // /admin/*
            { source: '/settings', destination: '/admin', permanent: true },
            { source: '/users', destination: '/admin/users', permanent: true },
            { source: '/settings/teams', destination: '/admin/teams', permanent: true },
            { source: '/settings/journeys', destination: '/admin/journeys', permanent: true },
            { source: '/settings/journeys/:id', destination: '/admin/journeys/:id', permanent: true },
            { source: '/settings/roles', destination: '/admin/roles', permanent: true },
            { source: '/settings/tuleap', destination: '/admin/integrations/tuleap', permanent: true },
        ];
    },
}

module.exports = nextConfig
