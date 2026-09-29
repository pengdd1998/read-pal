/**
 * Ops time formatting (L5, P-L): the tables showed raw ISO strings with
 * no timezone — CCR carries GMT+8. Render local-tz short times with a
 * relative secondary and the full local timestamp (+offset) in the
 * hover title. Relative units stay compact/universal (now/m/h/d).
 */

export interface TraceTime {
  main: string; // MM-DD HH:mm (local)
  rel: string;  // now | 12m | 3h | 2d
  full: string; // locale string + GMT offset, for title tooltips
}

export function formatTraceTime(iso: string, nowMs: number = Date.now()): TraceTime {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { main: iso, rel: '', full: iso };
  const p = (n: number) => String(n).padStart(2, '0');
  const main = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  const diff = nowMs - d.getTime();
  const rel = diff < 60_000 ? 'now'
    : diff < 3_600_000 ? `${Math.floor(diff / 60_000)}m`
    : diff < 86_400_000 ? `${Math.floor(diff / 3_600_000)}h`
    : `${Math.floor(diff / 86_400_000)}d`;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const tz = `GMT${sign}${p(Math.floor(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
  return { main, rel, full: `${d.toLocaleString()} (${tz})` };
}
