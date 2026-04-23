'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { getAuthToken } from '@/lib/auth-fetch';
import { useToast } from '@/components/Toast';
import { api, API_BASE_URL } from '@/lib/api';

type ShareTab = 'quote' | 'discussion' | 'citation';

interface ShareDialogProps {
  annotations: Annotation[];
  bookId: string;
  bookTitle?: string;
  author?: string;
  totalPages?: number;
  currentPage?: number;
  progress?: number;
  selectedAnnotation?: Annotation | null;
  onClose: () => void;
}

const TABS: { key: ShareTab; labelKey: string; icon: string }[] = [
  { key: 'quote', labelKey: 'share_tab_quote', icon: 'Q' },
  { key: 'discussion', labelKey: 'share_tab_discussion', icon: 'DG' },
  { key: 'citation', labelKey: 'share_tab_citation', icon: 'C' },
];

const CITATION_FORMATS = [
  { value: 'bibtex', labelKey: 'share_citation_bibtex' },
  { value: 'apa', labelKey: 'share_citation_apa7' },
  { value: 'mla', labelKey: 'share_citation_mla9' },
  { value: 'chicago', labelKey: 'share_citation_chicago' },
  { value: 'annotated_bib', labelKey: 'share_citation_annotated' },
] as const;

export function ShareDialog({
  annotations,
  bookId,
  bookTitle,
  author,
  totalPages,
  currentPage,
  progress,
  selectedAnnotation,
  onClose,
}: ShareDialogProps) {
  const t = useTranslations('reader');
  const [activeTab, setActiveTab] = useState<ShareTab>('discussion');
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [citationFormat, setCitationFormat] = useState<'bibtex' | 'apa' | 'mla' | 'chicago' | 'annotated_bib'>('apa');
  const [citationText, setCitationText] = useState<string | null>(null);
  const [guideHtml, setGuideHtml] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const { toast } = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);

  const highlights = annotations.filter((a) => a.type === 'highlight');
  const hasAnnotations = annotations.length > 0;

  // Generate discussion questions via API
  const generateQuestions = useCallback(async (): Promise<string[]> => {
    if (highlights.length === 0) return [];
    try {
      const res = await api.post<{ questions: string[] }>(
        '/api/agents/discussion-questions',
        {
          bookTitle: bookTitle || 'Unknown Book',
          author: author || 'Unknown Author',
          annotations: highlights.slice(0, 15).map((a) => ({ content: a.content })),
        },
      );
      if (res.success && res.data) {
        return res.data.questions;
      }
      return [];
    } catch {
      return [];
    }
  }, [highlights, bookTitle, author]);

  // Generate the full discussion guide (lazy-load the export module)
  const handleGenerateGuide = useCallback(async () => {
    setGenerating(true);
    try {
      const generatedQuestions = await generateQuestions();
      setQuestions(generatedQuestions);

      // Dynamic import — export-discussion-guide is ~10KB, only needed when generating
      const { generateDiscussionGuideHtml } = await import('@/lib/export-discussion-guide');

      const html = generateDiscussionGuideHtml({
        book: {
          title: bookTitle || 'Unknown Book',
          author: author || 'Unknown Author',
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
    } catch {
      toast(t('share_failed_generate'), 'error');
    } finally {
      setGenerating(false);
    }
  }, [annotations, bookTitle, author, totalPages, currentPage, progress, highlights, generateQuestions, toast]);

  // Fetch citation from export API
  const handleFetchCitation = useCallback(async () => {
    setGenerating(true);
    try {
      const baseUrl = API_BASE_URL || '';
      const res = await fetch(
        `${baseUrl}/api/v1/export/${bookId}/${citationFormat}`,
        { headers: { Authorization: `Bearer ${getAuthToken()}` } },
      );
      if (!res.ok) {
        toast(t('share_citation_failed'), 'error');
        return;
      }
      const text = await res.text();
      setCitationText(text);
    } catch {
      toast(t('share_citation_failed'), 'error');
    } finally {
      setGenerating(false);
    }
  }, [bookId, citationFormat, toast]);

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

  const handleCopyCitation = useCallback(() => {
    if (!citationText) return;
    navigator.clipboard.writeText(citationText).then(
      () => toast(t('share_citation_copied'), 'success'),
      () => toast(t('share_copy_failed'), 'error'),
    );
  }, [citationText, toast]);

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
    } catch {
      toast(t('share_failed_share_link'), 'error');
    } finally {
      setSharing(false);
    }
  }, [bookId, guideHtml, toast]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('share_title')}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('share_title')}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('share_close_dialog')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t(tab.labelKey)}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Book info */}
          {bookTitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {bookTitle}{author ? ` ${t('share_by_author', { author })}` : ''}
            </p>
          )}

          {/* Discussion Guide Tab */}
          {activeTab === 'discussion' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('share_discussion_desc')}
              </p>

              {!guideHtml ? (
                <button
                  onClick={handleGenerateGuide}
                  disabled={generating || !hasAnnotations}
                  className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                  <div className="rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 max-h-48 overflow-y-auto">
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
                          <li key={i}>{q}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={handleCopyGuide}
                      className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{t('export_copy')}</span>
                    </button>
                    <button
                      onClick={handleDownloadGuide}
                      className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{t('share_html')}</span>
                    </button>
                    <button
                      onClick={handlePrintGuide}
                      className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{t('share_print')}</span>
                    </button>
                    <button
                      onClick={handleShareGuideLink}
                      disabled={sharing}
                      className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span className="text-xs text-amber-600 dark:text-amber-400">{t('share_link')}</span>
                    </button>
                  </div>

                  <button
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
                        className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareLink); toast(t('share_link_copied'), 'success'); }}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
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
          )}

          {/* Quote Card Tab */}
          {activeTab === 'quote' && (
            <div className="space-y-3">
              {selectedAnnotation && (selectedAnnotation.type === 'highlight' || selectedAnnotation.type === 'note') ? (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('share_quote_desc')}
                  </p>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-900/30">
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic line-clamp-4">
                      {selectedAnnotation.content}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {t('share_quote_hint')}
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-4xl opacity-30 mb-3">Q</p>
                  <p className="text-sm text-amber-700/50 dark:text-amber-400/40">
                    {t('share_quote_empty')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Citation Tab */}
          {activeTab === 'citation' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('share_citation_desc')}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {CITATION_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    onClick={() => { setCitationFormat(fmt.value); setCitationText(null); }}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      citationFormat === fmt.value
                        ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{t(fmt.labelKey)}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={handleFetchCitation}
                disabled={generating}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {generating ? t('share_citation_loading') : citationText ? t('share_citation_refresh') : t('share_citation_get')}
              </button>

              {citationText && (
                <div className="space-y-2">
                  <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words border border-gray-200 dark:border-gray-700">
                    {citationText}
                  </pre>
                  <button
                    onClick={handleCopyCitation}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {t('share_copy_citation')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
