'use client';

import type { Annotation } from '@read-pal/shared';

const TYPE_CONFIG = {
  highlight: { icon: '\u{1F58D}', label: 'Highlight', defaultColor: '#FFEB3B' },
  note: { icon: '\u{1F4DD}', label: 'Note', defaultColor: '#2196F3' },
  bookmark: { icon: '\u{1F516}', label: 'Bookmark', defaultColor: '#9C27B0' },
} as const;

interface AnnotationCardProps {
  annotation: Annotation;
  onDelete: () => void;
  onClick: () => void;
}

export function AnnotationCard({ annotation, onDelete, onClick }: AnnotationCardProps) {
  const config = TYPE_CONFIG[annotation.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.highlight;
  const borderColor = annotation.color || config.defaultColor;

  return (
    <div
      className="group p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border-l-4 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:shadow-sm transition-all duration-200"
      style={{ borderLeftColor: borderColor }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {config.icon} {config.label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
          aria-label="Delete annotation"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
        {annotation.content}
      </p>

      {/* Note */}
      {annotation.note && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md bg-white dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
          {annotation.note}
        </div>
      )}

      {/* Page location */}
      {annotation.location?.pageIndex != null && (
        <p className="text-[10px] text-gray-400 mt-2">
          Page {annotation.location.pageIndex + 1}
        </p>
      )}
    </div>
  );
}
