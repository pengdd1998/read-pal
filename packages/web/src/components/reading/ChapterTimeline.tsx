'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface ChapterStat {
 chapterIndex: number;
 highlights: number;
 notes: number;
 bookmarks: number;
 lastActivity: string;
}

interface TimelineChapterRowProps {
 chapterIndex: number;
 stat: ChapterStat | undefined;
 isCurrent: boolean;
 maxAnnotations: number;
 title: string;
 onSelect: (index: number) => void;
 t: (key: string, params?: Record<string, string | number>) => string;
}

const TimelineChapterRow = React.memo(function TimelineChapterRow({
 chapterIndex,
 stat,
 isCurrent,
 maxAnnotations,
 title,
 onSelect,
 t,
}: TimelineChapterRowProps) {
 const total = stat ? stat.highlights + stat.notes : 0;
 const barWidth = stat ? (total / maxAnnotations) * 100 : 0;
 const isRead = stat && stat.lastActivity;

 return (
 <button type="button"
  onClick={() => onSelect(chapterIndex)}
  className={`w-full text-left p-3 rounded-xl transition-all duration-150 focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:outline-none ${
  isCurrent
   ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700'
   : isRead
   ? 'bg-surface-1 hover:bg-surface-1 border border-transparent'
   : 'border border-transparent hover:bg-surface-1'
  }`}
 >
  <div className="flex items-center gap-2 mb-1">
  {/* Progress dot */}
  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
   isCurrent
   ? 'bg-amber-500'
   : isRead
   ? 'bg-teal-400'
   : 'bg-gray-300 dark:bg-gray-600'
  }`} />
  <span className={`text-xs font-medium truncate ${
   isCurrent
   ? 'text-amber-700 dark:text-amber-300'
   : 'text-gray-700 dark:text-gray-300'
  }`}>
   {title}
  </span>
  {isCurrent && (
   <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-medium ml-auto flex-shrink-0">
   {t('timeline_here')}
   </span>
  )}
  </div>

  {/* Activity bar */}
  {stat && (
  <div className="flex items-center gap-2 mt-1.5">
   <div className="flex-1 h-1.5 bg-surface-1 rounded-full overflow-hidden">
   <div
    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-400 transition-all duration-300"
    style={{ width: `${barWidth}%` }}
   />
   </div>
   <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
   {stat.highlights > 0 && <span>{stat.highlights}{t('highlight_abbr')}</span>}
   {stat.notes > 0 && <span>{stat.notes}{t('note_abbr')}</span>}
   {stat.bookmarks > 0 && <span>{stat.bookmarks}{t('bookmark_abbr')}</span>}
   </div>
  </div>
  )}
 </button>
 );
});

interface ChapterTimelineProps {
 bookId: string;
 totalChapters: number;
 currentChapter: number;
 chapterTitles: Array<{ title: string }>;
 onChapterSelect: (index: number) => void;
 onClose: () => void;
}

export const ChapterTimeline = React.memo(function ChapterTimeline({
 bookId,
 totalChapters,
 currentChapter,
 chapterTitles,
 onChapterSelect,
 onClose,
}: ChapterTimelineProps) {
 const t = useTranslations('reader');
 const [stats, setStats] = useState<ChapterStat[]>([]);

 const handleBackdropKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
 const handlePanelClick = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);
 const reqIdRef = useRef(0);
 const mountedRef = useRef(true);
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 const loadStats = () => {
  const reqId = ++reqIdRef.current;
  setLoading(true);
  setError(false);
  api.get<ChapterStat[]>(`/api/annotations/stats/chapters?book_id=${bookId}`)
  .then((res) => {
  if (!mountedRef.current || reqId !== reqIdRef.current) return;
  if (res.success && res.data) setStats(res.data);
  })
  .catch((err) => {
  warn('ChapterTimeline: failed to load stats', err);
  if (!mountedRef.current || reqId === reqIdRef.current) setError(true);
  })
  .finally(() => { if (mountedRef.current && reqId === reqIdRef.current) setLoading(false); });
 };

 useEffect(() => { loadStats(); }, [bookId]);

 // Build a map for quick lookup
 const statsMap = useMemo(() => new Map(stats.map((s) => [s.chapterIndex, s])), [stats]);

 const maxAnnotations = useMemo(
  () => Math.max(1, ...stats.map((s) => s.highlights + s.notes)),
  [stats],
 );

 return (
 <div className="fixed inset-0 z-40 bg-black/30 animate-fade-in" onClick={onClose} onKeyDown={handleBackdropKey} role="dialog" aria-modal="true" aria-label={t('timeline_title')} tabIndex={-1}>
  <div
  className="absolute right-0 top-[61px] bottom-0 w-full max-w-sm bg-surface-0 shadow-2xl animate-slide-in-right overflow-y-auto"
  onClick={handlePanelClick}
  >
  <div className="sticky top-0 bg-surface-0 border-b border-surface-3 p-4 flex items-center justify-between z-10">
   <div>
   <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('timeline_title')}</h2>
   <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('timeline_subtitle')}</p>
   </div>
   <button type="button"
   onClick={onClose}
   className="p-1.5 rounded-lg hover:bg-surface-1 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-400"
   aria-label={t('timeline_close')}
   >
   <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>

  {/* Legend */}
  <div className="px-4 pt-3 pb-2 flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400">
   <span className="flex items-center gap-1">
   <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" /> {t('timeline_highlights')}
   </span>
   <span className="flex items-center gap-1">
   <span className="w-2 h-2 rounded-full bg-teal-400" aria-hidden="true" /> {t('timeline_notes')}
   </span>
   <span className="flex items-center gap-1">
   <span className="w-2 h-2 rounded-full bg-violet-400" aria-hidden="true" /> {t('timeline_bookmarks')}
   </span>
  </div>

  {/* Timeline */}
  <div className="p-4 space-y-1.5">
   {loading ? (
   <div className="space-y-2">
    {Array.from({ length: 8 }).map((_, i) => (
    <div key={i} className="h-12 bg-surface-1 rounded-lg animate-pulse" />
    ))}
   </div>
   ) : error ? (
   <div className="flex flex-col items-center gap-3 py-8 text-center">
    <p className="text-sm text-gray-500 dark:text-gray-400">{t('timeline_load_failed')}</p>
    <button type="button" onClick={loadStats} disabled={loading} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
     {t('timeline_retry')}
    </button>
   </div>
   ) : (
   <div className="animate-fade-in">
   {Array.from({ length: totalChapters }, (_, i) => (
    <TimelineChapterRow
     key={`chapter-${i}`}
     chapterIndex={i}
     stat={statsMap.get(i)}
     isCurrent={i === currentChapter}
     maxAnnotations={maxAnnotations}
     title={chapterTitles[i]?.title || t('timeline_chapter_fallback', { num: i + 1 })}
     onSelect={onChapterSelect}
     t={t}
    />
   ))}
   </div>
   )}
   </div>
   </div>

  <style jsx>{`
  @keyframes slide-in-right {
   from { transform: translateX(100%); }
   to { transform: translateX(0); }
  }
  .animate-slide-in-right {
   animation: slide-in-right 0.25s ease-out;
  }
  `}</style>
 </div>
 );
});
