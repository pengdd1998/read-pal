'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

export default function LoginPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = params.locale as string;

  useEffect(() => {
    const paramsStr = new URLSearchParams();
    paramsStr.set('mode', 'login');
    const next = searchParams.get('next');
    if (next) paramsStr.set('next', next);
    router.replace(`/${locale}/auth?${paramsStr.toString()}`);
  }, [locale, searchParams, router]);

  return null;
}
