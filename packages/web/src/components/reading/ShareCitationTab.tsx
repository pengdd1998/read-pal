'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { getAuthToken } from '@/lib/auth-fetch';
import { useToast } from '@/components/Toast';
import { API_BASE_URL } from '@/lib/api';
import { warn } from '@/lib/logger';

type CitationFormat = 'bibtex' | 'apa' | 'mla' | 'chicago' | 'annotated_bib';

const CITATION_FORMATS: { value: CitationFormat; labelKey: string }[] = [
 { value: 'bibtex', labelKey: 'share_citation_bibtex' },
 { value: 'apa', labelKey: 'share_citation_apa7' },
 { value: 'mla', labelKey: 'share_citation_mla9' },
 { value: 'chicago', labelKey: 'share_citation_chicago' },
 { value: 'annotated_bib', labelKey: 'share_citation_annotated' },
];

interface CitationFormatButtonProps {
 fmt: { value: CitationFormat; labelKey: string };
 isActive: boolean;
 label: string;
 onClick: () => void;
}

const CitationFormatButton = React.memo(function CitationFormatButton({ isActive, label, onClick }: CitationFormatButtonProps) {
 return (
  <button type="button"
   onClick={onClick}
   className={`text-left px-3 py-2.5 rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
   isActive
   ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30'
   : 'border-surface-3 hover:border-surface-3'
   }`}
  >
   <span className="text-sm font-medium text-gray-900">{label}</span>
  </button>
 );
});

interface ShareCitationTabProps {
 bookId: string;
}

export const ShareCitationTab = React.memo(function ShareCitationTab({ bookId }: ShareCitationTabProps) {
 const t = useTranslations('reader');
 const { toast } = useToast();
 const [generating, setGenerating] = useState(false);
 const [citationFormat, setCitationFormat] = useState<CitationFormat>('apa');
 const [citationText, setCitationText] = useState<string | null>(null);
 const abortRef = useRef<AbortController | null>(null);
 useEffect(() => () => { abortRef.current?.abort(); }, []);

 const handleFetchCitation = useCallback(async () => {
 abortRef.current?.abort();
 const ctrl = new AbortController();
 abortRef.current = ctrl;
 setGenerating(true);
 try {
  const baseUrl = API_BASE_URL || '';
  const res = await fetch(
  `${baseUrl}/api/v1/export/${bookId}/${citationFormat}`,
  { headers: { Authorization: `Bearer ${getAuthToken()}` }, signal: ctrl.signal },
  );
  if (ctrl.signal.aborted) return;
  if (!res.ok) {
  toast(t('share_citation_failed'), 'error');
  return;
  }
  const text = await res.text();
  if (!ctrl.signal.aborted) setCitationText(text);
 } catch (err) {
  if (ctrl.signal.aborted) return;
  warn('ShareCitationTab: citation failed', err);
  toast(t('share_citation_failed'), 'error');
 } finally {
  if (!ctrl.signal.aborted) setGenerating(false);
 }
 }, [bookId, citationFormat, toast]);

 const handleCopyCitation = useCallback(() => {
 if (!citationText) return;
 navigator.clipboard.writeText(citationText).then(
  () => toast(t('share_citation_copied'), 'success'),
 ).catch(
  () => toast(t('share_copy_failed'), 'error'),
 );
 }, [citationText, toast]);

 return (
 <div className="space-y-3">
  <p className="text-xs text-gray-500">
  {t('share_citation_desc')}
  </p>

  <div className="grid grid-cols-2 gap-2">
  {CITATION_FORMATS.map((fmt) => (
	   <CitationFormatButton
	   key={fmt.value}
	   fmt={fmt}
	   isActive={citationFormat === fmt.value}
	   label={t(fmt.labelKey)}
	   onClick={() => { setCitationFormat(fmt.value); setCitationText(null); }}
	   />
	  ))}
  </div>

  <button type="button"
  onClick={handleFetchCitation}
  disabled={generating}
  className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
  {generating ? t('share_citation_loading') : citationText ? t('share_citation_refresh') : t('share_citation_get')}
  </button>

  {citationText && (
  <div className="space-y-2">
   <pre className="bg-surface-1 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap break-words border border-surface-3">
   {citationText}
   </pre>
   <button type="button"
   onClick={handleCopyCitation}
   className="min-h-[44px] inline-flex items-center px-2 text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
   {t('share_copy_citation')}
   </button>
  </div>
  )}
 </div>
 );
});
