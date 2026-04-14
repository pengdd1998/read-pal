/**
 * Shared SVG Icon Components
 *
 * Minimal icon set extracted from repeated patterns across the app.
 * All use `currentColor` for stroke/fill so they inherit text color.
 */

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

const defaults = { strokeWidth: 2, fill: 'none', viewBox: '0 0 24 24' };

export function ChevronLeft({ className = 'w-5 h-5', size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={defaults.strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function ChevronRight({ className = 'w-5 h-5', size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={defaults.strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ChevronDown({ className = 'w-3 h-3' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={defaults.strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function ArrowLeft({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={defaults.strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

export function Refresh({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={defaults.strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

export function Check({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function CheckCircle({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

export function X({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={defaults.strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function Send({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

export function CloudOff({ className = 'w-10 h-10' }: IconProps) {
  return (
    <svg className={className} viewBox={defaults.viewBox} fill={defaults.fill} stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}
