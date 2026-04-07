import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Route protection middleware.
 *
 * Redirects unauthenticated users away from protected pages to /login.
 * Auth state is tracked via an `auth_token` cookie set by the AuthProvider.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/library', '/read/', '/settings', '/knowledge', '/chat', '/search'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only check protected routes
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except static files, api routes, and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
