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
};

module.exports = withNextIntl(nextConfig);
