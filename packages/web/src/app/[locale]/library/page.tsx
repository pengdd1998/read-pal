'use client';

import { useState, useCallback } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { LibraryGrid } from '@/components/library/LibraryGrid';
import { CollectionsSidebar } from '@/components/library/CollectionsSidebar';
import { usePageTitle } from '@/hooks/usePageTitle';

function MemoryBooksLink() {
 const t = useTranslations('library');
 return (
  <Link
   href="/memory-books"
   className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/60 dark:border-amber-800/40 hover:shadow-sm transition-all group"
  >
   <span className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
    <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm4 4h4m-4 4h4m-4 4h2" />
    </svg>
   </span>
   <div>
    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('memory_books_link_title')}</p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('memory_books_link_desc')}</p>
   </div>
  </Link>
 );
}

export default function LibraryPage() {
 const t = useTranslations('library');
 usePageTitle(t('page_title'));
 const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
 const [searchQuery, setSearchQuery] = useState('');
 const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
 const [collectionBookIds, setCollectionBookIds] = useState<string[] | null>(null);

 const handleSelectCollection = useCallback((id: string | null, bookIds?: string[]) => {
  if (id === null) {
   setActiveCollectionId(null);
   setCollectionBookIds(null);
   return;
  }
  setActiveCollectionId(id);
  setCollectionBookIds(bookIds || []);
 }, []);

 return (
 <section aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
  <div className="flex justify-between items-center mb-6 sm:mb-8">
  <div className="animate-slide-up">
   <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
   <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
   {t('subtitle')}
   </p>
  </div>

  <div className="flex items-center gap-2">
   {/* Quick Search */}
   <div className="hidden sm:flex items-center bg-surface-0 rounded-xl border border-surface-3 px-3 py-2">
   <svg aria-hidden="true" className="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
   </svg>
   <input
    type="text"
    autoComplete="off"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder={t('search_library')}
    aria-label={t('search_library')}
    className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/30 w-32 sm:w-44 lg:w-48"
    inputMode="search"
    enterKeyHint="search"
    spellCheck={false}
   />
   {searchQuery && (
    <button type="button" onClick={() => setSearchQuery('')} aria-label={t('clear_search')} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">
    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
    </button>
   )}
   </div>

   {/* View Toggle */}
   <div className="flex items-center gap-1 bg-surface-1 rounded-xl p-1 border border-surface-3 animate-slide-up stagger-2">
   <button type="button"
    onClick={() => setViewMode('grid')}
    className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    viewMode === 'grid'
     ? 'bg-surface-0 shadow-xs text-primary-600'
     : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400'
    }`}
    aria-label={t('grid_view')}
   >
    <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
     <rect x="1" y="1" width="6" height="6" rx="1" />
     <rect x="9" y="1" width="6" height="6" rx="1" />
     <rect x="1" y="9" width="6" height="6" rx="1" />
     <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
   </button>
   <button type="button"
    onClick={() => setViewMode('list')}
    className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    viewMode === 'list'
     ? 'bg-surface-0 shadow-xs text-primary-600'
     : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400'
    }`}
    aria-label={t('list_view')}
   >
    <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
     <rect x="1" y="1" width="14" height="3" rx="1" />
     <rect x="1" y="6" width="14" height="3" rx="1" />
     <rect x="1" y="11" width="14" height="3" rx="1" />
    </svg>
   </button>
   </div>
  </div>
  </div>

  {/* Mobile search bar */}
  <div className="sm:hidden mb-6">
  <div className="flex items-center bg-surface-0 rounded-xl border border-surface-3 px-3 py-2.5">
   <svg aria-hidden="true" className="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
   </svg>
   <input
    type="text"
    autoComplete="off"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder={t('search_library')}
    aria-label={t('search_library')}
    className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/30 flex-1"
    inputMode="search"
    enterKeyHint="search"
    spellCheck={false}
   />
  </div>
  </div>

  <div className="animate-slide-up stagger-3 flex gap-6">
  {/* Collections sidebar */}
  <div className="hidden md:block w-56 shrink-0">
   <CollectionsSidebar
   activeCollectionId={activeCollectionId}
   onSelectCollection={handleSelectCollection}
   />
   <div className="mt-4">
    <MemoryBooksLink />
   </div>
  </div>

  {/* Main grid */}
  <div className="flex-1 min-w-0">
   <LibraryGrid viewMode={viewMode} collectionBookIds={collectionBookIds} searchQuery={searchQuery} />
  </div>
  </div>

  {/* Mobile collections - shown below main content */}
  <div className="md:hidden mt-6">
  <CollectionsSidebar
   activeCollectionId={activeCollectionId}
   onSelectCollection={handleSelectCollection}
  />
  <div className="mt-4">
   <MemoryBooksLink />
  </div>
  </div>

 </section>
 );
}
