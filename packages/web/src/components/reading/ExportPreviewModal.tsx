'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { getAuthToken } from '@/lib/auth-fetch';
import { analytics } from '@/lib/analytics';
import {
  type ExportFormat,
  FORMATS,
  CATEGORIES,
  CITATION_FORMATS,
  SHAREABLE_FORMATS,
} from './ExportPreviewModal.constants';
import { ExportFilterPanel } from './ExportFilterPanel';
import { useExportShareLink } from './useExportShareLink';

interface ExportPreviewModalProps {
  bookId: string;
  bookTitle?: string;
  availableTags?: string[];
  onClose: () => void;
}

export function ExportPreviewModal({ bookId, bookTitle, availableTags = [], onClose }: ExportPreviewModalProps) {
  const t = useTranslations('reader');
  const [format, setFormat] = useState<ExportFormat>('bookclub');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['highlight', 'note', 'bookmark']));
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const { toast } = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);

  const isCitationFormat = CITATION_FORMATS.includes(format);
  const hasActiveFilters = selectedTypes.size < 3 || selectedTag !== '';
  const canShare = SHAREABLE_FORMATS.includes(format);

  const { shareLink, sharing, handleShareLink } = useExportShareLink({
    bookId,
    format,
    selectedTypes,
    selectedTag,
  });

  const buildExportUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    let url = `${baseUrl}/api/v1/export/${bookId}/${format}`;
    const extraParams = new URLSearchParams();
    if (selectedTypes.size < 3) {
      extraParams.set('types', [...selectedTypes].join(','));
    }
    if (selectedTag) {
      extraParams.set('tags', selectedTag);
    }
    if (extraParams.toString()) url += `?${extraParams}`;
    return url;
  };

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedTypes(new Set(['highlight', 'note', 'bookmark']));
    setSelectedTag('');
  };

  const handlePreview = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildExportUrl(), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        toast(t('export_failed_preview'), 'error');
        return;
      }
      const text = await res.text();
      setPreview(text);
    } catch {
      toast(t('export_failed_preview'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(buildExportUrl(), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) { toast(t('export_download_failed'), 'error'); return; }
      const blob = await res.blob();

      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `export-${bookId}.${format === 'json' ? 'json' : 'txt'}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('export_downloaded_file', { filename }), 'success');
      analytics.track('export_completed', { format });
    } catch {
      toast(t('export_download_failed'), 'error');
    }
  };

  const handleCopy = () => {
    if (!preview) return;
    navigator.clipboard.writeText(preview).then(
      () => toast(t('export_copied_clipboard'), 'success'),
      () => toast(t('export_copy_failed'), 'error'),
    );
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={t('export_title')} className="bg-surface-0 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('export_title')}
            </h3>
            {bookTitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">
                {bookTitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t('export_close_dialog')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format + Filter selection */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {/* Format categories */}
          {CATEGORIES.map((cat) => {
            const items = FORMATS.filter((f) => f.category === cat.key);
            return (
              <div key={cat.key}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  {t(cat.labelKey)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => { setFormat(f.value); setPreview(null); }}
                      aria-label={`${t(f.label)} - ${t(f.description)}`}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                        format === f.value
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{t(f.label)}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t(f.description)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Filter toggle (hidden for citation formats) */}
          {!isCitationFormat && (
            <ExportFilterPanel
              selectedTypes={selectedTypes}
              selectedTag={selectedTag}
              availableTags={availableTags}
              showFilters={showFilters}
              hasActiveFilters={hasActiveFilters}
              onToggleType={(type) => { toggleType(type); setPreview(null); }}
              onSetSelectedTag={(tag) => { setSelectedTag(tag); setPreview(null); }}
              onToggleShowFilters={() => setShowFilters(!showFilters)}
              onClearFilters={() => { clearFilters(); setPreview(null); }}
            />
          )}

          {/* Preview area */}
          {preview && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('export_preview_label')}</span>
                <button
                  onClick={handleCopy}
                  aria-label={t('export_copy')}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                >
                  {t('export_copy')}
                </button>
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40 whitespace-pre-wrap break-words border border-gray-200 dark:border-gray-700">
                {preview.slice(0, 2000)}{preview.length > 2000 ? '\n…' : ''}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button
            onClick={handlePreview}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? t('export_loading') : preview ? t('export_refresh') : t('export_preview_button')}
          </button>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {t('export_download')}
          </button>
        </div>

        {/* Share link section */}
        {canShare && (
          <div className="px-5 pb-4">
            {!shareLink ? (
              <button
                onClick={handleShareLink}
                disabled={sharing}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {sharing ? t('export_creating_link') : t('export_share_via_link')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(shareLink); toast(t('export_link_copied'), 'success'); }}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  {t('export_copy')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
