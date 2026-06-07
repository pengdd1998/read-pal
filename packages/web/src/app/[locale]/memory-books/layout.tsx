import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
 const { locale } = await params;
 const t = await getTranslations({ locale, namespace: 'seo' });
 return {
 title: t('memory_books_title'),
 description: t('memory_books_description'),
 robots: { index: false, follow: true },
 };
}

export default function MemoryBooksLayout({ children }: { children: React.ReactNode }) {
 return children;
}
