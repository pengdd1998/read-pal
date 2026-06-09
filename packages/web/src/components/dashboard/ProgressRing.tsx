'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface ProgressRingProps {
 value: number;
 max: number;
 size: number;
 strokeWidth: number;
 color: string;
 bgColor: string;
 children: React.ReactNode;
}

export const ProgressRing = React.memo(function ProgressRing({
 value,
 max,
 size,
 strokeWidth,
 color,
 bgColor,
 children,
}: ProgressRingProps) {
 const t = useTranslations('dashboard');
 const radius = (size - strokeWidth) / 2;
 const circumference = 2 * Math.PI * radius;
 const progress = Math.min(value / max, 1);
 const [animatedProgress, setAnimatedProgress] = useState(0);

 useEffect(() => {
 const timer = requestAnimationFrame(() => {
  setAnimatedProgress(progress);
 });
 return () => cancelAnimationFrame(timer);
 }, [progress]);

 const dashOffset = circumference * (1 - animatedProgress);

 return (
 <div className="relative" style={{ width: size, height: size }}>
  <svg
  width={size}
  height={size}
  viewBox={`0 0 ${size} ${size}`}
  className="transform -rotate-90"
  role="img"
  aria-label={t('progress_aria', { value, max })}
  >
  <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
  <circle
   cx={size / 2}
   cy={size / 2}
   r={radius}
   fill="none"
   stroke={color}
   strokeWidth={strokeWidth}
   strokeLinecap="round"
   strokeDasharray={circumference}
   strokeDashoffset={dashOffset}
   className="transition-[stroke-dashoffset] duration-1000 ease-out"
  />
  </svg>
  <div className="absolute inset-0 flex items-center justify-center">{children}</div>
 </div>
 );
});
