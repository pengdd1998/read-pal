'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
  onDelete?: (id: string) => void;
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
  onDelete,
}: BookCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const cfg = STATUS_CONFIG[status];

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await api.delete(`/api/books/${id}`);
      onDelete?.(id);
    } catch {
      setConfirmDelete(false);
    }
  };
  const formattedDate = lastReadAt
    ? new Date(lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <Link href={`/read/${id}`} className="group">
      <div className="group hover:-translate-y-1 hover:shadow-lg transition-all duration-300 h-full flex flex-col rounded-2xl bg-surface-0 border border-gray-100 dark:border-gray-800 p-3 shadow-xs hover:ring-1 hover:ring-primary-300/50">
        {/* Cover */}
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-primary-400/30 to-primary-600/70">
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

          {/* Info button - links to detail page */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/book/${id}`); }}
            className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/30 text-white opacity-0 group-hover:opacity-100 hover:bg-black/50 transition-all duration-200"
            title="Book details"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Delete button - shows on hover */}
          <button
            onClick={handleDelete}
            className={`absolute top-2 left-2.5 p-1.5 rounded-lg transition-all duration-200 ${
              confirmDelete
                ? 'bg-red-500 text-white opacity-100'
                : 'bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500'
            }`}
            title={confirmDelete ? 'Click again to confirm' : 'Delete book'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Reading progress overlay bar at bottom of cover */}
          {status !== 'unread' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          )}
        </div>

        {/* Title & Author */}
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 leading-snug mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mb-2">{author}</p>

        {/* Status Badge */}
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase w-fit ${cfg.ring}`}>
          {cfg.label}
        </span>

        {/* Progress details */}
        {status !== 'unread' && (
          <div className="mt-auto pt-3">
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  status === 'completed' ? 'bg-emerald-500' : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-gray-400 tabular-nums">
                {currentPage} / {totalPages} pages
              </p>
              <p className="text-[10px] text-primary-500 font-semibold tabular-nums">
                {progress}%
              </p>
            </div>
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
