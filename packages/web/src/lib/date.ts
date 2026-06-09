/**
 * Date formatting utilities
 */

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
 * Format a date string as a relative time (e.g., "5m ago", "2d ago").
 * Falls back to "MMM DD" for dates older than 7 days.
 */
export function formatRelativeTime(dateStr: string, labels?: RelativeTimeLabels, locale?: string): string {
  const l = labels ?? DEFAULT_LABELS;
  try {
    const date = new Date(dateStr);
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
    console.warn('formatRelativeTime: invalid date:', dateStr, err);
    return dateStr;
  }
}
