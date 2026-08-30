const withNextIntl = require('next-intl/plugin')();

const isStaticExport = process.env.STATIC_EXPORT === '1';
const isDockerBuild = process.env.DOCKER_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: isStaticExport ? 'export' : isDockerBuild ? 'standalone' : undefined,
  // Covers are served from object storage (MinIO/S3) over direct URLs the
  // browser fetches. Disable next/image optimization so any host works without
  // remotePatterns config (optimization isn't needed for small cover thumbnails).
  images: { unoptimized: true },
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
          {
            // Mirrors docker/nginx.conf's CSP so `next start` and static
            // exports get the same protection as the docker/nginx path.
            // Differences, both deliberate for non-docker self-hosting:
            // - connect-src allows any http(s)/ws origin: NEXT_PUBLIC_API_URL
            //   may point at a remote backend (nginx path is same-origin).
            // - img-src allows http: — covers can come from a LAN MinIO.
            // 'unsafe-inline'/'unsafe-eval' are required by Next.js's
            // hydration bootstrap and dev-mode React Refresh.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https: http: ws: wss:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
