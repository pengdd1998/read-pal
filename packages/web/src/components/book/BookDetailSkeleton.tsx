'use client';

import { Link } from '@/i18n/navigation';

export function BookDetailLoading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
  {/* Back link skeleton */}
  <div className="mb-8">
  <div className="h-4 bg-gray-200 rounded-lg w-20 animate-pulse" />
  </div>

  {/* Book header skeleton */}
  <div className="flex gap-6 mb-10">
  <div className="w-28 h-40 rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
  <div className="flex-1 space-y-3">
   <div className="h-7 bg-gray-200 rounded-lg w-3/4 animate-pulse" />
   <div className="h-4 bg-gray-200 rounded-lg w-1/2 animate-pulse" />
   <div className="h-6 bg-gray-200 rounded-full w-20 animate-pulse" />
  </div>
  </div>

  {/* Progress skeleton */}
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 mb-6">
  <div className="h-5 bg-gray-100 rounded w-20 mb-4 animate-pulse" />
  <div className="h-3 bg-gray-100 rounded-full animate-pulse" />
  <div className="flex justify-between mt-3">
   <div className="h-4 bg-gray-100 rounded w-32 animate-pulse" />
   <div className="h-4 bg-gray-100 rounded w-10 animate-pulse" />
  </div>
  </div>

  {/* Stats grid skeleton */}
  <div className="grid grid-cols-3 gap-3 mb-6">
  {Array.from({ length: 3 }).map((_, i) => (
   <div
   key={i}
   className="bg-gray-50 rounded-xl p-4 animate-pulse"
   >
   <div className="h-6 bg-gray-100 rounded w-8 mx-auto" />
   <div className="h-3 bg-gray-100 rounded w-12 mx-auto mt-2" />
   </div>
  ))}
  </div>
 </div>
 );
}

export function BookDetailError({
 error,
 t,
}: {
 error: string;
 t: (key: string) => string;
}) {
 return (
 <div className="flex min-h-screen items-center justify-center">
  <div className="text-center animate-scale-in">
  <p className="text-lg font-semibold mb-2">
   {error || t('errorBookNotFound')}
  </p>
  <div className="flex gap-3 justify-center mt-4">
   <button
   onClick={() => window.location.reload()}
   className="btn btn-secondary"
   >
   {t('retry')}
   </button>
   <Link href="/library" className="btn btn-primary">
   {t('backToLibrary')}
   </Link>
  </div>
  </div>
 </div>
 );
}
