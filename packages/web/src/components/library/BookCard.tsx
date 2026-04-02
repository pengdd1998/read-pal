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
  const statusColors = {
    unread: 'bg-gray-200 text-gray-700',
    reading: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  };

  const statusLabels = {
    unread: 'Unread',
    reading: 'Reading',
    completed: 'Completed',
  };

  const formattedDate = lastReadAt
    ? new Date(lastReadAt).toLocaleDateString()
    : null;

  return (
    <Link href={`/read/${id}`}>
      <div className="card hover:shadow-lg transition-shadow cursor-pointer h-full">
        {/* Cover or Placeholder */}
        <div className="aspect-[3/4] bg-gradient-to-br from-primary-400 to-purple-500 rounded-lg mb-4 flex items-center justify-center text-white text-6xl overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <span aria-hidden="true">{'\uD83D\uDCD6'}</span>
          )}
        </div>

        {/* Title & Author */}
        <h3 className="font-semibold text-lg mb-1 line-clamp-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{author}</p>

        {/* Status Badge */}
        <span
          className={`inline-block px-2 py-1 rounded-full text-xs font-medium mb-3 ${statusColors[status]}`}
        >
          {statusLabels[status]}
        </span>

        {/* Progress Bar */}
        {status !== 'unread' && (
          <div className="mb-3">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {currentPage} / {totalPages} pages
            </p>
          </div>
        )}

        {/* Last Read */}
        {formattedDate && (
          <p className="text-xs text-gray-500">
            Last read: {formattedDate}
          </p>
        )}
      </div>
    </Link>
  );
}
