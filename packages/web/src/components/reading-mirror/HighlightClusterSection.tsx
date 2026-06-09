'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface HighlightClusterSectionProps {
 data: Record<string, unknown>;
 bookId: string;
 locale: string;
}

interface HighlightQuote {
 quote: string;
 page_location?: string;
 why_it_mattered?: string;
}

interface Cluster {
 name: string;
 description: string;
 highlights: HighlightQuote[];
}

export default function HighlightClusterSection({ data, bookId, locale }: HighlightClusterSectionProps) {
 const t = useTranslations('readingMirror');
 const clusters = (data.clusters as Cluster[]) || [];

 if (!clusters.length) {
 return (
  <div className="highlights-section">
  <p className="italic text-gray-500">{t('no_highlights')}</p>
  </div>
 );
 }

 return (
 <div className="highlights-section">
  {clusters.map((cluster) => (
  <div key={cluster.name} className="cluster-card">
   <h3 className="cluster-name">{cluster.name}</h3>
   <p className="cluster-desc">{cluster.description}</p>
   <div className="cluster-highlights">
   {cluster.highlights?.map((h) => (
    <div key={h.page_location ?? h.quote} className="highlight-item">
    <blockquote className="highlight-quote">{h.quote}</blockquote>
    {h.why_it_mattered && (
     <p className="highlight-commentary">{h.why_it_mattered}</p>
    )}
    {h.page_location && (
     <Link
     href={`/${locale}/read/${bookId}?location=${encodeURIComponent(h.page_location)}`}
     className="go-to-passage"
     >
     {t('go_to_passage')}
     </Link>
    )}
    </div>
   ))}
   </div>
  </div>
  ))}

  <style jsx>{`
  .highlights-section {
   padding: 1rem 0;
  }
  .cluster-card {
   background: var(--surface-0, #fefdfb);
   border: 1px solid var(--surface-2, #f0e9e0);
   border-radius: 0.75rem;
   padding: 1.25rem 1.5rem;
   margin-bottom: 1.5rem;
   border-left: 3px solid #d97706;
  }
  .cluster-name {
   font-family: 'Crimson Pro', Georgia, serif;
   font-size: 1.25rem;
   font-weight: 600;
   color: var(--gray-900, #1e1812);
   margin: 0 0 0.5rem;
  }
  .cluster-desc {
   font-size: 0.95rem;
   color: var(--gray-600, #6b5e4d);
   line-height: 1.6;
   margin: 0 0 1rem;
  }
  .highlight-item {
   margin-bottom: 1rem;
   padding-bottom: 0.75rem;
   border-bottom: 1px dashed var(--surface-3, #e4dace);
  }
  .highlight-item:last-child {
   border-bottom: none;
   margin-bottom: 0;
   padding-bottom: 0;
  }
  .highlight-quote {
   font-family: 'Literata', 'Source Serif 4', Georgia, serif;
   font-style: italic;
   font-size: 1rem;
   color: var(--gray-800, #302820);
   margin: 0 0 0.4rem;
   padding: 0.5rem 1rem;
   border-left: 3px solid #d97706;
   background: var(--surface-1, #f9f5f0);
   border-radius: 0 0.25rem 0.25rem 0;
   line-height: 1.7;
  }
  .highlight-commentary {
   color: var(--gray-600, #6b5e4d);
   font-size: 0.9rem;
   margin: 0.3rem 0 0.5rem;
   line-height: 1.5;
  }
  .go-to-passage {
   display: inline-block;
   font-size: 0.8rem;
   color: #d97706;
   text-decoration: none;
   font-weight: 500;
  }
  .go-to-passage:hover {
   text-decoration: underline;
  }
  `}</style>
 </div>
 );
}
