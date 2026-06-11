'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import {
  GenerateButton,
  GuidePreview,
  ActionGrid,
  ShareLinkBar,
} from './ShareDiscussionSubComponents';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
      warn('ShareDiscussionTab: failed to generate discussion questions', err);
      setQuestionWarning(true);
      return [];
    }
  }, [highlights, bookTitle, author, t]);

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
      warn('ShareDiscussionTab: generate failed', err);
      toast(t('share_failed_generate'), 'error');
    } finally {
      setGenerating(false);
    }
  }, [annotations, bookTitle, author, totalPages, currentPage, progress, highlights, generateQuestions, toast, t]);

  const handleCopyGuide = useCallback(async () => {
    if (!guideHtml) return;
    const { copyDiscussionGuide } = await import('@/lib/export-discussion-guide');
    const ok = await copyDiscussionGuide(guideHtml);
    if (ok) {
      toast(t('share_guide_copied'), 'success');
    } else {
      toast(t('share_copy_failed'), 'error');
    }
  }, [guideHtml, toast, t]);

  const handleDownloadGuide = useCallback(async () => {
    if (!guideHtml) return;
    const { downloadDiscussionGuide } = await import('@/lib/export-discussion-guide');
    downloadDiscussionGuide(guideHtml, bookTitle || 'book');
    toast(t('share_guide_downloaded'), 'success');
  }, [guideHtml, bookTitle, toast, t]);

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
      warn('ShareDiscussionTab: share link failed', err);
      toast(t('share_failed_share_link'), 'error');
    } finally {
      setSharing(false);
    }
  }, [bookId, guideHtml, toast, t]);

  const handleReset = useCallback(() => {
    setGuideHtml(null);
    setQuestions([]);
    setShareLink(null);
  }, []);

  const handleCopyShareLink = useCallback(() => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      toast(t('share_link_copied'), 'success');
    }
  }, [shareLink, toast, t]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {t('share_discussion_desc')}
      </p>

      {!guideHtml ? (
        <GenerateButton
          generating={generating}
          disabled={!hasAnnotations}
          onClick={handleGenerateGuide}
          label={t('share_generate_guide')}
          generatingLabel={t('share_generating_guide')}
        />
      ) : (
        <>
          <GuidePreview
            guideHtml={guideHtml}
            previewTitle={t('share_tab_discussion')}
            questions={questions}
            questionTitle={t('share_ai_discussion_questions')}
            questionWarning={questionWarning}
            questionsUnavailableText={t('share_questions_unavailable')}
          />

          <ActionGrid
            onCopy={handleCopyGuide}
            onDownload={handleDownloadGuide}
            onPrint={handlePrintGuide}
            onShareLink={handleShareGuideLink}
            sharing={sharing}
            copyLabel={t('export_copy')}
            htmlLabel={t('share_html')}
            printLabel={t('share_print')}
            linkLabel={t('share_link')}
          />

          <button
            type="button"
            aria-label={t('share_regenerate')}
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-600 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
          >
            {t('share_regenerate')}
          </button>

          {shareLink && (
            <ShareLinkBar
              shareLink={shareLink}
              linkLabel={t('share_link')}
              copyLabel={t('export_copy')}
              onCopy={handleCopyShareLink}
            />
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
