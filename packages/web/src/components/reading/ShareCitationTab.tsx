'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { getAuthToken } from '@/lib/auth-fetch';
import { useToast } from '@/components/Toast';
import { API_BASE_URL } from '@/lib/api';

type CitationFormat = 'bibtex' | 'apa' | 'mla' | 'chicago' | 'annotated_bib';

const CITATION_FORMATS: { value: CitationFormat; labelKey: string }[] = [
  { value: 'bibtex', labelKey: 'share_citation_bibtex' },
  { value: 'apa', labelKey: 'share_citation_apa7' },
  { value: 'mla', labelKey: 'share_citation_mla9' },
  { value: 'chicago', labelKey: 'share_citation_chicago' },
  { value: 'annotated_bib', labelKey: 'share_citation_annotated' },
];

interface ShareCitationTabProps {
  bookId: string;
}

export function ShareCitationTab({ bookId }: ShareCitationTabProps) {
  const t = useTranslations('reader');
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [citationFormat, setCitationFormat] = useState<CitationFormat>('apa');
  const [citationText, setCitationText] = useState<string | null>(null);

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

  const handleCopyCitation = useCallback(() => {
    if (!citationText) return;
    navigator.clipboard.writeText(citationText).then(
      () => toast(t('share_citation_copied'), 'success'),
      () => toast(t('share_copy_failed'), 'error'),
    );
  }, [citationText, toast]);

  return (
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
  );
}
