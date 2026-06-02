import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo' });
  return {
    title: t('knowledge_title'),
    description: t('knowledge_description'),
  };
}

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
