import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ReadPage from './Client';

export async function generateMetadata(): Promise<Metadata> {
 const t = await getTranslations('reader');
 return { title: `${t('page_title')} | read-pal` };
}

export async function generateStaticParams() {
 return [{ bookId: '_' }];
}

export default function Page() {
 return <ReadPage />;
}
