import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('library');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
