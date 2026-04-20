import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

/**
 * Combined i18n + route protection middleware.
 *
 * 1. Handles locale detection and URL prefixing (next-intl).
 * 2. Redirects unauthenticated users away from protected pages to /login.
 * Auth state is tracked via an `auth_token` cookie set by the AuthProvider.
 */

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/library',
  '/read/',
  '/settings',
  '/memory-books',
  '/search',
  '/stats',
  '/flashcards',
  '/book-clubs',
  '/knowledge',
  '/challenges',
  '/offline',
  '/welcome',
];

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      return pathname.slice(`/${locale}`.length) || '/';
    }
  }
  return pathname;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;

  // Strip locale prefix to check the actual route path
  const barePath = stripLocale(pathname);

  // Redirect authenticated users from landing page to dashboard
  if (barePath === '/' && token) {
    const locale = routing.locales.find((l) =>
      pathname.startsWith(`/${l}`)
    ) || routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // Only check protected routes
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => barePath.startsWith(prefix),
  );
  if (isProtected && !token) {
    const locale = routing.locales.find((l) =>
      pathname.startsWith(`/${l}`)
    ) || routing.defaultLocale;
    const authUrl = new URL(`/${locale}/auth`, request.url);
    authUrl.searchParams.set('mode', 'login');
    authUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(authUrl);
  }

  // Delegate to next-intl middleware for locale handling
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(en|zh)/:path*'],
};
