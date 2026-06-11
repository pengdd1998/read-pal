'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { SessionData } from './types';

interface ReadingVelocityTrendProps {
 sessions: SessionData[];
}

export const ReadingVelocityTrend = React.memo(function ReadingVelocityTrend({ sessions }: ReadingVelocityTrendProps) {
 const t = useTranslations('stats');

 const { points, areaPath, durLine, avgPages } = useMemo(() => {
 if (sessions.length <= 2) return { points: [], areaPath: '', durLine: '', avgPages: '0.0' };

 const data = sessions.slice(0, 14).reverse();
 const maxPages = Math.max(...data.map((s) => s.pagesRead || 0), 1);
 const maxDuration = Math.max(...data.map((s) => s.duration || 1), 1);
 const w = 300;
 const h = 70;
 const padY = 5;

 const pts = data.map((s, i) => {
  const x = (i / Math.max(data.length - 1, 1)) * w;
  const y = h - padY - (((s.pagesRead || 0) / maxPages) * (h - padY * 2));
  return { x, y };
 });
 const area = `M${pts[0].x},${h} ${pts.map((p) => `L${p.x},${p.y}`).join(' ')} L${pts[pts.length - 1].x},${h} Z`;

 const durPts = data.map((s, i) => {
  const x = (i / Math.max(data.length - 1, 1)) * w;
  const y = h - padY - (((s.duration || 0) / maxDuration) * (h - padY * 2));
  return { x, y };
 });
 const dur = durPts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');

 const avg = (sessions.reduce((a, s) => a + (s.pagesRead || 0), 0) / sessions.length).toFixed(1);

 return { points: pts, areaPath: area, durLine: dur, avgPages: avg };
 }, [sessions]);

 if (sessions.length <= 2) return null;

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <div className="flex items-center justify-between mb-4">
  <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('reading_velocity')}</h2>
  <span className="text-xs text-gray-500 dark:text-gray-400">
   {t('avg_pages_session', { count: avgPages })}
  </span>
  </div>
  <svg viewBox="0 0 300 80" className="w-full h-24" preserveAspectRatio="none" role="img" aria-label={t('velocity_trend_chart')}>
  {/* Pages area */}
  <path d={areaPath} fill="url(#pagesGrad)" opacity={0.3} />
  <polyline
   points={points.map((p) => `${p.x},${p.y}`).join(' ')}
   fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round"
  />
  {/* Duration line */}
  <path d={durLine} fill="none" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 2" />
  {/* Data points */}
  {points.map((p) => (
   <circle key={p.x + "-" + p.y} cx={p.x} cy={p.y} r={2.5} fill="#f59e0b" />
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
   <div className="w-3 h-0.5 border-t border-dashed border-teal-500" />
   <span className="text-gray-500 dark:text-gray-400">{t('legend_duration')}</span>
  </div>
  </div>
 </div>
 );
});
