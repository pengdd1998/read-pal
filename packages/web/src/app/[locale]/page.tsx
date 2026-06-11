import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ReadingExperienceSection } from '@/components/landing/ReadingExperienceSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { CTASection } from '@/components/landing/CTASection';

export async function generateMetadata({
 params,
}: {
 params: Promise<{ locale: string }>;
}): Promise<Metadata> {
 const { locale } = await params;
 setRequestLocale(locale);
 const t = await getTranslations('landing');

 const ogLocale = locale === 'zh' ? 'zh_CN' : 'en_US';
 const altLocale = locale === 'zh' ? 'en_US' : 'zh_CN';

 return {
 title: t('meta_title'),
 description: t('meta_description'),
 alternates: {
  canonical: `/${locale}`,
  languages: {
  en: '/en',
  zh: '/zh',
  },
 },
 openGraph: {
  title: t('og_title'),
  description: t('og_description'),
  url: `/${locale}`,
  locale: ogLocale,
  alternateLocale: altLocale,
  type: 'website',
  siteName: 'read-pal',
  images: [
  {
   url: '/opengraph-image',
   width: 1200,
   height: 630,
   alt: t('og_title'),
  },
  ],
 },
 twitter: {
  card: 'summary_large_image',
  title: t('og_title'),
  description: t('og_description'),
  images: ['/opengraph-image'],
 },
 };
}

export default async function HomePage({
 params,
}: {
 params: Promise<{ locale: string }>;
}) {
 const { locale } = await params;
 setRequestLocale(locale);
 const t = await getTranslations('landing');

 const STEPS = [
 { number: '01', title: t('step1_title'), desc: t('step1_desc') },
 { number: '02', title: t('step2_title'), desc: t('step2_desc') },
 { number: '03', title: t('step3_title'), desc: t('step3_desc') },
 ];

 const TRUST_ITEMS = [
 t('trust_free'),
 t('trust_nocard'),
 t('trust_epub'),
 t('trust_opensource'),
 ];

 const EXPERIENCES = [
 { icon: '🖥', title: t('exp1_title'), desc: t('exp1_desc') },
 { icon: '📝', title: t('exp2_title'), desc: t('exp2_desc') },
 { icon: '🌟', title: t('exp3_title'), desc: t('exp3_desc') },
 ];

 const FEATURES = [
 { icon: '📖', title: t('feat_reader_title'), desc: t('feat_reader_desc') },
 { icon: '🤖', title: t('feat_agents_title'), desc: t('feat_agents_desc') },
 { icon: '💡', title: t('feat_highlights_title'), desc: t('feat_highlights_desc') },
 { icon: '🕸️', title: t('feat_graph_title'), desc: t('feat_graph_desc') },
 { icon: '🔥', title: t('feat_streaks_title'), desc: t('feat_streaks_desc') },
 { icon: '📓', title: t('feat_memory_title'), desc: t('feat_memory_desc') },
 ];

 return (
 <div className="min-h-[80vh]">
  <HeroSection
  beta_badge={t('beta_badge')}
  hero_title_before={t('hero_title_before')}
  hero_title_highlight={t('hero_title_highlight')}
  hero_subtitle={t('hero_subtitle')}
  cta_primary={t('cta_primary')}
  cta_signin={t('cta_signin')}
  />

  <HowItWorksSection
  trust_items={TRUST_ITEMS}
  how_title={t('how_title')}
  how_subtitle={t('how_subtitle')}
  steps={STEPS}
  />

  <ReadingExperienceSection
  reading_better_title={t('reading_better_title')}
  reading_better_subtitle={t('reading_better_subtitle')}
  experiences={EXPERIENCES}
  />

  <FeaturesSection
  everything_title={t('everything_title')}
  everything_subtitle={t('everything_subtitle')}
  features={FEATURES}
  />

  <CTASection
  love_text={t('love_text')}
  star_button={t('star_button')}
  cta_join_title={t('cta_join_title')}
  cta_join_subtitle={t('cta_join_subtitle')}
  cta_join_button={t('cta_join_button')}
  free_during_beta={t('free_during_beta')}
  />
 </div>
 );
}
