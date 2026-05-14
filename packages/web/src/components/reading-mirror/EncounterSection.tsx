'use client';

import { useMemo } from 'react';

interface EncounterSectionProps {
  data: Record<string, unknown>;
  bookTitle: string;
  bookAuthor: string;
  coverUrl?: string;
}

export default function EncounterSection({ data, bookTitle, bookAuthor, coverUrl }: EncounterSectionProps) {
  const prologue = data.prologue as Record<string, string> | undefined;
  const stats = data.stats as Record<string, unknown> | undefined;

  const text = prologue?.text || '';
  const archetype = prologue?.reading_archetype || '';
  const archetypeDesc = prologue?.archetype_description || '';

  // Extract first letter for drop cap
  const dropCap = useMemo(() => {
    if (!text) return { first: '', rest: '' };
    const match = text.match(/^(.)(.*)$/s);
    return match ? { first: match[1], rest: match[2] } : { first: '', rest: text };
  }, [text]);

  return (
    <div className="encounter-section">
      {/* Book cover + title */}
      <div className="encounter-header">
        {coverUrl && (
          <div className="encounter-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={bookTitle} className="encounter-cover-img" />
          </div>
        )}
        <div className="encounter-title-block">
          <h1 className="encounter-title">{bookTitle}</h1>
          <p className="encounter-author">by {bookAuthor}</p>
        </div>
      </div>

      {/* Prologue text with drop cap */}
      {text && (
        <div className="encounter-prologue">
          <p>
            <span className="drop-cap">{dropCap.first}</span>
            {dropCap.rest}
          </p>
        </div>
      )}

      {/* Archetype badge */}
      {archetype && (
        <div className="archetype-block">
          <span className="archetype-badge">{archetype}</span>
          {archetypeDesc && <p className="archetype-desc">{archetypeDesc}</p>}
        </div>
      )}

      {/* Reading stats strip */}
      {stats && (
        <div className="encounter-stats">
          <div className="stat-pill">
            <span className="stat-pill-value">{String(stats.total_reading_time || '0m')}</span>
            <span className="stat-pill-label">Reading Time</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-value">{String(stats.session_count || 0)}</span>
            <span className="stat-pill-label">Sessions</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-value">{String(stats.highlight_count || 0)}</span>
            <span className="stat-pill-label">Highlights</span>
          </div>
          <div className="stat-pill">
            <span className="stat-pill-value">{String(stats.longest_session || '0m')}</span>
            <span className="stat-pill-label">Longest Session</span>
          </div>
        </div>
      )}

      <style jsx>{`
        .encounter-section {
          padding: 2rem 0;
        }
        .encounter-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .encounter-cover-img {
          width: 100px;
          height: 140px;
          object-fit: cover;
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px -2px rgba(30,42,56,0.1), 0 8px 24px -4px rgba(30,42,56,0.06);
        }
        .encounter-title {
          font-family: 'Crimson Pro', Georgia, serif;
          font-size: 2rem;
          font-weight: 600;
          color: #1e2a38;
          margin: 0;
          line-height: 1.25;
        }
        .encounter-author {
          color: #6b5e4d;
          font-size: 1.1rem;
          margin: 0.25rem 0 0;
        }
        .encounter-prologue {
          font-family: 'Literata', 'Source Serif 4', Georgia, serif;
          font-size: 1.125rem;
          line-height: 1.85;
          color: #302820;
          max-width: 65ch;
          margin: 1.5rem 0;
        }
        .encounter-prologue p {
          margin: 0;
        }
        .drop-cap {
          float: left;
          font-family: 'Crimson Pro', Georgia, serif;
          font-size: 3.5rem;
          line-height: 0.8;
          padding: 0.1em 0.1em 0 0;
          color: #d97706;
          font-weight: 600;
        }
        .archetype-block {
          margin: 1rem 0 1.5rem;
        }
        .archetype-badge {
          display: inline-block;
          padding: 0.3rem 0.8rem;
          background: #fef3c7;
          border: 1px solid #fbbf24;
          border-radius: 1rem;
          font-size: 0.85rem;
          color: #92400e;
          font-weight: 500;
        }
        .archetype-desc {
          color: #6b5e4d;
          font-size: 0.9rem;
          margin: 0.4rem 0 0;
          font-style: italic;
        }
        .encounter-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid #f0e9e0;
        }
        .stat-pill {
          background: #fefdfb;
          border: 1px solid #f0e9e0;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          text-align: center;
          min-width: 100px;
        }
        .stat-pill-value {
          display: block;
          font-size: 1.1rem;
          font-weight: 600;
          color: #1e2a38;
        }
        .stat-pill-label {
          display: block;
          font-size: 0.7rem;
          color: #8a7e72;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>
    </div>
  );
}
