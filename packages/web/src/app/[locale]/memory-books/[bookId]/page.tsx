import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PersonalBookPage from './Client';

export async function generateMetadata(): Promise<Metadata> {
 const t = await getTranslations('memoryBooks');
 return { title: `${t('detailPageTitle')} | read-pal` };
}

export async function generateStaticParams() {
 return [{ bookId: '_' }];
}

export default function Page() {
 return <PersonalBookPage />;
}
