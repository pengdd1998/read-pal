import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('terms');
  return { title: t('page_title') };
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
