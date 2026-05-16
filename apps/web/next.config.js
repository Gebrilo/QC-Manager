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
}

module.exports = nextConfig
