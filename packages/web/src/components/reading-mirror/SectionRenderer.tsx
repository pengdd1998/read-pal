'use client';

import { useTranslations } from 'next-intl';
import EncounterSection from './EncounterSection';
import HighlightClusterSection from './HighlightClusterSection';
import RecommendationSection from './RecommendationSection';
import PlaceholderSection from './PlaceholderSection';

export interface MirrorSection {
 id: string;
 type: string;
 title?: string;
 data?: Record<string, unknown>;
 placeholder?: boolean;
 message?: string;
 error?: string;
}

interface SectionRendererProps {
 section: MirrorSection;
 bookId: string;
 bookTitle: string;
 bookAuthor: string;
 coverUrl?: string;
 locale: string;
}

const SECTION_KEY_MAP: Record<string, string> = {
 encounter: 'section_encounter',
 attention_map: 'section_attention_map',
 highlights: 'section_highlights',
 annotations_woven: 'section_annotations_woven',
 conversations: 'section_conversations',
 concept_web: 'section_concept_web',
 what_stuck: 'section_what_stuck',
 threads: 'section_threads',
 reader_became: 'section_reader_became',
 recommendations: 'section_recommendations',
};

export function getSectionTitle(type: string, t?: (key: string) => string): string {
 const i18nKey = SECTION_KEY_MAP[type];
 if (i18nKey && t) return t(i18nKey);
 return SECTION_KEY_MAP[type] ? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : type;
}

export default function SectionRenderer({
 section,
 bookId,
 bookTitle,
 bookAuthor,
 coverUrl,
 locale,
}: SectionRendererProps) {
 const tr = useTranslations('readingMirror');
 const data: Record<string, unknown> = section.data ?? {};

 // Error state
 if (section.error && !section.placeholder) {
 return (
  <div className="p-8 italic text-red-500">
  {section.error}
  </div>
 );
 }

 // Placeholder sections (Phase 2)
 const hasContent = data.prologue || data.clusters || data.recommendations;
 const isRenderableType = section.type === 'encounter' || section.type === 'highlights' || section.type === 'recommendations';
 if (section.placeholder || (!hasContent && !isRenderableType)) {
 const isKnownPlaceholder = ['attention_map', 'annotations_woven', 'conversations', 'concept_web', 'what_stuck', 'threads', 'reader_became'].includes(section.type);
 if (isKnownPlaceholder) {
  return (
  <PlaceholderSection
   sectionType={section.type}
   title={section.title || getSectionTitle(section.type, tr)}
   message={section.message}
  />
  );
 }
 }

 // Dispatch to section-specific component
 switch (section.type) {
 case 'encounter':
  return (
  <EncounterSection
   data={data}
   bookTitle={bookTitle}
   bookAuthor={bookAuthor}
   coverUrl={coverUrl}
  />
  );

 case 'highlights':
  return (
  <HighlightClusterSection
   data={data}
   bookId={bookId}
   locale={locale}
  />
  );

 case 'recommendations':
  return <RecommendationSection data={data} />;

 default:
  // Fallback for any unrecognized section type
  return (
  <PlaceholderSection
   sectionType={section.type}
   title={section.title || getSectionTitle(section.type, tr)}
   message={section.message}
  />
  );
 }
}
