/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {},
    // RFC 8288 Link headers for agent discovery
    async headers() {
        const siteUrl = process.env.PUBLIC_SITE_URL || 'https://gebrils.cloud';
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Link',
                        value: [
                            `<${siteUrl}/robots.txt>; rel="robots"`,
                            `<${siteUrl}/sitemap.xml>; rel="sitemap"`,
                        ].join(', '),
                    },
                ],
            },
        ];
    },
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
            { source: '/quality/runs', destination: '/test/runs', permanent: false },
            { source: '/quality/runs/:path*', destination: '/test/runs/:path*', permanent: false },
            { source: '/quality/results', destination: '/test/runs?tab=results', permanent: false },
            { source: '/quality/results/:path*', destination: '/test/results/:path*', permanent: false },
            { source: '/runs', destination: '/test/runs', permanent: false },
            { source: '/runs/:path*', destination: '/test/runs/:path*', permanent: false },
            { source: '/test-runs', destination: '/test/runs', permanent: false },
            { source: '/test-runs/:path*', destination: '/test/runs/:path*', permanent: false },
            { source: '/results', destination: '/test/runs?tab=results', permanent: false },
            { source: '/results/:path*', destination: '/test/results/:path*', permanent: false },
            { source: '/quality/projects', destination: '/work/projects', permanent: false },
            { source: '/quality/projects/:path*', destination: '/work/projects/:path*', permanent: false },
            { source: '/quality/stories', destination: '/work/stories', permanent: false },
            { source: '/quality/stories/:path*', destination: '/work/stories/:path*', permanent: false },
            { source: '/quality/tasks', destination: '/work/tasks', permanent: false },
            { source: '/quality/tasks/:path*', destination: '/work/tasks/:path*', permanent: false },
            { source: '/quality/bugs', destination: '/work/bugs', permanent: false },
            { source: '/quality/bugs/:path*', destination: '/work/bugs/:path*', permanent: false },
            { source: '/quality/cases', destination: '/test/cases', permanent: false },
            { source: '/quality/cases/:path*', destination: '/test/cases/:path*', permanent: false },
            { source: '/quality/suites', destination: '/test/suites', permanent: false },
            { source: '/quality/suites/:path*', destination: '/test/suites/:path*', permanent: false },
        ];
    },
}

module.exports = nextConfig
