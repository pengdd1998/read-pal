'use client';

import { useTranslations } from 'next-intl';
import type { SessionData } from './types';

interface ReadingVelocityTrendProps {
  sessions: SessionData[];
}

export function ReadingVelocityTrend({ sessions }: ReadingVelocityTrendProps) {
  const t = useTranslations('stats');

  if (sessions.length <= 2) return null;

  const data = sessions.slice(0, 14).reverse();
  const maxPages = Math.max(...data.map((s) => s.pagesRead || 0), 1);
  const maxDuration = Math.max(...data.map((s) => s.duration || 1), 1);
  const w = 300;
  const h = 70;
  const padY = 5;

  const points = data.map((s, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - padY - (((s.pagesRead || 0) / maxPages) * (h - padY * 2));
    return { x, y };
  });
  const areaPath = `M${points[0].x},${h} ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${h} Z`;

  const durPoints = data.map((s, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - padY - (((s.duration || 0) / maxDuration) * (h - padY * 2));
    return { x, y };
  });
  const durLine = durPoints.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');

  const avgPages = (sessions.reduce((a, s) => a + (s.pagesRead || 0), 0) / sessions.length).toFixed(1);

  return (
    <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('reading_velocity')}</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {t('avg_pages_session', { count: avgPages })}
        </span>
      </div>
      <svg viewBox="0 0 300 80" className="w-full h-24" preserveAspectRatio="none" role="img" aria-label="Reading velocity trend chart">
        {/* Pages area */}
        <path d={areaPath} fill="url(#pagesGrad)" opacity={0.3} />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round"
        />
        {/* Duration line */}
        <path d={durLine} fill="none" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 2" />
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#f59e0b" />
        ))}
        <defs>
          <linearGradient id="pagesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-amber-500 rounded" />
          <span className="text-gray-500 dark:text-gray-400">{t('legend_pages')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-teal-500 rounded" style={{ borderTop: '1px dashed #14b8a6' }} />
          <span className="text-gray-500 dark:text-gray-400">{t('legend_duration')}</span>
        </div>
      </div>
    </div>
  );
}
