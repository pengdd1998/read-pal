'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import SectionRenderer, {
 getSectionTitle,
 type MirrorSection,
} from '@/components/reading-mirror/SectionRenderer';

interface SectionNavProps {
 sections: MirrorSection[];
 bookId: string;
 bookTitle: string;
 bookAuthor: string;
 coverUrl?: string;
 locale: string;
}

export default function SectionNav({
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

 if (sections.length === 0) return <p className="text-center text-gray-500 py-12">{tr('empty_sections')}</p>;

 return (
 <>
  {/* Mobile section dropdown */}
  <div className="md:hidden mb-4">
  <select
   value={activeSection}
   onChange={(e) => setActiveSection(parseInt(e.target.value, 10))}
   aria-label={t('section_aria')}
   className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
  >
   {sections.map((section, i) => (
   <option key={section.id || i} value={i}>
    {getSectionTitle(section.type, tr)}
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
    <button
    key={section.id || i}
    onClick={() => setActiveSection(i)}
    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
     activeSection === i
     ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
     : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
    }`}
    >
    {getSectionTitle(section.type, tr)}
    </button>
   ))}
   </div>
  </nav>

  {/* Section content */}
  <div className="flex-1 min-w-0">
   <div className="bg-amber-50/50 border border-surface-3 rounded-xl p-6 md:p-8 shadow-xs">
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
    <p className="text-gray-500">{t('noContent')}</p>
    </div>
   )}
   </div>
  </div>
  </div>
 </>
 );
}
