'use client';

import { isDisplayableAuthor } from '@/lib/book-cover';

interface RecommendationSectionProps {
 data: Record<string, unknown>;
}

interface Recommendation {
 title: string;
 author: string;
 reason: string;
 connection_to_current?: string;
 urgency?: string;
}

const URGENCY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
 now: { bg: '#fef3c7', text: '#92400e', label: 'Read Next' },
 soon: { bg: '#ecfdf5', text: '#065f46', label: 'Add to Queue' },
 someday: { bg: '#f0e9e0', text: '#6b5e4d', label: 'For Later' },
};

export default function RecommendationSection({ data }: RecommendationSectionProps) {
 const recs = (data.recommendations as Recommendation[]) || [];

 if (!recs.length) {
 return (
  <div className="rec-section">
  <p className="italic text-gray-500">No recommendations available yet.</p>
  </div>
 );
 }

 return (
 <div className="rec-section">
  {recs.map((rec) => {
  const urgency = rec.urgency || 'soon';
  const style = URGENCY_STYLES[urgency] || URGENCY_STYLES.soon;
  return (
   <div key={rec.title + '-' + rec.author} className="rec-card">
   <div className="rec-header">
    <h4 className="rec-title">{rec.title}</h4>
    <span
    className="rec-urgency"
    style={{ background: style.bg, color: style.text }}
    >
    {style.label}
    </span>
   </div>
   {isDisplayableAuthor(rec.author) && <p className="rec-author">by {rec.author}</p>}
   {rec.connection_to_current && (
    <div className="rec-connection">{rec.connection_to_current}</div>
   )}
   <p className="rec-reason">{rec.reason}</p>
   </div>
  );
  })}

  <style jsx>{`
  .rec-section {
   padding: 1rem 0;
  }
  .rec-card {
   background: #fefdfb;
   border: 1px solid #f0e9e0;
   border-radius: 0.75rem;
   padding: 1.25rem;
   margin-bottom: 1rem;
  }
  .rec-header {
   display: flex;
   align-items: center;
   justify-content: space-between;
   gap: 0.75rem;
   margin-bottom: 0.25rem;
  }
  .rec-title {
   font-family: 'Crimson Pro', Georgia, serif;
   font-size: 1.1rem;
   font-weight: 600;
   color: #1e2a38;
   margin: 0;
  }
  .rec-urgency {
   display: inline-block;
   padding: 0.2rem 0.6rem;
   border-radius: 1rem;
   font-size: 0.7rem;
   font-weight: 600;
   text-transform: uppercase;
   letter-spacing: 0.05em;
   white-space: nowrap;
  }
  .rec-author {
   color: #6b5e4d;
   font-size: 0.9rem;
   margin: 0 0 0.5rem;
  }
  .rec-connection {
   background: #fdf8f0;
   border-left: 3px solid #d97706;
   padding: 0.4rem 0.75rem;
   border-radius: 0 0.25rem 0.25rem 0;
   font-size: 0.85rem;
   color: #4a3f33;
   margin-bottom: 0.5rem;
   line-height: 1.5;
  }
  .rec-reason {
   color: #6b5e4d;
   font-size: 0.9rem;
   line-height: 1.6;
   margin: 0;
  }
  `}</style>
 </div>
 );
}
