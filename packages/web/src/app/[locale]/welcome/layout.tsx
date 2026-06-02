import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });
  return {
    title: t('welcome_title'),
    description: t('welcome_description'),
  };
}

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
