'use client';

import { useState, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { getAuthToken } from '@/lib/auth-fetch';
import { api } from '@/lib/api';

type ExportFormat = 'markdown' | 'json' | 'bookclub' | 'bibtex' | 'apa' | 'mla' | 'chicago' | 'research';

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: string;
  category: 'basic' | 'discussion' | 'citation' | 'research';
}

const FORMATS: FormatOption[] = [
  { value: 'markdown', label: 'Markdown', description: 'Standard formatted text', icon: 'M', category: 'basic' },
  { value: 'json', label: 'JSON', description: 'Raw structured data', icon: '{ }', category: 'basic' },
  { value: 'bookclub', label: 'Book Club Guide', description: 'Reading stats + chapter highlights + AI questions', icon: '📖', category: 'discussion' },
  { value: 'research', label: 'Research Notes', description: 'Organized by tags with reading context', icon: '🔬', category: 'research' },
  { value: 'bibtex', label: 'BibTeX', description: 'LaTeX bibliography entry', icon: 'B', category: 'citation' },
  { value: 'apa', label: 'APA', description: 'APA 7th edition citation', icon: 'A', category: 'citation' },
  { value: 'mla', label: 'MLA', description: 'MLA 9th edition citation', icon: 'M', category: 'citation' },
  { value: 'chicago', label: 'Chicago', description: 'Chicago style citation', icon: 'C', category: 'citation' },
];

const CATEGORIES = [
  { key: 'basic' as const, label: 'Basic' },
  { key: 'discussion' as const, label: 'Discussion' },
  { key: 'research' as const, label: 'Research' },
  { key: 'citation' as const, label: 'Citation' },
];

const TYPE_OPTIONS = [
  { value: 'highlight', label: 'Highlights', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  { value: 'note', label: 'Notes', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  { value: 'bookmark', label: 'Bookmarks', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
];

interface ExportPreviewModalProps {
  bookId: string;
  bookTitle?: string;
  availableTags?: string[];
  onClose: () => void;
}

export function ExportPreviewModal({ bookId, bookTitle, availableTags = [], onClose }: ExportPreviewModalProps) {
  const [format, setFormat] = useState<ExportFormat>('bookclub');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['highlight', 'note', 'bookmark']));
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const { toast } = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);

  const isCitationFormat = ['bibtex', 'apa', 'mla', 'chicago'].includes(format);
  const hasActiveFilters = selectedTypes.size < 3 || selectedTag !== '';

  const buildExportUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const params = new URLSearchParams({ bookId, format });
    if (selectedTypes.size < 3) {
      params.set('types', [...selectedTypes].join(','));
    }
    if (selectedTag) {
      params.set('tags', selectedTag);
    }
    return `${baseUrl}/api/annotations/export?${params}`;
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
        toast('Failed to load preview', 'error');
        return;
      }
      const text = await res.text();
      setPreview(text);
    } catch {
      toast('Failed to load preview', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(buildExportUrl(), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) { toast('Download failed', 'error'); return; }
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
      toast(`Downloaded ${filename}`, 'success');
    } catch {
      toast('Download failed', 'error');
    }
  };

  const handleCopy = () => {
    if (!preview) return;
    navigator.clipboard.writeText(preview).then(
      () => toast('Copied to clipboard', 'success'),
      () => toast('Copy failed', 'error'),
    );
  };

  // Shareable link state
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const canShare = ['markdown', 'json', 'bookclub', 'research'].includes(format);

  const handleShareLink = async () => {
    setSharing(true);
    try {
      const body: Record<string, string> = { bookId, format };
      if (selectedTypes.size < 3) body.types = [...selectedTypes].join(',');
      if (selectedTag) body.tags = selectedTag;

      const res = await api.post<{ token: string; url: string; format: string; title: string }>(
        '/api/share/export',
        body,
      );

      if (res.success && res.data) {
        const baseUrl = window.location.origin;
        const fullUrl = `${baseUrl}/api/share/s/${res.data.token}`;
        setShareLink(fullUrl);
        await navigator.clipboard.writeText(fullUrl);
        toast('Link copied to clipboard', 'success');
      } else {
        toast('Failed to create share link', 'error');
      }
    } catch {
      toast('Failed to create share link', 'error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Export Annotations" className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Export Annotations
            </h3>
            {bookTitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">
                {bookTitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
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
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                  {cat.label}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => { setFormat(f.value); setPreview(null); }}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                        format === f.value
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.label}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Filter toggle (hidden for citation formats) */}
          {!isCitationFormat && (
            <div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                  hasActiveFilters
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <svg className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Filters {hasActiveFilters ? '(active)' : ''}
              </button>

              {showFilters && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                  {/* Type filters */}
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Include types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => toggleType(opt.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            selectedTypes.has(opt.value)
                              ? opt.color + ' ring-1 ring-current/20'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tag filter */}
                  {availableTags.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Filter by tag</p>
                      <select
                        value={selectedTag}
                        onChange={(e) => { setSelectedTag(e.target.value); setPreview(null); }}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                      >
                        <option value="">All tags</option>
                        {availableTags.map((tag) => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {hasActiveFilters && (
                    <button
                      onClick={() => { clearFilters(); setPreview(null); }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview area */}
          {preview && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Preview</span>
                <button
                  onClick={handleCopy}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Copy
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
            {loading ? 'Loading…' : preview ? 'Refresh' : 'Preview'}
          </button>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            Download
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
                {sharing ? 'Creating link...' : 'Share via Link'}
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
                  onClick={() => { navigator.clipboard.writeText(shareLink); toast('Link copied', 'success'); }}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
