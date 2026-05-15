/**
 * Date formatting utilities
 *
 * Shared date formatting functions used across the app.
 */

export interface RelativeTimeLabels {
  just_now: string;
  minutes_ago: string;
  hours_ago: string;
  days_ago: string;
}

const DEFAULT_LABELS: RelativeTimeLabels = {
  just_now: 'Just now',
  minutes_ago: '{n}m ago',
  hours_ago: '{n}h ago',
  days_ago: '{n}d ago',
};

/**
 * Format a date string as a relative time (e.g., "5m ago", "2d ago").
 * Falls back to "MMM DD" for dates older than 7 days.
 */
export function formatRelativeTime(dateStr: string, labels?: RelativeTimeLabels): string {
  const l = labels ?? DEFAULT_LABELS;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return l.just_now;
    if (diffMin < 60) return l.minutes_ago.replace('{n}', String(diffMin));
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return l.hours_ago.replace('{n}', String(diffHr));
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return l.days_ago.replace('{n}', String(diffDay));
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}
