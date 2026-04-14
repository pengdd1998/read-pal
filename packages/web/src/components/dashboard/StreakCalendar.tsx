'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

type ActivityLevel = 'none' | 'low' | 'medium' | 'high';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseISODate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  const [year, month, day] = parts.length === 3 ? parts : [2026, 1, 1];
  return new Date(year, month - 1, day);
}

function formatTooltipDate(dateStr: string): string {
  const d = parseISODate(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getActivityLevel(pages: number, minutes: number): ActivityLevel {
  if (pages === 0 && minutes === 0) return 'none';
  if (pages >= 30 || minutes >= 45) return 'high';
  if (pages >= 15 || minutes >= 20) return 'medium';
  return 'low';
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DayCell({
  day,
  isToday,
  isOutsideRange,
}: {
  day: CalendarDay | null;
  isToday: boolean;
  isOutsideRange: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!day || isOutsideRange) {
    return (
      <div className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] rounded-[4px] bg-transparent" />
    );
  }

  const level = getActivityLevel(day.pages, day.minutes);

  const bgClasses: Record<ActivityLevel, string> = {
    none: 'bg-gray-100 dark:bg-gray-800',
    low: 'bg-amber-200 dark:bg-amber-800/60',
    medium: 'bg-amber-400 dark:bg-amber-600/80',
    high: 'bg-amber-600 dark:bg-amber-500',
  };

  const hoverClasses: Record<ActivityLevel, string> = {
    none: 'hover:bg-gray-200 dark:hover:bg-gray-700',
    low: 'hover:bg-amber-300 dark:hover:bg-amber-700/70',
    medium: 'hover:bg-amber-500 dark:hover:bg-amber-500/90',
    high: 'hover:bg-amber-700 dark:hover:bg-amber-400',
  };

  const todayRing = isToday
    ? 'ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-gray-900'
    : '';

  return (
    <div className="relative">
      <div
        className={`w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] rounded-[4px] transition-colors duration-150 cursor-default ${bgClasses[level]} ${hoverClasses[level]} ${todayRing}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />

      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg whitespace-nowrap shadow-lg pointer-events-none">
          {formatTooltipDate(day.date)}:{' '}
          {day.pages} page{day.pages !== 1 ? 's' : ''}, {day.minutes} min
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} className="flex gap-1.5">
          {Array.from({ length: 7 }).map((_, col) => (
            <div
              key={col}
              className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] rounded-[4px] bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StreakCalendar() {
  const [data, setData] = useState<ReadingCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<ReadingCalendarData>('/api/stats/reading-calendar')
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setData(res.data as unknown as ReadingCalendarData);
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

  // Build the 30-day grid layout: 7 columns, rows indexed by day-of-week offset
  const { grid, totalDays } = useMemo(() => {
    if (!data) {
      return { grid: [] as (CalendarDay | null)[][], totalDays: 30 };
    }

    const calendar = data.calendar;
    const days = calendar.length || 30;
    const today = todayISO();

    // Build a lookup by date string
    const lookup = new Map<string, CalendarDay>();
    for (const d of calendar) {
      lookup.set(d.date, d);
    }

    // Determine the start of the 30-day window
    // If the API gave us exactly the days we need, use those; otherwise compute
    let startDate: Date;
    if (calendar.length > 0) {
      const lastDate = parseISODate(calendar[calendar.length - 1].date);
      startDate = new Date(lastDate);
      startDate.setDate(startDate.getDate() - (days - 1));
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - (days - 1));
    }

    // Generate all days in the range
    const allDays: CalendarDay[] = [];
    const cursor = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;
      const existing = lookup.get(iso);
      allDays.push(existing ?? { date: iso, pages: 0, minutes: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Determine the day-of-week offset for the first day (0=Sun .. 6=Sat)
    const firstDow = allDays.length > 0 ? parseISODate(allDays[0].date).getDay() : 0;

    // Build rows: each row represents one week (Sun-Sat)
    const rows: (CalendarDay | null)[][] = [];

    // First row may have leading empty cells
    const firstRow: (CalendarDay | null)[] = [];
    for (let pad = 0; pad < firstDow; pad++) {
      firstRow.push(null);
    }
    for (let col = firstDow; col < 7 && firstRow.length < days + firstDow; col++) {
      const idx = col - firstDow;
      firstRow.push(idx < allDays.length ? allDays[idx] : null);
    }
    rows.push(firstRow);

    // Subsequent rows
    let dayIndex = firstRow.filter(Boolean).length;
    while (dayIndex < allDays.length) {
      const row: (CalendarDay | null)[] = [];
      for (let col = 0; col < 7 && dayIndex < allDays.length; col++) {
        row.push(allDays[dayIndex]);
        dayIndex++;
      }
      // Pad incomplete last row
      while (row.length < 7) {
        row.push(null);
      }
      rows.push(row);
    }

    return { grid: rows, totalDays: days };
  }, [data]);

  const todayStr = todayISO();

  // Determine which cells are outside the 30-day range (the null cells or padding)
  const isOutside = useCallback(
    (day: CalendarDay | null): boolean => {
      return day === null;
    },
    [],
  );

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
            {/* Longest streak */}
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                Best
              </div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                {data.longestStreak}
              </div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            {/* Current streak */}
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

      {/* Calendar Grid */}
      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-flex gap-3">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-1.5">
              {DAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="h-[18px] sm:h-[22px] flex items-center text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none pr-1"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Grid cells */}
            <div className="flex gap-3">
              {grid.map((row, rowIdx) => (
                <div key={rowIdx} className="flex flex-col gap-1.5">
                  {row.map((day, colIdx) => (
                    <DayCell
                      key={`${rowIdx}-${colIdx}`}
                      day={day}
                      isToday={day !== null && day.date === todayStr}
                      isOutsideRange={isOutside(day)}
                    />
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
          <div className="w-[14px] h-[14px] rounded-[3px] bg-gray-100 dark:bg-gray-800" />
          <div className="w-[14px] h-[14px] rounded-[3px] bg-amber-200 dark:bg-amber-800/60" />
          <div className="w-[14px] h-[14px] rounded-[3px] bg-amber-400 dark:bg-amber-600/80" />
          <div className="w-[14px] h-[14px] rounded-[3px] bg-amber-600 dark:bg-amber-500" />
          <span>More</span>
        </div>
      )}
    </div>
  );
}
