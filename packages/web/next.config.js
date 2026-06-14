const withNextIntl = require('next-intl/plugin')();

const isStaticExport = process.env.STATIC_EXPORT === '1';
const isDockerBuild = process.env.DOCKER_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: isStaticExport ? 'export' : isDockerBuild ? 'standalone' : undefined,
  images: { unoptimized: isStaticExport },
  trailingSlash: isStaticExport ? true : undefined,
  transpilePackages: ['@read-pal/shared'],
  compiler: {
    // Strip console.error and console.warn in production (keeps console.log for debugging)
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['log'] }
      : false,
  },
  async rewrites() {
    // Docker: nginx handles proxying, skip rewrites.
    // Dev: always proxy /api/* to backend, even when NEXT_PUBLIC_API_URL is empty
    // (empty NEXT_PUBLIC_API_URL = relative client URLs = no CORS).
    const apiTarget = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000';
    if (process.env.DOCKER_BUILD === '1') return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
  poweredByHeader: false,
  // Dev server proxy timeout — AI-heavy endpoints (reading-book generation,
  // cross-book synthesis, flashcard generation) can take several minutes.
  // Default Node.js proxy is 30s which surfaces as opaque "Internal Server
  // Error" well before the backend finishes. 5 min matches the longest LLM
  // pipeline plus retry budget. Production uses nginx (see proxy.conf) so this
  // only applies to `next dev`.
  experimental: {
    proxyTimeout: 300_000,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '0' },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
