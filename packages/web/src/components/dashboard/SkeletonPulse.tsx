'use client';

export function SkeletonPulse({ className = '' }: { className?: string }) {
 return <div className={`bg-surface-1 rounded animate-pulse ${className}`} />;
}
