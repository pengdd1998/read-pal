'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
 getSectionTitle,
 type MirrorSection,
} from '@/components/reading-mirror/SectionRenderer';

const SectionRenderer = dynamic(
  () => import('@/components/reading-mirror/SectionRenderer').then((m) => m.default),
  { ssr: false },
);

interface SectionNavProps {
 sections: MirrorSection[];
 bookId: string;
 bookTitle: string;
 bookAuthor: string;
 coverUrl?: string;
 locale: string;
}

export default React.memo(function SectionNav({
 sections,
 bookId,
 bookTitle,
 bookAuthor,
 coverUrl,
 locale,
}: SectionNavProps) {
 const t = useTranslations('memoryBooks');
 const tr = useTranslations('readingMirror');
 const [activeSection, setActiveSection] = useState(0);

 if (sections.length === 0) return (
  <div className="text-center py-12">
   <p className="text-gray-500 dark:text-gray-400 mb-4">{tr('empty_sections')}</p>
   <Link href="/memory-books" prefetch={false} className="text-sm text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded">
    {t('backToList')}
   </Link>
  </div>
 );

 return (
 <>
  {/* Mobile section dropdown */}
  <div className="md:hidden mb-4">
  <select
   value={activeSection}
   onChange={(e) => setActiveSection(parseInt(e.target.value, 10))}
   aria-label={t('section_aria')}
   className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
  >
   {sections.map((section, i) => (
   <option key={section.id || i} value={i}>
    {getSectionTitle(section.type, tr)}
    {section.error ? ` · ${t('section_failed_label')}` : ''}
   </option>
   ))}
  </select>
  </div>

  {/* Main layout: sidebar + content */}
  <div className="flex gap-6">
  {/* Sidebar navigation (desktop) */}
  <nav className="hidden md:block w-52 flex-shrink-0">
   <div className="sticky top-6 space-y-0.5">
   {sections.map((section, i) => (
    <button type="button"
    key={section.id || i}
    onClick={() => setActiveSection(i)}
    aria-current={activeSection === i ? 'true' : undefined}
    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
     activeSection === i
     ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
     : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-surface-1'
    }`}
    >
    <span className="flex-1 truncate">{getSectionTitle(section.type, tr)}</span>
    {section.error && (
    <span
     aria-label={t('section_failed_label')}
     title={t('section_failed_label')}
     className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400"
    />
    )}
    </button>
   ))}
   </div>
  </nav>

  {/* Section content */}
  <div className="flex-1 min-w-0">
   <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-surface-3 rounded-xl p-6 md:p-8 shadow-xs">
   {sections[activeSection] ? (
    <SectionRenderer
    section={sections[activeSection]}
    bookId={bookId}
    bookTitle={bookTitle}
    bookAuthor={bookAuthor}
    coverUrl={coverUrl}
    locale={locale}
    />
   ) : (
    <div className="text-center py-20">
    <p className="text-gray-500 dark:text-gray-400">{t('noContent')}</p>
    </div>
   )}
   </div>
  </div>
  </div>
 </>
 );
});
