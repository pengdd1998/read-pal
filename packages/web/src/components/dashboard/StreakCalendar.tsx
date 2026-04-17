'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarDay {
  date: string;
  pages: number;
  minutes: number;
}

interface ReadingCalendarData {
  calendar: CalendarDay[];
  currentStreak: number;
  longestStreak: number;
  totalDaysActive: number;
}

type ActivityLevel = 0 | 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''] as const;

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMonth(date: Date): number {
  return date.getMonth();
}

function getActivityLevel(pages: number, minutes: number): ActivityLevel {
  if (pages === 0 && minutes === 0) return 0;
  if (pages >= 40 || minutes >= 60) return 4;
  if (pages >= 20 || minutes >= 30) return 3;
  if (pages >= 10 || minutes >= 15) return 2;
  return 1;
}

const LEVEL_COLORS: Record<ActivityLevel, string> = {
  0: 'bg-gray-100 dark:bg-gray-800',
  1: 'bg-amber-200 dark:bg-amber-900/50',
  2: 'bg-amber-300 dark:bg-amber-700/60',
  3: 'bg-amber-500 dark:bg-amber-600/80',
  4: 'bg-amber-700 dark:bg-amber-500',
};

const HOVER_COLORS: Record<ActivityLevel, string> = {
  0: 'hover:bg-gray-200 dark:hover:bg-gray-700',
  1: 'hover:bg-amber-300 dark:hover:bg-amber-800/60',
  2: 'hover:bg-amber-400 dark:hover:bg-amber-600/70',
  3: 'hover:bg-amber-600 dark:hover:bg-amber-500/90',
  4: 'hover:bg-amber-800 dark:hover:bg-amber-400',
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTooltipDate(dateStr: string): string {
  const d = parseISO(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DayCell({
  day,
  isToday,
}: {
  day: CalendarDay | null;
  isToday: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!day) {
    return <div className="w-[13px] h-[13px] rounded-[3px]" />;
  }

  const level = getActivityLevel(day.pages, day.minutes);
  const todayRing = isToday ? 'ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-gray-900' : '';

  return (
    <div className="relative">
      <div
        className={`w-[13px] h-[13px] rounded-[3px] transition-colors duration-100 cursor-default ${LEVEL_COLORS[level]} ${HOVER_COLORS[level]} ${todayRing}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[11px] rounded-md whitespace-nowrap shadow-lg pointer-events-none">
          {formatTooltipDate(day.date)}
          {level > 0 && (
            <span className="ml-1 text-gray-300 dark:text-gray-600">
              {day.pages}p, {day.minutes}m
            </span>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-[3px] border-transparent border-t-gray-900 dark:border-t-gray-100" />
        </div>
      )}
    </div>
  );
}

function SkeletonHeatmap() {
  return (
    <div className="space-y-[3px]">
      {Array.from({ length: 7 }).map((_, row) => (
        <div key={row} className="flex gap-[3px]">
          {Array.from({ length: 26 }).map((_, col) => (
            <div
              key={col}
              className="w-[13px] h-[13px] rounded-[3px] bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — GitHub-style contribution heatmap
// ---------------------------------------------------------------------------

export default function StreakCalendar() {
  const [data, setData] = useState<ReadingCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<ReadingCalendarData>('/api/stats/reading-calendar?months=6')
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setData(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load calendar data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Build GitHub-style heatmap: columns = weeks, rows = days of week (Mon-Sun)
  const { weeks, monthMarkers } = useMemo(() => {
    if (!data || data.calendar.length === 0) {
      return { weeks: [] as (CalendarDay | null)[][], monthMarkers: [] as { label: string; col: number }[] };
    }

    const calendar = data.calendar;
    const lookup = new Map<string, CalendarDay>();
    for (const d of calendar) {
      lookup.set(d.date, d);
    }

    // Determine date range: ~6 months ending today
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - calendar.length + 1);

    // Snap start to previous Sunday to align weeks
    const startDow = startDate.getDay(); // 0=Sun
    const alignedStart = new Date(startDate);
    alignedStart.setDate(alignedStart.getDate() - startDow);

    // Generate all days from alignedStart to today
    const allDays: (CalendarDay | null)[] = [];
    const cursor = new Date(alignedStart);
    while (cursor <= today) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;
      const existing = lookup.get(iso);
      allDays.push(existing ?? null);
      cursor.setDate(cursor.getDate() + 1);
    }

    // Chunk into weeks (7 days each, Sun-Sat)
    const weekCols: (CalendarDay | null)[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weekCols.push(allDays.slice(i, i + 7));
    }

    // Compute month markers (first column where a new month starts)
    const markers: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < weekCols.length; col++) {
      const week = weekCols[col];
      for (const day of week) {
        if (day) {
          const m = getMonth(parseISO(day.date));
          if (m !== lastMonth) {
            markers.push({ label: MONTH_LABELS[m], col });
            lastMonth = m;
          }
          break;
        }
      }
    }

    return { weeks: weekCols, monthMarkers: markers };
  }, [data]);

  const todayStr = todayISO();

  // Total days in the period
  const totalDays = data?.calendar.length ?? 180;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Reading Streak
          </h3>
          {loading ? (
            <div className="mt-1 h-4 w-40 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ) : error ? (
            <p className="text-sm text-red-500 mt-1">{error}</p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {data?.totalDaysActive ?? 0}/{totalDays} active days
            </p>
          )}
        </div>

        {!loading && !error && data && (
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                Best
              </div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                {data.longestStreak}
              </div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                Current
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {data.currentStreak}
                </span>
                {data.currentStreak > 0 && (
                  <span className="text-xl" role="img" aria-label="fire streak">
                    {'\uD83D\uDD25'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Heatmap Grid */}
      {loading ? (
        <SkeletonHeatmap />
      ) : error ? (
        <div className="h-32 flex items-center justify-center">
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Month labels */}
          <div className="flex mb-1 ml-[32px]" style={{ gap: '0px' }}>
            {monthMarkers.map((m, i) => {
              const nextCol = monthMarkers[i + 1]?.col ?? weeks.length;
              const spanCols = nextCol - m.col;
              return (
                <div
                  key={`${m.label}-${m.col}`}
                  className="text-[10px] text-gray-400 dark:text-gray-500 font-medium"
                  style={{ width: `${spanCols * 16}px` }}
                >
                  {spanCols >= 2 ? m.label : ''}
                </div>
              );
            })}
          </div>

          {/* Grid with day labels */}
          <div className="flex gap-0">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-[3px] mr-1">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="h-[13px] flex items-center text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none pr-1"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Heatmap columns */}
            <div className="flex gap-[3px]">
              {weeks.map((week, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-[3px]">
                  {week.map((day, rowIdx) => (
                    <DayCell
                      key={`${colIdx}-${rowIdx}`}
                      day={day}
                      isToday={day !== null && day.date === todayStr}
                    />
                  ))}
                  {/* Pad incomplete weeks */}
                  {week.length < 7 &&
                    Array.from({ length: 7 - week.length }).map((_, i) => (
                      <div key={`pad-${i}`} className="w-[13px] h-[13px]" />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && !error && (
        <div className="flex items-center gap-1.5 mt-4 text-[10px] text-gray-400 dark:text-gray-500">
          <span>Less</span>
          <div className="w-[13px] h-[13px] rounded-[3px] bg-gray-100 dark:bg-gray-800" />
          <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-200 dark:bg-amber-900/50" />
          <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-300 dark:bg-amber-700/60" />
          <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-500 dark:bg-amber-600/80" />
          <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-700 dark:bg-amber-500" />
          <span>More</span>
        </div>
      )}
    </div>
  );
}
