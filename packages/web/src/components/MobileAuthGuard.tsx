'use client';

import { useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { isCapacitor } from '@/lib/capacitor';

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

export function MobileAuthGuard({ children }: { children: ReactNode }) {
 const { isAuthenticated, loading } = useAuth();
 const pathname = usePathname();
 const router = useRouter();

 useEffect(() => {
 if (!isCapacitor() || loading || isAuthenticated) return;

 const isProtected = PROTECTED_PREFIXES.some(
  (prefix) => pathname === prefix || pathname.startsWith(prefix),
 );

 if (isProtected) {
  router.replace(`/auth?mode=login&next=${encodeURIComponent(pathname)}`);
 }
 }, [isAuthenticated, loading, pathname, router]);

 if (isCapacitor() && loading) {
 return (
  <div className="min-h-screen flex items-center justify-center bg-surface-1">
  <div className="flex flex-col items-center gap-3">
   <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white text-sm font-bold animate-pulse">
   r
   </div>
   <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
  </div>
  </div>
 );
 }

 return <>{children}</>;
}
