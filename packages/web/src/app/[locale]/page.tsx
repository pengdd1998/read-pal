import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
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

const STEP_ICONS = [
  <svg key="1" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
  </svg>,
  <svg key="2" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  </svg>,
  <svg key="3" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>,
];

export default async function HomePage() {
  const t = await getTranslations('landing');

  const FRIENDS = [
    { emoji: '\uD83E\uDDD9', name: t('persona_sage_name'), desc: t('persona_sage_desc_short'), accent: 'border-l-sage' },
    { emoji: '\uD83C\uDF1F', name: t('persona_penny_name'), desc: t('persona_penny_desc_short'), accent: 'border-l-amber-500' },
    { emoji: '\u26A1', name: t('persona_alex_name'), desc: t('persona_alex_desc_short'), accent: 'border-l-russet' },
    { emoji: '\uD83C\uDF19', name: t('persona_quinn_name'), desc: t('persona_quinn_desc_short'), accent: 'border-l-navy-400' },
    { emoji: '\uD83D\uDCDA', name: t('persona_sam_name'), desc: t('persona_sam_desc_short'), accent: 'border-l-forest' },
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

  const FAQ_SCHEMA = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <div className="min-h-[80vh]">
      {/* Hero */}
      <section className="relative overflow-hidden noise-overlay">
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 -z-10">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-28 pb-24 text-center">
          {/* Animated gradient badge */}
          <div className="animate-fade-in">
            <span className="badge-gradient inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-full shadow-glow">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              {t('beta_badge')}
            </span>
          </div>

          <h1 className="mt-10 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-navy-700 dark:text-white leading-[0.95] animate-slide-up font-display">
            {t('hero_title_before')}
            <br />
            <span className="text-gradient">{t('hero_title_highlight')}</span>
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed animate-slide-up-delayed">
            {t('hero_subtitle')}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-slide-up-delayed">
            <Link
              href="/auth?mode=register"
              className="btn btn-primary btn-glow px-8 py-4 text-base rounded-2xl shadow-glow-amber"
            >
              {t('cta_primary')}
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/auth?mode=login"
              className="btn btn-secondary px-8 py-4 text-base rounded-2xl"
            >
              {t('cta_signin')}
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof Stats */}
      <section className="bg-surface-1 pt-8 pb-4">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center py-6">
            {[
              { value: '140+', label: t('stats_endpoints') },
              { value: '275', label: t('stats_tests') },
              { value: '16', label: t('stats_models') },
              { value: '5', label: t('stats_personas') },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl sm:text-3xl font-bold text-primary-500">{stat.value}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-surface-1 pt-4 pb-20">
        {/* Trust bar */}
        <div className="max-w-5xl mx-auto px-4 mb-16">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {t('trust_free')}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {t('trust_nocard')}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {t('trust_epub')}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {t('trust_opensource')}
            </span>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
              {t('how_title')}
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              {t('how_subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.number} className="step-connector text-center group">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 mb-5 group-hover:bg-primary-500 group-hover:text-white transition-all duration-300">
                  {STEP_ICONS[i]}
                </div>
                <div className="text-xs font-mono font-bold text-primary-500 tracking-wider mb-2">{step.number}</div>
                <h3 className="text-lg font-bold text-navy-700 dark:text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Reading Experience */}
      <section className="bg-gradient-to-b from-surface-1 to-transparent py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight mb-4 font-display">
              {t('reading_better_title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              {t('reading_better_subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '\uD83D\uDDA5',
                title: t('exp1_title'),
                desc: t('exp1_desc'),
              },
              {
                icon: '\uD83D\uDCDD',
                title: t('exp2_title'),
                desc: t('exp2_desc'),
              },
              {
                icon: '\uD83C\uDF1F',
                title: t('exp3_title'),
                desc: t('exp3_desc'),
              },
            ].map((item) => (
              <div key={item.title} className="card text-center group hover:shadow-lg transition-shadow duration-300">
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="font-bold text-navy-700 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reading Friends */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            {t('personas_title')}
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
            {t('personas_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {FRIENDS.map((friend) => (
            <div key={friend.name} className={`card-hover text-center border-l-4 ${friend.accent}`}>
              <div className="text-4xl mb-3">{friend.emoji}</div>
              <h3 className="font-bold text-gray-900 dark:text-white">{friend.name}</h3>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{friend.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            {t('everything_title')}
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
            {t('everything_subtitle')}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {[
            { icon: '\uD83D\uDCD6', title: t('feat_reader_title'), desc: t('feat_reader_desc') },
            { icon: '\uD83E\uDD16', title: t('feat_agents_title'), desc: t('feat_agents_desc') },
            { icon: '\uD83D\uDCA1', title: t('feat_highlights_title'), desc: t('feat_highlights_desc') },
            { icon: '\uD83D\uDD78\uFE0F', title: t('feat_graph_title'), desc: t('feat_graph_desc') },
            { icon: '\uD83D\uDD25', title: t('feat_streaks_title'), desc: t('feat_streaks_desc') },
            { icon: '\uD83D\uDCD3', title: t('feat_memory_title'), desc: t('feat_memory_desc') },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-shadow">
              <span className="text-3xl flex-shrink-0">{f.icon}</span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Built For */}
      <section className="bg-surface-1 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
              {t('built_for_title')}
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              {t('built_for_subtitle')}
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                emoji: '\uD83C\uDF93',
                title: t('student_title'),
                desc: t('student_desc'),
                features: [t('student_feat1'), t('student_feat2'), t('student_feat3')],
              },
              {
                emoji: '\uD83D\uDD0D',
                title: t('researcher_title'),
                desc: t('researcher_desc'),
                features: [t('researcher_feat1'), t('researcher_feat2'), t('researcher_feat3')],
              },
              {
                emoji: '\uD83D\uDCDA',
                title: t('booklover_title'),
                desc: t('booklover_desc'),
                features: [t('booklover_feat1'), t('booklover_feat2'), t('booklover_feat3')],
              },
            ].map((persona) => (
              <div key={persona.title} className="card-hover text-center">
                <div className="text-4xl mb-4">{persona.emoji}</div>
                <h3 className="text-lg font-bold text-navy-700 dark:text-white mb-2">{persona.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">{persona.desc}</p>
                <ul className="space-y-1.5">
                  {persona.features.map((f) => (
                    <li key={f} className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
                      <svg className="w-3 h-3 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Source */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-navy-700/5 to-primary-500/5 dark:from-navy-700/20 dark:to-primary-500/10 p-10 sm:p-14">
          <div className="grid sm:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
                {t('oss_title')}
              </h2>
              <p className="mt-4 text-gray-600 dark:text-gray-400 leading-relaxed">
                {t('oss_subtitle')}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {[t('oss_tag_python'), t('oss_tag_nextjs'), t('oss_tag_postgres'), t('oss_tag_mit')].map((tag) => (
                  <span key={tag} className="px-3 py-1.5 text-xs font-medium rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              {[
                { value: '275+', label: t('oss_stat_tests') },
                { value: '27', label: t('oss_stat_routers') },
                { value: '140+', label: t('oss_stat_endpoints') },
                { value: '50+', label: t('oss_stat_components') },
              ].map((stat) => (
                <div key={stat.label} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-primary-500">{stat.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            {t('faq_title')}
          </h2>
        </div>
        <div className="space-y-6">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">{faq.q}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(FAQ_SCHEMA),
          }}
        />
      </section>

      {/* GitHub Star CTA */}
      <section className="max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <span className="text-gray-700 dark:text-gray-300 font-medium">{t('love_text')}</span>
          <a
            href="https://github.com/pengdd1998/read-pal"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            {t('star_button')}
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 dark:from-navy-900 dark:via-gray-950 dark:to-navy-900 py-24 noise-overlay">
        <div className="hero-orb hero-orb-1 opacity-30" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-5 font-display">
            {t('cta_join_title')}
          </h2>
          <p className="text-gray-300 text-lg mb-10">
            {t('cta_join_subtitle')}
          </p>
          <Link href="/auth?mode=register" className="btn btn-primary btn-glow px-10 py-4 text-base rounded-2xl shadow-glow-amber">
            {t('cta_join_button')}
          </Link>
          <p className="text-sm text-gray-400 mt-5">{t('free_during_beta')}</p>
        </div>
      </section>
    </div>
  );
}
