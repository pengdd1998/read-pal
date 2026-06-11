'use client';

import React, { useState, useRef, useEffect } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import type { BookData } from '@/types/book';
import { warn } from '@/lib/logger';

interface ExportActionsProps {
 bookId: string;
 book: BookData;
 totalAnnotations: number;
 zoteroConnected: boolean;
 t: (key: string) => string;
 onExportSuccess: (msg: string) => void;
 onExportError: (msg: string) => void;
}

export const ExportActions = React.memo(function ExportActions({
 bookId,
 book,
 totalAnnotations,
 zoteroConnected,
 t,
 onExportSuccess,
 onExportError,
}: ExportActionsProps) {
 const [zoteroExporting, setZoteroExporting] = useState(false);
 const [exporting, setExporting] = useState<string | null>(null);
 const mountedRef = useRef(true);
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 if (totalAnnotations === 0) return null;

 const downloadBlob = (
 text: string,
 type: string,
 filename: string,
 ) => {
 const blob = new Blob([text], { type });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = filename;
 a.click();
 URL.revokeObjectURL(url);
 };

 const handleExportMarkdown = async () => {
 setExporting('markdown');
 try {
  const res = await authFetch(`/api/v1/export/${bookId}/markdown`);
  const text = await res.text();
  downloadBlob(
  text,
  'text/markdown',
  `annotations-${book.title.replace(/\s+/g, '-')}.md`,
  );
  onExportSuccess(t('markdownExported'));
 } catch (error) {
  warn('ExportActions: markdown export failed', error);
  onExportError(t('failedToExport'));
 } finally {
  if (mountedRef.current) setExporting(null);
 }
 };

 const handleExportJSON = async () => {
 setExporting('json');
 try {
  const res = await authFetch(`/api/v1/export/${bookId}/json`);
  const text = await res.text();
  downloadBlob(
  text,
  'application/json',
  `annotations-${book.title.replace(/\s+/g, '-')}.json`,
  );
  onExportSuccess(t('jsonExported'));
 } catch (error) {
  warn('ExportActions: JSON export failed', error);
  onExportError(t('failedToExport'));
 } finally {
  if (mountedRef.current) setExporting(null);
 }
 };

 const handleExportZotero = async () => {
 setZoteroExporting(true);
 try {
  const res = await authFetch(`/api/v1/export/${bookId}/zotero`);
  if (!res.ok) throw new Error('Export failed');
  const text = await res.text();
  downloadBlob(
   text,
   'application/rdf+xml',
   `annotations-${book.title.replace(/\s+/g, '-')}.rdf`,
  );
  onExportSuccess(t('exportedToZotero'));
 } catch (error) {
  warn('ExportActions: Zotero export failed', error);
  onExportError(t('failedToExportZotero'));
 } finally {
  if (mountedRef.current) setZoteroExporting(false);
 }
 };

 return (
 <div className="flex flex-wrap gap-2 mb-6 animate-slide-up stagger-4">
  <button
  onClick={handleExportMarkdown}
  disabled={exporting === 'markdown'}
  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-surface-0 border border-surface-3 text-gray-700 dark:text-gray-300 hover:bg-surface-1 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400"
  >
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
   d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
   />
  </svg>
  {t('exportMarkdown')}
  </button>
  <button
  onClick={handleExportJSON}
  disabled={exporting === 'json'}
  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-surface-0 border border-surface-3 text-gray-700 dark:text-gray-300 hover:bg-surface-1 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400"
  >
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
   d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
   />
  </svg>
  {t('exportJSON')}
  </button>
  {zoteroConnected && (
  <button
   onClick={handleExportZotero}
   disabled={zoteroExporting}
   className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   <span className="font-bold text-sm">Z</span>
   {zoteroExporting ? t('exporting') : t('exportToZotero')}
  </button>
  )}
 </div>
 );
});
