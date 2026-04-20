'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/hooks/usePageTitle';

function OAuthCallback() {
  usePageTitle('Signing in...');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { oauthLogin } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const userStr = searchParams.get('user');
    const error = searchParams.get('error');

    if (error) {
      router.replace(`/auth?mode=login&error=${encodeURIComponent(error)}`);
      return;
    }

    if (!token || !userStr) {
      router.replace('/auth?mode=login&error=OAuth callback missing data');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      oauthLogin(token, user);
      router.push('/dashboard');
    } catch {
      router.replace('/auth?mode=login&error=Failed to parse OAuth response');
    }
  }, [searchParams, router, oauthLogin]);

  return (
    <main className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Completing sign in...</p>
      </div>
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Completing sign in...</p>
        </div>
      </main>
    }>
      <OAuthCallback />
    </Suspense>
  );
}
