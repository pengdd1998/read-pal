'use client';

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { useToast } from '@/components/Toast';
import { AnnotationEditForm } from './AnnotationEditForm';
import { useShareAsImage } from '@/hooks/useShareAsImage';

const TYPE_ICONS: Record<string, string> = { highlight: '\u{1F58D}', note: '\u{1F4DD}', bookmark: '\u{1F516}' };
const TYPE_COLORS: Record<string, string> = { highlight: '#FFEB3B', note: '#2196F3', bookmark: '#9C27B0' };

interface AnnotationCardProps {
 annotation: Annotation;
 bookTitle?: string;
 author?: string;
 onDelete: (id: string) => void;
 onUpdate: (updated: Annotation) => void;
 onClick: (annotation: Annotation) => void;
}

export const AnnotationCard = memo(function AnnotationCard({ annotation, bookTitle, author, onDelete, onUpdate, onClick }: AnnotationCardProps) {
 const t = useTranslations('reader');
 const tc = useTranslations('common');
 const { toast } = useToast();
 const [editing, setEditing] = useState(false);
 const [sharing, setSharing] = useState(false);
 const [confirmDelete, setConfirmDelete] = useState(false);
 const mountedRef = useRef(true);
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 const canShareAsImage = annotation.type === 'highlight' || annotation.type === 'note';
 const quoteText = annotation.content || '';

 const TYPE_LABELS = useMemo<Record<string, string>>(() => ({
  highlight: t('card_highlight'), note: t('card_note'), bookmark: t('card_bookmark'),
 }), [t]);

 const icon = TYPE_ICONS[annotation.type] || TYPE_ICONS.highlight;
 const label = TYPE_LABELS[annotation.type] || TYPE_LABELS.highlight;
 const borderColor = annotation.color || TYPE_COLORS[annotation.type] || TYPE_COLORS.highlight;

 const handleShare = useShareAsImage(
 quoteText, bookTitle || '', author || '',
 t('card_unknown_book'), t('card_unknown_author'),
 );

 const handleShareClick = useCallback(async (e: React.MouseEvent) => {
 if (!quoteText || sharing) return;
 setSharing(true);
 await handleShare(e);
 if (!mountedRef.current) return;
 setSharing(false);
 }, [quoteText, sharing, handleShare]);

 const startEdit = (e: React.MouseEvent) => {
 e.stopPropagation();
 setEditing(true);
 };

 if (editing) {
 return (
  <AnnotationEditForm
  annotation={annotation}
  borderColor={borderColor}
  onUpdate={onUpdate}
  onCancel={() => setEditing(false)}
  />
 );
 }

 return (
 <div
  role="article"
  tabIndex={0}
  className="group p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 border-l-4 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
  style={{ borderLeftColor: borderColor }}
  onClick={() => onClick(annotation)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(annotation); } }}
 >
  {/* Header */}
  <div className="flex items-center justify-between mb-1.5">
  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
   {icon} {label}
  </span>
  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
   {canShareAsImage && (
   <button
    onClick={handleShareClick}
    disabled={sharing}
    className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-teal-500 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400"
    aria-label={tc('share_as_image')}
    title={tc('share_as_quote')}
   >
    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
   </button>
   )}
   <button
   onClick={startEdit}
   className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all focus-visible:ring-2 focus-visible:ring-amber-400"
   aria-label={tc('edit')}
   >
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
   </svg>
   </button>
   <button
   onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
   className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all focus-visible:ring-2 focus-visible:ring-amber-400"
   aria-label={tc('delete')}
   >
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
   </svg>
   </button>
  </div>
  </div>

  {/* Content */}
  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
  {annotation.content}
  </p>

  {/* Note */}
  {annotation.note && (
  <div className="mt-2 px-2.5 py-1.5 rounded-md bg-white/50 dark:bg-gray-800/50 text-xs text-gray-600 dark:text-gray-400 border border-surface-3">
   {annotation.note}
  </div>
  )}

  {/* Tags */}
  {annotation.tags && annotation.tags.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-2">
   {annotation.tags.map((tag) => (
   <span
    key={tag}
    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
    tag === 'discuss'
     ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
     : tag === 'important'
     ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
     : tag === 'question'
     ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
     : 'bg-surface-2 text-gray-600 dark:text-gray-300'
    }`}
   >
    #{tag}
   </span>
   ))}
  </div>
  )}

  {/* Page location */}
  {annotation.location?.pageIndex != null && (
  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
   {t('card_page', { number: annotation.location.pageIndex + 1 })}
  </p>
  )}

  {/* Delete confirmation */}
  {confirmDelete && (
  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-200 dark:border-red-800" onClick={(e) => e.stopPropagation()}>
   <span className="text-xs text-red-600 dark:text-red-400 flex-1">{tc('confirm_delete')}</span>
   <button
    onClick={(e) => { e.stopPropagation(); onDelete(annotation.id); }}
    className="px-2 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 min-h-[44px] focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
   >
    {tc('yes')}
   </button>
   <button
    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
    className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 min-h-[44px] focus-visible:ring-2 focus-visible:ring-gray-400"
   >
    {tc('cancel')}
   </button>
  </div>
  )}
 </div>
 );
});
