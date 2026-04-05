'use client';

import Link from 'next/link';

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  progress: number;
  status: 'unread' | 'reading' | 'completed';
  currentPage: number;
  totalPages: number;
  lastReadAt?: Date | string;
}

const STATUS_CONFIG = {
  unread: { label: 'Unread', dot: 'bg-gray-300', ring: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
  reading: { label: 'Reading', dot: 'bg-primary-400', ring: 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300' },
  completed: { label: 'Completed', dot: 'bg-emerald-400', ring: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
} as const;

export function BookCard({
  id,
  title,
  author,
  coverUrl,
  progress,
  status,
  currentPage,
  totalPages,
  lastReadAt,
}: BookCardProps) {
  const cfg = STATUS_CONFIG[status];
  const formattedDate = lastReadAt
    ? new Date(lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <Link href={`/read/${id}`} className="group">
      <div className="group hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 h-full flex flex-col rounded-2xl bg-surface-0 border border-gray-100 dark:border-gray-800 p-3 hover:ring-1 hover:ring-primary-300/50">
        {/* Cover */}
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-primary-400/30 to-primary-600/70">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`Cover of ${title}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl opacity-60" aria-hidden="true">{'\uD83D\uDCD6'}</span>
            </div>
          )}

          {/* Status dot */}
          <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900" style={{ backgroundColor: cfg.dot }} />
        </div>

        {/* Title & Author */}
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 leading-snug mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mb-3">{author}</p>

        {/* Status Badge */}
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${cfg.ring}`}>
          {cfg.label}
        </span>

        {/* Progress */}
        {status !== 'unread' && (
          <div className="mt-auto pt-4">
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  status === 'completed' ? 'bg-emerald-500' : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 tabular-nums">
              {currentPage} / {totalPages} pages
            </p>
          </div>
        )}

        {/* Last read */}
        {formattedDate && (
          <p className="text-[10px] text-gray-400 mt-2">
            {formattedDate}
          </p>
        )}
      </div>
    </Link>
  );
}
