'use client';

import { LibraryGrid } from '@/components/library/LibraryGrid';

export default function LibraryPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Library</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Your personal reading collection
          </p>
        </div>
      </div>

      <LibraryGrid />
    </div>
  );
}
