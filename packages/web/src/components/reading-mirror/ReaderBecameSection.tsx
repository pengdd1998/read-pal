'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface ReaderBecameSectionProps {
  data: Record<string, unknown>;
}

export default React.memo(function ReaderBecameSection({ data }: ReaderBecameSectionProps) {
  const t = useTranslations('readingMirror');
  const essay = data.essay as string | undefined;
  const transformation = data.key_transformation as string | undefined;
  const question = data.parting_question as string | undefined;

  if (!essay && !transformation) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">🪞</span>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{t('no_reflection')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {/* Reflective essay */}
      {essay && (
        <div className="font-serif text-lg leading-[1.85] text-gray-800 dark:text-gray-200 max-w-[65ch]">
          <p className="m-0">{essay}</p>
        </div>
      )}

      {/* Key transformation */}
      {transformation && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0 mt-0.5">✨</span>
            <div>
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                {t('key_transformation')}
              </h4>
              <p className="text-gray-800 dark:text-gray-200 m-0 font-serif text-base leading-relaxed italic">
                {transformation}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Parting question */}
      {question && (
        <div className="bg-surface-0 border border-surface-3 rounded-xl p-5 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-2">
            {t('parting_question')}
          </p>
          <p className="font-serif text-xl text-gray-900 dark:text-gray-100 m-0 leading-relaxed">
            &ldquo;{question}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
});
