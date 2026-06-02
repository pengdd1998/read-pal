import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });
  return {
    title: t('offline_title'),
    description: t('offline_description'),
  };
}

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
