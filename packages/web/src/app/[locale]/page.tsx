import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ReadingExperienceSection } from '@/components/landing/ReadingExperienceSection';
import { PersonasSection } from '@/components/landing/PersonasSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { BuiltForSection } from '@/components/landing/BuiltForSection';
import { OpenSourceSection } from '@/components/landing/OpenSourceSection';
import { FAQSection } from '@/components/landing/FAQSection';
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

 const FRIENDS = [
 { emoji: '🧙', name: t('persona_sage_name'), desc: t('persona_sage_desc_short'), accent: 'border-l-sage' },
 { emoji: '🌟', name: t('persona_penny_name'), desc: t('persona_penny_desc_short'), accent: 'border-l-amber-500' },
 { emoji: '⚡', name: t('persona_alex_name'), desc: t('persona_alex_desc_short'), accent: 'border-l-russet' },
 { emoji: '🌙', name: t('persona_quinn_name'), desc: t('persona_quinn_desc_short'), accent: 'border-l-navy-400' },
 { emoji: '📚', name: t('persona_sam_name'), desc: t('persona_sam_desc_short'), accent: 'border-l-forest' },
 ];

 const STEPS = [
 { number: '01', title: t('step1_title'), desc: t('step1_desc') },
 { number: '02', title: t('step2_title'), desc: t('step2_desc') },
 { number: '03', title: t('step3_title'), desc: t('step3_desc') },
 ];

 const FAQS = [
 { q: t('faq1_q'), a: t('faq1_a') },
 { q: t('faq2_q'), a: t('faq2_a') },
 { q: t('faq3_q'), a: t('faq3_a') },
 { q: t('faq4_q'), a: t('faq4_a') },
 { q: t('faq5_q'), a: t('faq5_a') },
 { q: t('faq6_q'), a: t('faq6_a') },
 ];

 const STATS = [
 { value: '140+', label: t('stats_endpoints') },
 { value: '275', label: t('stats_tests') },
 { value: '16', label: t('stats_models') },
 { value: '5', label: t('stats_personas') },
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

 const BUILT_FOR_PERSONAS = [
 {
  emoji: '🎓',
  title: t('student_title'),
  desc: t('student_desc'),
  features: [t('student_feat1'), t('student_feat2'), t('student_feat3')],
 },
 {
  emoji: '🔍',
  title: t('researcher_title'),
  desc: t('researcher_desc'),
  features: [t('researcher_feat1'), t('researcher_feat2'), t('researcher_feat3')],
 },
 {
  emoji: '📚',
  title: t('booklover_title'),
  desc: t('booklover_desc'),
  features: [t('booklover_feat1'), t('booklover_feat2'), t('booklover_feat3')],
 },
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
  stats={STATS}
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

  <PersonasSection
  personas_title={t('personas_title')}
  personas_subtitle={t('personas_subtitle')}
  friends={FRIENDS}
  />

  <FeaturesSection
  everything_title={t('everything_title')}
  everything_subtitle={t('everything_subtitle')}
  features={FEATURES}
  />

  <BuiltForSection
  built_for_title={t('built_for_title')}
  built_for_subtitle={t('built_for_subtitle')}
  personas={BUILT_FOR_PERSONAS}
  />

  <OpenSourceSection
  oss_title={t('oss_title')}
  oss_subtitle={t('oss_subtitle')}
  oss_tags={[t('oss_tag_python'), t('oss_tag_nextjs'), t('oss_tag_postgres'), t('oss_tag_mit')]}
  oss_stats={[
   { value: '275+', label: t('oss_stat_tests') },
   { value: '27', label: t('oss_stat_routers') },
   { value: '140+', label: t('oss_stat_endpoints') },
   { value: '50+', label: t('oss_stat_components') },
  ]}
  />

  <FAQSection faq_title={t('faq_title')} faqs={FAQS} />

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
