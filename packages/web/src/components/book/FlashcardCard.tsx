'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface FlashcardCardProps {
 bookId: string;
 totalAnnotations: number;
 flashcardCount: number;
 t: (key: string) => string;
 onError: (msg: string) => void;
}

export const FlashcardCard = React.memo(function FlashcardCard({
 bookId,
 totalAnnotations,
 t,
 onError,
}: FlashcardCardProps) {
 const [generating, setGenerating] = useState(false);
 const mountedRef = useRef(true);
 const router = useRouter();
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 if (totalAnnotations === 0) return null;

 const handleGenerate = async () => {
 try {
  setGenerating(true);
  const res = await api.post<{ generated: number }>(
  '/api/flashcards/generate',
  {
   bookId,
   count: 5,
  },
  { timeout: 120_000 },
  );
  if (res.success && res.data) {
  router.push('/flashcards');
  }
 } catch (error) {
  warn('FlashcardCard: generate failed', error);
  onError(t('failedToGenerateFlashcards'));
 } finally {
  if (mountedRef.current) setGenerating(false);
 }
 };

 return (
 <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/10 dark:to-emerald-900/10 rounded-2xl border border-teal-200/50 dark:border-teal-800/30 p-5 mb-6 animate-slide-up stagger-4">
  <div className="flex items-center gap-3 mb-3">
  <span className="text-2xl">{'📇'}</span>
  <div>
   <h2 className="font-semibold text-gray-900 dark:text-gray-100">
   {t('flashcardReview')}
   </h2>
   <p className="text-xs text-gray-500 dark:text-gray-400">{t('flashcardReviewDesc')}</p>
  </div>
  </div>
  <div className="flex items-center gap-3">
  <button type="button"
   onClick={handleGenerate}
   disabled={generating}
   className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
   {generating ? (
   <>
    <svg aria-hidden="true"
    className="w-4 h-4 animate-spin"
    fill="none"
    viewBox="0 0 24 24"
    >
    <circle
     className="opacity-25"
     cx="12"
     cy="12"
     r="10"
     stroke="currentColor"
     strokeWidth="4"
    />
    <path
     className="opacity-75"
     fill="currentColor"
     d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
    </svg>
    {t('generating')}
   </>
   ) : (
   <>
    <svg aria-hidden="true"
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    >
    <path
     strokeLinecap="round"
     strokeLinejoin="round"
     d="M13 10V3L4 14h7v7l9-11h-7z"
    />
    </svg>
    {t('generateFlashcards')}
   </>
   )}
  </button>
  <Link
   href="/flashcards"
   className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
  >
   {t('reviewDueCards')}
   <svg aria-hidden="true"
   className="w-3 h-3"
   fill="none"
   viewBox="0 0 24 24"
   stroke="currentColor"
   strokeWidth={2}
   >
   <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M9 5l7 7-7 7"
   />
   </svg>
  </Link>
  </div>
 </div>
 );
});
