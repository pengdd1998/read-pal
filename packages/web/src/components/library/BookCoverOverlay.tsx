'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { getBookCoverColors, getBookInitials } from '@/lib/book-cover';
import { CollectionPicker } from './CollectionPicker';

interface BookCoverOverlayProps {
 bookId: string;
 title: string;
 coverUrl?: string;
 status: 'unread' | 'reading' | 'completed';
 deleting: boolean;
 onShowDeleteConfirm: () => void;
 onDeleteCancel: () => void;
 onDeleteConfirm: () => void;
 showDeleteConfirm: boolean;
}

export const BookCoverOverlay = React.memo(function BookCoverOverlay({
 bookId,
 title,
 coverUrl,
 status,
 deleting,
 onShowDeleteConfirm,
 onDeleteCancel,
 onDeleteConfirm,
 showDeleteConfirm,
}: BookCoverOverlayProps) {
 const t = useTranslations('library');
 const router = useRouter();
 const [showCollectionPicker, setShowCollectionPicker] = useState(false);

 useEffect(() => {
  if (!showDeleteConfirm) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') { e.preventDefault(); onDeleteCancel(); }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [showDeleteConfirm, onDeleteCancel]);

 const STATUS_CONFIG = useMemo(() => ({
 unread: { label: t('card_unread'), dot: 'bg-surface-3', ring: 'bg-surface-1 text-gray-600 dark:text-gray-400' },
 reading: { label: t('card_reading'), dot: 'bg-primary-400', ring: 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300' },
 completed: { label: t('card_completed'), dot: 'bg-emerald-400', ring: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
 } as const), [t]);

 const cfg = STATUS_CONFIG[status];

 const coverColors = useMemo(() => getBookCoverColors(title), [title]);
 const initials = useMemo(() => getBookInitials(title), [title]);

 return (
 <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-primary-400/30 to-primary-600/70">
  {coverUrl ? (
  <Image
   src={coverUrl}
   alt={t('card_cover_of', { title })}
   fill
   sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
   className="object-cover"
  />
  ) : (
  <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${coverColors[0]} ${coverColors[1]}`}>
   <span className="text-4xl font-bold tracking-wide opacity-90">{initials}</span>
   <span className="text-[9px] mt-1 opacity-60 px-2 text-center line-clamp-2 max-w-[80%]">{title}</span>
  </div>
  )}

  {/* Status dot */}
  <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: cfg.dot }} aria-label={cfg.label} title={cfg.label} />

  {/* Bottom action bar */}
  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 py-1 z-10">
  {/* Info */}
  <button type="button"
   onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/book/${bookId}`); }}
   className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"

   aria-label={t('card_book_details')}
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
   </svg>
  </button>

  {/* Collection picker */}
  <div className="relative">
   <button type="button"
   onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCollectionPicker((v) => !v); }}
   aria-label={t('card_add_to_collection')}
   className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
   </svg>
   </button>
   {showCollectionPicker && (
   <CollectionPicker bookId={bookId} onClose={() => setShowCollectionPicker(false)} />
   )}
  </div>

  {/* Delete */}
  <div className="relative">
   <button type="button"
   onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShowDeleteConfirm(); }}
   disabled={deleting}
   aria-label={t('card_delete_book')}
   className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    deleting
    ? 'text-white/40 cursor-wait'
    : 'text-white/80 hover:text-red-400 hover:bg-red-500/20'
   }`}
   >
   {deleting ? (
    <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
   ) : (
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
   )}
   </button>
   {showDeleteConfirm && typeof document !== 'undefined' && createPortal(
    <div
     role="dialog"
     aria-modal="true"
     aria-label={t('card_confirm_delete')}
     className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
     onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteCancel(); }}
    >
     <div
      className="w-full max-w-xs rounded-xl bg-surface-0 border border-surface-2 p-4 shadow-2xl animate-in zoom-in-95 duration-150"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
     >
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('card_confirm_delete')}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 break-words">{title}</p>
      <div className="mt-4 flex gap-2">
      <button type="button"
       onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteCancel(); }}
       className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-medium bg-surface-2 text-gray-700 dark:text-gray-200 hover:bg-surface-3 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
      >
       {t('card_cancel')}
      </button>
      <button type="button"
       onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteConfirm(); }}
       className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
       {t('card_delete')}
      </button>
      </div>
     </div>
    </div>,
    document.body,
   )}
  </div>
  </div>
 </div>
 );
});
