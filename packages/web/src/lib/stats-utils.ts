export function formatTime(minutes: number, t?: (key: string, params?: Record<string, string | number>) => string) {
  if (minutes < 60) return t ? t('time_minutes', { count: minutes }) : `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (t) {
    return m > 0 ? t('time_hours_minutes', { h, m }) : t('time_hours', { count: h });
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getDayName(dateStr: string, locale: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale, { weekday: 'short' });
}
