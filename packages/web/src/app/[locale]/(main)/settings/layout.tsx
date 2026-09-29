import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('settings_page');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
