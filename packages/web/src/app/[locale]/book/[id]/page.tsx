import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import BookDetailPage from './Client';

export async function generateMetadata(): Promise<Metadata> {
 const t = await getTranslations('book');
 return { title: `${t('detailPageTitle')} | read-pal` };
}

export async function generateStaticParams() {
 return [{ id: '_' }];
}

export default function Page() {
 return <BookDetailPage />;
}
