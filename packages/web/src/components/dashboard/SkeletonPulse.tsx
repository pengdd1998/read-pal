'use client';

import { memo } from 'react';

export const SkeletonPulse = memo(function SkeletonPulse({ className = '' }: { className?: string }) {
 return <div className={`skeleton rounded animate-pulse ${className}`} />;
});
