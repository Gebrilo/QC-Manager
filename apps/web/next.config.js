/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        // serverActions: true, // If using server actions in future
    },
    async rewrites() {
        // Proxy /api-proxy/* → internal API container (server-side only, no CORS)
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
