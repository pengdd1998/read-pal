'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

function LoginRedirect() {
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

export default function LoginPage() {
 return (
 <Suspense>
  <LoginRedirect />
 </Suspense>
 );
}
