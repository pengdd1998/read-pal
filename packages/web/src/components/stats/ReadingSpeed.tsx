'use client';

import { useTranslations } from 'next-intl';
import type { SpeedData, BookSpeed } from './types';

interface ReadingSpeedProps {
 speedData: SpeedData | null;
 bookSpeeds: BookSpeed[] | null;
}

export function ReadingSpeed({ speedData, bookSpeeds }: ReadingSpeedProps) {
 const t = useTranslations('stats');

 if (!speedData && (!bookSpeeds || bookSpeeds.length === 0)) return null;

 const showNoData = (!speedData || speedData.averageWordsPerMinute === 0) && (!bookSpeeds || bookSpeeds.length === 0);

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 mb-4">{t('speed_title')}</h2>

  {/* Average WPM metric */}
  {speedData && (
  <div className="flex items-center gap-4 mb-5">
   <div className="bg-teal-50 dark:bg-teal-900/10 rounded-xl p-4 text-center min-w-[120px]">
   <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">
    {Math.round(speedData.averageWordsPerMinute)}
   </div>
   <div className="text-xs text-gray-500 mt-0.5">{t('speed_average_wpm')}</div>
   <div className="text-[10px] text-teal-500 dark:text-teal-400 mt-0.5">{t('speed_wpm_unit')}</div>
   </div>
  </div>
  )}

  {/* WPM Trend sparkline */}
  {speedData && speedData.speedOverTime.length > 2 && (
  <WpmTrend data={speedData} />
  )}

  {/* Per-book WPM comparison */}
  {bookSpeeds && bookSpeeds.length > 0 && (
  <BookSpeedChart bookSpeeds={bookSpeeds} />
  )}

  {/* No data hint */}
  {showNoData && (
  <p className="text-sm text-gray-400">{t('speed_no_data')}</p>
  )}
 </div>
 );
}

function WpmTrend({ data }: { data: SpeedData }) {
 const t = useTranslations('stats');

 const trendData = data.speedOverTime;
 const wpmValues = trendData.map((d) => d.pagesPerHour * 250 / 60);
 const maxWpm = Math.max(...wpmValues, 1);
 const w = 300;
 const h = 60;
 const padY = 5;

 const points = wpmValues.map((wpm, i) => {
 const x = (i / Math.max(wpmValues.length - 1, 1)) * w;
 const y = h - padY - ((wpm / maxWpm) * (h - padY * 2));
 return { x, y };
 });

 const areaPath = `M${points[0].x},${h} ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${h} Z`;

 return (
 <div className="mb-5">
  <div className="flex items-center justify-between mb-2">
  <span className="text-sm text-gray-600">{t('speed_trend')}</span>
  </div>
  <svg viewBox="0 0 300 70" className="w-full h-20" preserveAspectRatio="none" role="img" aria-label={t('speed_trend_chart')}>
  <path d={areaPath} fill="url(#speedGrad)" opacity={0.25} />
  <polyline
   points={points.map((p) => `${p.x},${p.y}`).join(' ')}
   fill="none" stroke="#14b8a6" strokeWidth={2} strokeLinejoin="round"
  />
  {points.map((p, i) => (
   <circle key={p.x + "-" + p.y} cx={p.x} cy={p.y} r={2.5} fill="#14b8a6" />
  ))}
  <defs>
   <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.4} />
   <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
   </linearGradient>
  </defs>
  </svg>
 </div>
 );
}

function BookSpeedChart({ bookSpeeds }: { bookSpeeds: BookSpeed[] }) {
 const t = useTranslations('stats');
 const maxWpm = Math.max(...bookSpeeds.map((b) => b.wpm), 1);

 return (
 <div>
  <span className="text-sm text-gray-600 mb-3 block">{t('speed_by_book')}</span>
  <div className="space-y-2.5">
  {bookSpeeds.slice(0, 6).map((book) => {
   const pct = Math.max(3, (book.wpm / maxWpm) * 100);
   return (
   <div key={book.bookId} className="flex items-center gap-3">
    <span className="text-xs text-gray-600 w-28 truncate" title={book.title}>
    {book.title}
    </span>
    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
    <div
     className="h-full bg-gradient-to-r from-teal-400 to-teal-500 rounded-full transition-all duration-500"
     style={{ width: `${pct}%` }}
    />
    </div>
    <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 w-16 text-right">
    {Math.round(book.wpm)} {t('speed_wpm_unit')}
    </span>
   </div>
   );
  })}
  </div>
 </div>
 );
}
