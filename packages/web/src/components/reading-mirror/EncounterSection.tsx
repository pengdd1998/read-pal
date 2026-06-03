'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface EncounterSectionProps {
  data: Record<string, unknown>;
  bookTitle: string;
  bookAuthor: string;
  coverUrl?: string;
}

export default function EncounterSection({ data, bookTitle, bookAuthor, coverUrl }: EncounterSectionProps) {
  const t = useTranslations('readingMirror');
  const prologue = data.prologue as Record<string, string> | undefined;
  const stats = data.stats as Record<string, unknown> | undefined;

  const text = prologue?.text || '';
  const archetype = prologue?.reading_archetype || '';
  const archetypeDesc = prologue?.archetype_description || '';

  // Extract first letter for drop cap
  const dropCap = useMemo(() => {
    if (!text) return { first: '', rest: '' };
    const match = text.match(/^(.)(.*)$/s);
    return match ? { first: match[1], rest: match[2] } : { first: '', rest: text };
  }, [text]);

  return (
    <div className="py-8">
      {/* Book cover + title */}
      <div className="flex items-center gap-6 mb-8">
        {coverUrl && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt={bookTitle}
              className="w-[100px] h-[140px] object-cover rounded-lg shadow-[0_4px_12px_-2px_rgba(30,42,56,0.1),0_8px_24px_-4px_rgba(30,42,56,0.06)] dark:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3),0_8px_24px_-4px_rgba(0,0,0,0.2)]"
              loading="lazy"
            />
          </div>
        )}
        <div>
          <h1 className="font-serif text-4xl font-semibold text-gray-900 dark:text-white m-0 leading-tight">
            {bookTitle}
          </h1>
          <p className="text-lg text-amber-900/70 dark:text-amber-200/70 mt-1 mb-0">
            {t('by_author', { author: bookAuthor })}
          </p>
        </div>
      </div>

      {/* Prologue text with drop cap */}
      {text && (
        <div className="font-serif text-lg leading-[1.85] text-gray-800 dark:text-gray-200 max-w-[65ch] my-6">
          <p className="m-0">
            <span
              className="float-left font-serif text-[3.5rem] leading-[0.8] pt-[0.1em] pr-[0.1em] text-amber-600 dark:text-amber-400 font-semibold"
            >
              {dropCap.first}
            </span>
            {dropCap.rest}
          </p>
        </div>
      )}

      {/* Archetype badge */}
      {archetype && (
        <div className="my-4 mb-6">
          <span className="inline-block py-1 px-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 rounded-2xl text-sm text-amber-800 dark:text-amber-200 font-medium">
            {archetype}
          </span>
          {archetypeDesc && (
            <p className="text-amber-900/70 dark:text-amber-200/60 text-sm mt-1.5 italic">
              {archetypeDesc}
            </p>
          )}
        </div>
      )}

      {/* Reading stats strip */}
      {stats && (
        <div className="flex flex-wrap gap-3 pt-4 border-t border-amber-100 dark:border-gray-700">
          <div className="bg-white dark:bg-gray-800 border border-amber-100 dark:border-gray-700 rounded-lg px-3 py-2 text-center min-w-[100px]">
            <span className="block text-lg font-semibold text-gray-900 dark:text-white">
              {String(stats.total_reading_time || '0m')}
            </span>
            <span className="block text-[0.7rem] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('reading_time')}
            </span>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-amber-100 dark:border-gray-700 rounded-lg px-3 py-2 text-center min-w-[100px]">
            <span className="block text-lg font-semibold text-gray-900 dark:text-white">
              {String(stats.session_count || 0)}
            </span>
            <span className="block text-[0.7rem] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('sessions')}
            </span>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-amber-100 dark:border-gray-700 rounded-lg px-3 py-2 text-center min-w-[100px]">
            <span className="block text-lg font-semibold text-gray-900 dark:text-white">
              {String(stats.highlight_count || 0)}
            </span>
            <span className="block text-[0.7rem] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('highlights')}
            </span>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-amber-100 dark:border-gray-700 rounded-lg px-3 py-2 text-center min-w-[100px]">
            <span className="block text-lg font-semibold text-gray-900 dark:text-white">
              {String(stats.longest_session || '0m')}
            </span>
            <span className="block text-[0.7rem] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('longest_session')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
