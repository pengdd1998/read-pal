'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface ChapterStat {
  chapterIndex: number;
  highlights: number;
  notes: number;
  bookmarks: number;
  lastActivity: string;
}

interface ChapterTimelineProps {
  bookId: string;
  totalChapters: number;
  currentChapter: number;
  chapterTitles: Array<{ title: string }>;
  onChapterSelect: (index: number) => void;
  onClose: () => void;
}

export function ChapterTimeline({
  bookId,
  totalChapters,
  currentChapter,
  chapterTitles,
  onChapterSelect,
  onClose,
}: ChapterTimelineProps) {
  const [stats, setStats] = useState<ChapterStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ChapterStat[]>(`/api/annotations/stats/chapters?bookId=${bookId}`)
      .then((res) => {
        if (res.success && res.data) setStats(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId]);

  // Build a map for quick lookup
  const statsMap = new Map(stats.map((s) => [s.chapterIndex, s]));

  const maxAnnotations = Math.max(1, ...stats.map((s) => s.highlights + s.notes));

  return (
    <div className="fixed inset-0 z-40 bg-black/30 animate-fade-in" onClick={onClose}>
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl animate-slide-in-right overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Chapter Timeline</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reading activity across chapters</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close timeline"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Highlights
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-400" /> Notes
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-400" /> Bookmarks
          </span>
        </div>

        {/* Timeline */}
        <div className="p-4 space-y-1.5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            Array.from({ length: totalChapters }, (_, i) => {
              const stat = statsMap.get(i);
              const total = stat ? stat.highlights + stat.notes : 0;
              const barWidth = stat ? (total / maxAnnotations) * 100 : 0;
              const isCurrent = i === currentChapter;
              const isRead = stat && stat.lastActivity;
              const title = chapterTitles[i]?.title || `Chapter ${i + 1}`;

              return (
                <button
                  key={i}
                  onClick={() => onChapterSelect(i)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-150 ${
                    isCurrent
                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700'
                      : isRead
                      ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                      : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/30'
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
                        Here
                      </span>
                    )}
                  </div>

                  {/* Activity bar */}
                  {stat && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-400 transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 flex-shrink-0">
                        {stat.highlights > 0 && <span>{stat.highlights}h</span>}
                        {stat.notes > 0 && <span>{stat.notes}n</span>}
                        {stat.bookmarks > 0 && <span>{stat.bookmarks}b</span>}
                      </div>
                    </div>
                  )}
                </button>
              );
            })
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
}
