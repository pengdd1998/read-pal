import { redirect } from 'next/navigation';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const paramsStr = new URLSearchParams();
  paramsStr.set('mode', 'login');
  const next = typeof sp?.next === 'string' ? sp.next : undefined;
  if (next) paramsStr.set('next', next);

  redirect(`/${locale}/auth?${paramsStr.toString()}`);
}
