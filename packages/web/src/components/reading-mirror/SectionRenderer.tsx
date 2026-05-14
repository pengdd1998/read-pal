'use client';

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

const SECTION_TITLES: Record<string, string> = {
  encounter: 'The Encounter',
  attention_map: 'Map of Your Attention',
  highlights: 'What You Marked',
  annotations_woven: 'Your Annotations, Woven',
  conversations: 'Conversations That Shifted Your Thinking',
  concept_web: 'Your Concept Web',
  what_stuck: 'What Stuck',
  threads: 'Threads Between Books',
  reader_became: 'The Reader You Became',
  recommendations: 'Where This Leads',
};

export function getSectionTitle(type: string): string {
  return SECTION_TITLES[type] || type;
}

export default function SectionRenderer({
  section,
  bookId,
  bookTitle,
  bookAuthor,
  coverUrl,
  locale,
}: SectionRendererProps) {
  const data: Record<string, unknown> = section.data ?? {};

  // Error state
  if (section.error && !section.placeholder) {
    return (
      <div style={{ padding: '2rem', color: '#a65d57', fontStyle: 'italic' }}>
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
          title={section.title || getSectionTitle(section.type)}
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
          title={section.title || getSectionTitle(section.type)}
          message={section.message}
        />
      );
  }
}
