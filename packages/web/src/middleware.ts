import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Route protection middleware.
 *
 * Redirects unauthenticated users away from protected pages to /login.
 * Auth state is tracked via an `auth_token` cookie set by the AuthProvider.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/library', '/read/', '/settings', '/memory-books', '/search'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;

  // Redirect authenticated users from landing page to dashboard
  if (pathname === '/' && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Only check protected routes
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  if (!token) {
    const authUrl = new URL('/auth', request.url);
    authUrl.searchParams.set('mode', 'login');
    authUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(authUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except static files, api routes, and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
