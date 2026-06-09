'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';

interface DiscussionTabProps {
 annotations: Annotation[];
 bookId: string;
 bookTitle?: string;
 author?: string;
 totalPages?: number;
 currentPage?: number;
 progress?: number;
}

export const ShareDiscussionTab = React.memo(function ShareDiscussionTab({
 annotations,
 bookId,
 bookTitle,
 author,
 totalPages,
 currentPage,
 progress,
}: DiscussionTabProps) {
 const t = useTranslations('reader');
 const { toast } = useToast();
 const [generating, setGenerating] = useState(false);
 const [questions, setQuestions] = useState<string[]>([]);
 const [guideHtml, setGuideHtml] = useState<string | null>(null);
 const [shareLink, setShareLink] = useState<string | null>(null);
 const [sharing, setSharing] = useState(false);
 const [questionWarning, setQuestionWarning] = useState(false);

 const highlights = useMemo(() => annotations.filter((a) => a.type === 'highlight'), [annotations]);
 const hasAnnotations = annotations.length > 0;

 const generateQuestions = useCallback(async (): Promise<string[]> => {
 if (highlights.length === 0) return [];
 try {
  const res = await api.post<{ questions: string[] }>(
  '/api/agents/discussion-questions',
  {
   bookTitle: bookTitle || t('share_unknown_book'),
   author: author || t('share_unknown_author'),
   annotations: highlights.slice(0, 15).map((a) => ({ content: a.content })),
  },
  );
  if (res.success && res.data) {
  return res.data.questions;
  }
  return [];
 } catch (err) {
  console.warn('ShareDiscussionTab: failed to generate discussion questions', err);
  setQuestionWarning(true);
  return [];
 }
 }, [highlights, bookTitle, author]);

 const handleGenerateGuide = useCallback(async () => {
 setGenerating(true);
 try {
  const generatedQuestions = await generateQuestions();
  setQuestions(generatedQuestions);

  const { generateDiscussionGuideHtml } = await import('@/lib/export-discussion-guide');

  const html = generateDiscussionGuideHtml({
  book: {
   title: bookTitle || t('share_unknown_book'),
   author: author || t('share_unknown_author'),
   totalPages,
   currentPage,
   progress,
  },
  annotations,
  stats: {
   totalAnnotations: annotations.length,
   highlights: highlights.length,
   notes: annotations.filter((a) => a.type === 'note').length,
   bookmarks: annotations.filter((a) => a.type === 'bookmark').length,
   totalPages,
   currentPage,
   progress,
  },
  discussionQuestions: generatedQuestions,
  });

  setGuideHtml(html);
  toast(t('share_guide_generated'), 'success');
 } catch (err) {
  console.warn('ShareDiscussionTab: generate failed', err);
  toast(t('share_failed_generate'), 'error');
 } finally {
  setGenerating(false);
 }
 }, [annotations, bookTitle, author, totalPages, currentPage, progress, highlights, generateQuestions, toast]);

 const handleCopyGuide = useCallback(async () => {
 if (!guideHtml) return;
 const { copyDiscussionGuide } = await import('@/lib/export-discussion-guide');
 const ok = await copyDiscussionGuide(guideHtml);
 if (ok) {
  toast(t('share_guide_copied'), 'success');
 } else {
  toast(t('share_copy_failed'), 'error');
 }
 }, [guideHtml, toast]);

 const handleDownloadGuide = useCallback(async () => {
 if (!guideHtml) return;
 const { downloadDiscussionGuide } = await import('@/lib/export-discussion-guide');
 downloadDiscussionGuide(guideHtml, bookTitle || 'book');
 toast(t('share_guide_downloaded'), 'success');
 }, [guideHtml, bookTitle, toast]);

 const handlePrintGuide = useCallback(async () => {
 if (!guideHtml) return;
 const { printDiscussionGuide } = await import('@/lib/export-discussion-guide');
 printDiscussionGuide(guideHtml);
 }, [guideHtml]);

 const handleShareGuideLink = useCallback(async () => {
 if (!guideHtml) return;
 setSharing(true);
 try {
  const res = await api.post<{ token: string }>(
  '/api/share/export',
  { bookId, format: 'bookclub' },
  );
  if (res.success && res.data) {
  const baseUrl = window.location.origin;
  const fullUrl = `${baseUrl}/api/share/s/${res.data.token}`;
  setShareLink(fullUrl);
  await navigator.clipboard.writeText(fullUrl);
  toast(t('share_link_copied'), 'success');
  }
 } catch (err) {
  console.warn('ShareDiscussionTab: share link failed', err);
  toast(t('share_failed_share_link'), 'error');
 } finally {
  setSharing(false);
 }
 }, [bookId, guideHtml, toast]);

 return (
 <div className="space-y-4">
  <p className="text-xs text-gray-500 dark:text-gray-400">
  {t('share_discussion_desc')}
  </p>

  {!guideHtml ? (
  <button
   aria-label={t('share_generate_guide')}
   onClick={handleGenerateGuide}
   disabled={generating || !hasAnnotations}
   className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
   {generating ? (
   <span className="flex items-center justify-center gap-2">
    <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    {t('share_generating_guide')}
   </span>
   ) : (
   t('share_generate_guide')
   )}
  </button>
  ) : (
  <>
   {/* Preview */}
   <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
   <div className="bg-gray-50 dark:bg-gray-800 p-3 max-h-48 overflow-y-auto">
    <iframe
    srcDoc={guideHtml}
    title={t('share_tab_discussion')}
    className="w-full h-40 border-0 pointer-events-none"
    sandbox="allow-same-origin"
    />
   </div>
   </div>

   {/* Questions preview */}
   {questions.length > 0 && (
   <div>
    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
    {t('share_ai_discussion_questions')}
    </p>
    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
    {questions.map((q, i) => (
     <li key={q}>{q}</li>
    ))}
    </ol>
   </div>
   )}
   {questionWarning && questions.length === 0 && (
   <p className="text-xs text-amber-600 dark:text-amber-400">{t('share_questions_unavailable')}</p>
   )}

   {/* Action buttons */}
   <div className="grid grid-cols-4 gap-2">
   <button
    aria-label={t('export_copy')}
    onClick={handleCopyGuide}
    className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
   >
    <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
    <span className="text-xs text-gray-600 dark:text-gray-400">{t('export_copy')}</span>
   </button>
   <button
    aria-label={t('share_html')}
    onClick={handleDownloadGuide}
    className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
   >
    <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
    <span className="text-xs text-gray-600 dark:text-gray-400">{t('share_html')}</span>
   </button>
   <button
    aria-label={t('share_print')}
    onClick={handlePrintGuide}
    className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
   >
    <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
    <span className="text-xs text-gray-600 dark:text-gray-400">{t('share_print')}</span>
   </button>
   <button
    aria-label={t('share_link')}
    onClick={handleShareGuideLink}
    disabled={sharing}
    className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
   >
    <svg aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
    <span className="text-xs text-amber-600 dark:text-amber-400">{t('share_link')}</span>
   </button>
   </div>

   <button
   aria-label={t('share_regenerate')}
   onClick={() => { setGuideHtml(null); setQuestions([]); setShareLink(null); }}
   className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
   >
   {t('share_regenerate')}
   </button>

   {shareLink && (
   <div className="flex items-center gap-2">
    <input
    type="text"
    readOnly
    value={shareLink}
    aria-label={t('share_link')}
    className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-surface-3 rounded-lg text-gray-700 dark:text-gray-300"
    onClick={(e) => (e.target as HTMLInputElement).select()}
    />
    <button
    onClick={() => { navigator.clipboard.writeText(shareLink); toast(t('share_link_copied'), 'success'); }}
    className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
    >
    {t('export_copy')}
    </button>
   </div>
   )}
  </>
  )}

  {!hasAnnotations && (
  <p className="text-xs text-amber-600 dark:text-amber-400">
   {t('share_no_annotations')}
  </p>
  )}
 </div>
 );
});
