'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const FEATURE_PREVIEW = [
  { icon: '\uD83D\uDCD6', titleKey: 'feature_read', descKey: 'feature_read_desc', href: '/library' },
  { icon: '\uD83D\uDCDA', titleKey: 'feature_memory_books', descKey: 'feature_memory_books_desc', href: '/memory-books' },
  { icon: '\uD83D\uDCCA', titleKey: 'feature_stats', descKey: 'feature_stats_desc', href: '/stats' },
] as const;

interface WelcomeSectionProps {
  onSeedSample: () => void;
  seeding: boolean;
}

export function WelcomeSection({ onSeedSample, seeding }: WelcomeSectionProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="animate-fade-in">
      <div className="card text-center py-12 sm:py-16 mb-6">
        <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center">
          <span className="text-4xl">{'\uD83D\uDCDA'}</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {t('ready_first_book')}
        </h2>
        <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          {t('first_book_desc')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/library"
            className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200"
          >
            {t('upload_book')}
          </Link>
          <button
            onClick={onSeedSample}
            disabled={seeding}
            className="btn hover:scale-105 active:scale-95 transition-transform duration-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {seeding ? t('adding_sample') : t('try_sample')}
          </button>
        </div>
      </div>

      {/* Quick feature preview for new users */}
      <div className="grid grid-cols-3 gap-3 mt-6">
        {FEATURE_PREVIEW.map((f, fi) => (
          <Link
            key={f.titleKey}
            href={f.href}
            className={`stagger-${fi + 1} animate-slide-up card text-center group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 py-5`}
          >
            <span className="text-2xl block mb-2">{f.icon}</span>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t(f.titleKey)}</h3>
            <p className="text-xs text-gray-400 mt-1">{t(f.descKey)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
