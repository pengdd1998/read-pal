'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface Peak {
  date: string;
  description: string;
}

interface AttentionMapSectionProps {
  data: Record<string, unknown>;
}

interface PeakMomentRowProps {
  peak: Peak;
}

const PeakMomentRow = React.memo(function PeakMomentRow({ peak }: PeakMomentRowProps) {
  return (
    <div className="flex items-start gap-3 bg-surface-0 border border-surface-3 rounded-lg p-3">
      <span className="text-xs text-gray-500 shrink-0 mt-0.5 font-mono">{peak.date}</span>
      <p className="text-sm text-gray-700 m-0 leading-relaxed">{peak.description}</p>
    </div>
  );
});

export default React.memo(function AttentionMapSection({ data }: AttentionMapSectionProps) {
  const t = useTranslations('readingMirror');
  const peaks = (data.peaks as Peak[]) || [];
  const patternAnalysis = data.pattern_analysis as string | undefined;
  const engagementScore = data.engagement_score as number | undefined;
  const readingStyle = data.reading_style as string | undefined;

  if (peaks.length === 0 && !patternAnalysis) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">📊</span>
        <p className="text-sm text-gray-500 mt-2 italic">{t('no_attention_data')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {/* Reading style badge + engagement */}
      <div className="flex flex-wrap items-center gap-3">
        {readingStyle && (
          <span className="inline-block px-3 py-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-full text-sm font-medium text-amber-800 dark:text-amber-200">
            {readingStyle}
          </span>
        )}
        {engagementScore != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">{t('engagement')}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-4 rounded-sm ${i < engagementScore ? 'bg-amber-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {patternAnalysis && (
        <p className="text-gray-600 text-base leading-relaxed max-w-[65ch] italic">
          {patternAnalysis}
        </p>
      )}

      {/* Peak moments */}
      {peaks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {t('peak_moments')}
          </h4>
          <div className="space-y-2">
            {peaks.map((peak, i) => (
              <PeakMomentRow key={i} peak={peak} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
