'use client';

import { useState, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { getAuthToken } from '@/lib/auth-fetch';

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
  { value: 'bookclub', label: 'Book Club Guide', description: 'Highlights + AI discussion questions', icon: '📖', category: 'discussion' },
  { value: 'research', label: 'Research Notes', description: 'Organized by tags and themes', icon: '🔬', category: 'research' },
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

interface ExportPreviewModalProps {
  bookId: string;
  bookTitle?: string;
  onClose: () => void;
}

export function ExportPreviewModal({ bookId, bookTitle, onClose }: ExportPreviewModalProps) {
  const [format, setFormat] = useState<ExportFormat>('bookclub');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${baseUrl}/api/annotations/export?bookId=${bookId}&format=${format}`, {
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
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${baseUrl}/api/annotations/export?bookId=${bookId}&format=${format}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) { toast('Download failed', 'error'); return; }
      const blob = await res.blob();

      // Get filename from Content-Disposition or generate
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

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Export Annotations
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format selection */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {bookTitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {bookTitle}
            </p>
          )}

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
      </div>
    </div>
  );
}
