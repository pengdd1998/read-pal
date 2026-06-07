import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
 const { locale } = await params;
 const t = await getTranslations({ locale, namespace: 'seo' });
 return {
 title: t('stats_title'),
 description: t('stats_description'),
 robots: { index: false, follow: true },
 };
}

export default function StatsLayout({ children }: { children: React.ReactNode }) {
 return children;
}
