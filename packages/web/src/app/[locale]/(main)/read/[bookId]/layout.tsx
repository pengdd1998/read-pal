import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
 const { locale } = await params;
 const t = await getTranslations({ locale, namespace: 'seo' });
 return {
 title: t('reader_title'),
 description: t('reader_description'),
 openGraph: {
 title: t('reader_og_title'),
 description: t('reader_og_description'),
 },
 };
}

export default function ReadLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 return children;
}
