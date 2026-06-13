/**
 * Date formatting utilities
 */

import { warn } from './logger';
export interface RelativeTimeLabels {
  just_now: string;
  minutes_ago: string;
  hours_ago: string;
  days_ago: string;
}

const DEFAULT_LABELS: RelativeTimeLabels = {
  just_now: 'Just now',
  minutes_ago: '%nm ago',
  hours_ago: '%nh ago',
  days_ago: '%nd ago',
};

/**
 * Parse a backend timestamp into a JS Date, assuming UTC if no zone is given.
 *
 * The DB column is `TIMESTAMP WITHOUT TIME ZONE` storing naive UTC values,
 * and the backend serializes them via `dt.isoformat()` (no `Z` suffix).
 * `new Date('2026-06-13T02:43:31.939707')` interprets such a string as
 * local time, which silently shifts every displayed timestamp by the
 * client's UTC offset. Detect missing zone info and append `Z`.
 */
export function parseUTCDate(dateStr: string): Date {
  const normalized =
    typeof dateStr === 'string' &&
    /T\d{2}:\d{2}/.test(dateStr) &&
    !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(dateStr)
      ? dateStr + 'Z'
      : dateStr;
  return new Date(normalized);
}

/**
 * Format a date string as a relative time (e.g., "5m ago", "2d ago").
 * Falls back to "MMM DD" for dates older than 7 days.
 */
export function formatRelativeTime(dateStr: string, labels?: RelativeTimeLabels, locale?: string): string {
  const l = labels ?? DEFAULT_LABELS;
  try {
    const date = parseUTCDate(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return l.just_now;
    if (diffMin < 60) return l.minutes_ago.replace('%n', String(diffMin));
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return l.hours_ago.replace('%n', String(diffHr));
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return l.days_ago.replace('%n', String(diffDay));
    return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
  } catch (err) {
    warn('formatRelativeTime: invalid date:', dateStr, err);
    return dateStr;
  }
}
