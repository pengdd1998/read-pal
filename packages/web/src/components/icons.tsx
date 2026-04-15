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

