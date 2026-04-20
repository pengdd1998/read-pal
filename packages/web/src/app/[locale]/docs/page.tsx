import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function DocsPage() {
  const t = await getTranslations('docs');

  const SECTIONS = [
    {
      id: 'getting-started',
      title: t('section_getting_started'),
      icon: '🚀',
      items: [
        {
          title: t('getting_started_create_account'),
          content: t('getting_started_create_account_content'),
        },
        {
          title: t('getting_started_upload'),
          content: t('getting_started_upload_content'),
        },
        {
          title: t('getting_started_start_reading'),
          content: t('getting_started_start_reading_content'),
        },
        {
          title: t('getting_started_meet_companion'),
          content: t('getting_started_meet_companion_content'),
        },
      ],
    },
    {
      id: 'reading',
      title: t('section_reading'),
      icon: '📖',
      items: [
        {
          title: t('reading_highlights'),
          content: t('reading_highlights_content'),
        },
        {
          title: t('reading_bookmarks'),
          content: t('reading_bookmarks_content'),
        },
        {
          title: t('reading_streaks'),
          content: t('reading_streaks_content'),
        },
        {
          title: t('reading_study_mode'),
          content: t('reading_study_mode_content'),
        },
      ],
    },
    {
      id: 'ai-companion',
      title: t('section_ai'),
      icon: '🤖',
      items: [
        {
          title: t('ai_companion'),
          content: t('ai_companion_content'),
        },
        {
          title: t('ai_friends'),
          content: t('ai_friends_content'),
        },
        {
          title: t('ai_knowledge_graph'),
          content: t('ai_knowledge_graph_content'),
        },
        {
          title: t('ai_synthesis'),
          content: t('ai_synthesis_content'),
        },
      ],
    },
    {
      id: 'learning',
      title: t('section_learning'),
      icon: '🧠',
      items: [
        {
          title: t('learning_flashcards'),
          content: t('learning_flashcards_content'),
        },
        {
          title: t('learning_memory_books'),
          content: t('learning_memory_books_content'),
        },
        {
          title: t('learning_interventions'),
          content: t('learning_interventions_content'),
        },
      ],
    },
    {
      id: 'social',
      title: t('section_social'),
      icon: '🌟',
      items: [
        {
          title: t('social_book_clubs'),
          content: t('social_book_clubs_content'),
        },
        {
          title: t('social_reading_cards'),
          content: t('social_reading_cards_content'),
        },
        {
          title: t('social_export'),
          content: t('social_export_content'),
        },
      ],
    },
    {
      id: 'developer',
      title: t('section_developer'),
      icon: '💻',
      items: [
        {
          title: t('dev_rest_api'),
          content: t('dev_rest_api_content'),
        },
        {
          title: t('dev_webhooks'),
          content: t('dev_webhooks_content'),
        },
        {
          title: t('dev_api_keys'),
          content: t('dev_api_keys_content'),
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-navy-700 dark:bg-navy-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 text-sm text-amber-200 mb-4">
            <Link href="/" className="hover:text-white">{t('breadcrumb_home')}</Link>
            <span>/</span>
            <span>{t('breadcrumb_docs')}</span>
          </div>
          <h1 className="text-4xl font-bold font-display tracking-tight">{t('header_title')}</h1>
          <p className="text-gray-300 mt-3 text-lg max-w-2xl">
            {t('header_subtitle')}
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          {/* Sidebar nav */}
          <nav className="hidden lg:block space-y-1 sticky top-8 self-start">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:text-navy-700 dark:hover:text-white transition-colors"
              >
                <span className="text-base">{s.icon}</span>
                {s.title}
              </a>
            ))}
            <div className="border-t border-gray-200 dark:border-gray-800 my-3" />
            <Link
              href="/developers"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              {t('api_reference')}
            </Link>
          </nav>

          {/* Content */}
          <div className="space-y-12">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id}>
                <h2 className="text-2xl font-bold text-navy-700 dark:text-white font-display flex items-center gap-3 mb-6">
                  <span className="text-3xl">{section.icon}</span>
                  {section.title}
                </h2>
                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div
                      key={item.title}
                      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
                    >
                      <h3 className="font-semibold text-navy-700 dark:text-white mb-2">{item.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.content}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-navy-700 to-navy-800 dark:from-navy-800 dark:to-navy-900 p-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-3">{t('cta_title')}</h2>
              <p className="text-gray-300 mb-6">{t('cta_subtitle')}</p>
              <Link
                href="/auth?mode=register"
                className="inline-block px-8 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors"
              >
                {t('cta_button')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
