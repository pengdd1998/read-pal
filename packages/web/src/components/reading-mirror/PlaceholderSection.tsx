'use client';

import { useTranslations } from 'next-intl';

interface PlaceholderSectionProps {
 sectionType: string;
 title: string;
 message?: string;
}

const SECTION_ICONS: Record<string, string> = {
 attention_map: '📊',
 annotations_woven: '🧵',
 conversations: '💬',
 concept_web: '🕸️',
 what_stuck: '🧠',
 threads: '📚',
 reader_became: '🪞',
};

export default function PlaceholderSection({ sectionType, title, message }: PlaceholderSectionProps) {
 const t = useTranslations('reader');
 const icon = SECTION_ICONS[sectionType] || '✨';

 return (
 <div className="placeholder-section">
  <span className="placeholder-icon">{icon}</span>
  <h3 className="placeholder-title">{title}</h3>
  <p className="placeholder-message">
  {message || t('placeholder_message')}
  </p>

  <style jsx>{`
  .placeholder-section {
   text-align: center;
   padding: 3rem 1.5rem;
   background: #f9f5f0;
   border: 1px dashed #f0e9e0;
   border-radius: 0.75rem;
   margin: 1rem 0;
  }
  .placeholder-icon {
   font-size: 2rem;
   display: block;
   margin-bottom: 0.75rem;
  }
  .placeholder-title {
   font-family: 'Crimson Pro', Georgia, serif;
   font-size: 1.25rem;
   font-weight: 600;
   color: #4a3f33;
   margin: 0 0 0.5rem;
  }
  .placeholder-message {
   color: #8a7e72;
   font-size: 0.9rem;
   font-style: italic;
   margin: 0;
  }
  `}</style>
 </div>
 );
}
