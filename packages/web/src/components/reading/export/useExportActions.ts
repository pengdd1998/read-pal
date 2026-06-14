'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { getAuthToken } from '@/lib/auth-fetch';
import { analytics } from '@/lib/analytics';
import { type ExportFormat, CITATION_FORMATS, SHAREABLE_FORMATS } from '../ExportPreviewModal.constants';
import { warn } from '@/lib/logger';

const DEFAULT_TYPES = new Set(['highlight', 'note', 'bookmark']);

interface ExportActionsReturn {
  format: ExportFormat;
  preview: string | null;
  loading: boolean;
  selectedTypes: Set<string>;
  selectedTag: string;
  showFilters: boolean;
  isCitationFormat: boolean;
  hasActiveFilters: boolean;
  canShare: boolean;
  setFormat: (f: ExportFormat) => void;
  setPreview: (p: string | null) => void;
  handleFormatChange: (f: ExportFormat) => void;
  handleToggleType: (type: string) => void;
  handleSetSelectedTag: (tag: string) => void;
  handleToggleShowFilters: () => void;
  handleClearFilters: () => void;
  handlePreview: () => Promise<void>;
  handleDownload: () => Promise<void>;
  handleCopy: () => void;
  abortRef: React.MutableRefObject<AbortController | null>;
}

export function useExportActions(bookId: string): ExportActionsReturn {
  const t = useTranslations('reader');
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat>('bookclub');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(DEFAULT_TYPES));
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const isCitationFormat = CITATION_FORMATS.includes(format);
  const hasActiveFilters = selectedTypes.size < 3 || selectedTag !== '';
  const canShare = SHAREABLE_FORMATS.includes(format);

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
    setSelectedTypes(new Set(DEFAULT_TYPES));
    setSelectedTag('');
  };

  // Any change to format or filters invalidates the in-flight preview fetch.
  // Without the abort, the old request resolves and writes its (now stale)
  // text via setPreview, overwriting the cleared value.
  const invalidatePreview = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPreview(null);
  }, []);

  const handleFormatChange = useCallback((f: ExportFormat) => { setFormat(f); invalidatePreview(); }, [invalidatePreview]);
  const handleToggleType = useCallback((type: string) => { toggleType(type); invalidatePreview(); }, [invalidatePreview]);
  const handleSetSelectedTag = useCallback((tag: string) => { setSelectedTag(tag); invalidatePreview(); }, [invalidatePreview]);
  const handleToggleShowFilters = useCallback(() => setShowFilters((v) => !v), []);
  const handleClearFilters = useCallback(() => { clearFilters(); invalidatePreview(); }, [invalidatePreview]);

  const handlePreview = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(buildExportUrl(), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        toast(t('export_failed_preview'), 'error');
        return;
      }
      const text = await res.text();
      if (!ctrl.signal.aborted) setPreview(text);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      warn('ExportPreviewModal: preview failed', err);
      toast(t('export_failed_preview'), 'error');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const handleDownload = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(buildExportUrl(), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
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
    } catch (error) {
      warn('useExportActions: download failed', error);
      toast(t('export_download_failed'), 'error');
    }
  };

  const handleCopy = () => {
    if (!preview) return;
    navigator.clipboard.writeText(preview).then(
      () => toast(t('export_copied_clipboard'), 'success'),
    ).catch(
      () => toast(t('export_copy_failed'), 'error'),
    );
  };

  return {
    format,
    preview,
    loading,
    selectedTypes,
    selectedTag,
    showFilters,
    isCitationFormat,
    hasActiveFilters,
    canShare,
    setFormat,
    setPreview,
    handleFormatChange,
    handleToggleType,
    handleSetSelectedTag,
    handleToggleShowFilters,
    handleClearFilters,
    handlePreview,
    handleDownload,
    handleCopy,
    abortRef,
  };
}
