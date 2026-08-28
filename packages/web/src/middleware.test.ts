/**
 * Middleware matcher + redirect tests.
 * Regression: locale-less deep links (/dashboard) used to 404 because the
 * matcher only covered '/' and '/(en|zh)/:path*'. The matcher now includes
 * raw app paths (excluding _next/api/static files), so they redirect.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const intlMock = vi.fn().mockReturnValue(new Response('intl', { status: 200 }));
vi.mock('next-intl/middleware', () => ({ default: () => intlMock }));
vi.mock('./i18n/routing', () => ({
  routing: { locales: ['en', 'zh'], defaultLocale: 'en' },
}));

const { middleware, config } = await import('./middleware');
type NextRequestLike = Parameters<typeof middleware>[0];

function matches(path: string): boolean {
  return config.matcher.some((pattern: string) => {
    if (pattern === '/') return path === '/';
    try {
      return new RegExp(`^${pattern}$`).test(path);
    } catch {
      return false;
    }
  });
}

function makeRequest(path: string, cookie?: string): NextRequestLike {
  const url = new URL(`http://localhost:3000${path}`);
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  const req = new Request(url, { headers }) as unknown as NextRequestLike;
  // middleware reads NextRequest.nextUrl + NextRequest.cookies — attach both
  (req as unknown as { nextUrl: URL }).nextUrl = url;
  (req as unknown as { cookies: { get: (k: string) => { value: string } | undefined } }).cookies = {
    get: (k: string) => (cookie && k === 'auth_token' ? { value: cookie } : undefined),
  };
  return req;
}

describe('middleware matcher', () => {
  it('matches locale-less protected deep links (the P2 fix)', () => {
    expect(matches('/dashboard')).toBe(true);
    expect(matches('/library')).toBe(true);
    expect(matches('/read/some-book-id')).toBe(true);
    expect(matches('/stats')).toBe(true);
    expect(matches('/memory-books')).toBe(true);
  });

  it('still matches locale-prefixed paths', () => {
    expect(matches('/en/dashboard')).toBe(true);
    expect(matches('/zh/library/x')).toBe(true);
  });

  it('excludes Next internals and API routes', () => {
    expect(matches('/_next/static/chunk.js')).toBe(false);
    expect(matches('/_next/image?a=b')).toBe(false);
    expect(matches('/api/health')).toBe(false);
  });
});

describe('middleware behavior', () => {
  beforeEach(() => {
    intlMock.mockClear();
  });

  it('redirects unauthenticated locale-less protected path to locale auth', async () => {
    const res = await middleware(makeRequest('/dashboard'));
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') || '';
    const u = new URL(loc);
    expect(u.pathname).toBe('/en/auth');
    expect(u.searchParams.get('mode')).toBe('login');
    expect(u.searchParams.get('next')).toBe('/dashboard');
  });

  it('redirects unauthenticated locale-prefixed protected path the same way', async () => {
    const res = await middleware(makeRequest('/en/dashboard'));
    expect(res.status).toBe(307);
    const u = new URL(res.headers.get('location') || '');
    expect(u.pathname).toBe('/en/auth');
  });

  it('delegates authenticated requests to intl middleware (locale prefixing)', async () => {
    await middleware(makeRequest('/dashboard', 'auth_token=abc'));
    expect(intlMock).toHaveBeenCalled();
  });

  it('delegates non-protected paths (landing, auth) to intl middleware', async () => {
    await middleware(makeRequest('/'));
    await middleware(makeRequest('/auth'));
    expect(intlMock).toHaveBeenCalledTimes(2);
  });
});
