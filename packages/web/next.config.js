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
    // In Docker, nginx handles API proxying — skip rewrites when API_URL is empty
    const apiTarget = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
    if (!apiTarget) return [];
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://open.bigmodel.cn",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
