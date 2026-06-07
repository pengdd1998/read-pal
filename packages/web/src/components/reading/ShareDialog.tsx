'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { ShareDiscussionTab } from './ShareDiscussionTab';
import { ShareQuoteTab } from './ShareQuoteTab';
import { ShareCitationTab } from './ShareCitationTab';

type ShareTab = 'quote' | 'discussion' | 'citation';

interface ShareDialogProps {
 annotations: Annotation[];
 bookId: string;
 bookTitle?: string;
 author?: string;
 totalPages?: number;
 currentPage?: number;
 progress?: number;
 selectedAnnotation?: Annotation | null;
 onClose: () => void;
}

const TABS: { key: ShareTab; labelKey: string }[] = [
 { key: 'quote', labelKey: 'share_tab_quote' },
 { key: 'discussion', labelKey: 'share_tab_discussion' },
 { key: 'citation', labelKey: 'share_tab_citation' },
];

export function ShareDialog({
 annotations,
 bookId,
 bookTitle,
 author,
 totalPages,
 currentPage,
 progress,
 selectedAnnotation,
 onClose,
}: ShareDialogProps) {
 const t = useTranslations('reader');
 const [activeTab, setActiveTab] = useState<ShareTab>('discussion');
 const backdropRef = useRef<HTMLDivElement>(null);

 return (
 <div
  ref={backdropRef}
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
  onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
  onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
 >
  <div
  role="dialog"
  aria-modal="true"
  aria-label={t('share_title')}
  className="bg-surface-0 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-surface-3"
  >
  {/* Header */}
  <div className="px-5 py-4 border-b border-surface-3 flex items-center justify-between">
   <h3 className="text-lg font-semibold text-gray-900">
   {t('share_title')}
   </h3>
   <button
   onClick={onClose}
   aria-label={t('share_close_dialog')}
   className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
   >
   <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>

  {/* Tabs */}
  <div role="tablist" className="flex border-b border-surface-3 px-2">
   {TABS.map((tab) => (
   <button
    key={tab.key}
    role="tab"
    aria-selected={activeTab === tab.key}
    onClick={() => setActiveTab(tab.key)}
    className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
    activeTab === tab.key
     ? 'text-amber-600 dark:text-amber-400'
     : 'text-gray-500 hover:text-gray-700'
    }`}
   >
    {t(tab.labelKey)}
    {activeTab === tab.key && (
    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 rounded-full" />
    )}
   </button>
   ))}
  </div>

  {/* Content */}
  <div className="flex-1 overflow-y-auto p-5 space-y-4">
   {/* Book info */}
   {bookTitle && (
   <p className="text-sm text-gray-500">
    {bookTitle}{author ? ` ${t('share_by_author', { author })}` : ''}
   </p>
   )}

   {/* Discussion Guide Tab */}
   {activeTab === 'discussion' && (
   <ShareDiscussionTab
    annotations={annotations}
    bookId={bookId}
    bookTitle={bookTitle}
    author={author}
    totalPages={totalPages}
    currentPage={currentPage}
    progress={progress}
   />
   )}

   {/* Quote Card Tab */}
   {activeTab === 'quote' && (
   <ShareQuoteTab selectedAnnotation={selectedAnnotation} />
   )}

   {/* Citation Tab */}
   {activeTab === 'citation' && (
   <ShareCitationTab bookId={bookId} />
   )}
  </div>
  </div>
 </div>
 );
}
