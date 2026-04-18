'use client';

import { ZoteroSection } from '@/components/settings/ZoteroSection';
import { ApiKeysSection } from '@/components/settings/ApiKeysSection';
import { OfflineSection } from '@/components/settings/OfflineSection';

export function DeveloperSection() {
  return (
    <>
      {/* Integrations — Zotero */}
      <section className="mt-10 animate-slide-up stagger-3">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Integrations
        </h2>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-100 to-rose-200 dark:from-red-900/30 dark:to-rose-900/30 flex items-center justify-center text-lg font-bold text-red-600 dark:text-red-400">
              Z
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Zotero</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Export highlights & notes to your Zotero library</p>
            </div>
          </div>
          <ZoteroSection />
        </div>
      </section>

      {/* Developer API */}
      <section className="mt-6 animate-slide-up stagger-3">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-slate-200 dark:from-gray-800 dark:to-slate-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Developer API</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Access your reading data programmatically</p>
            </div>
          </div>
          <ApiKeysSection />
        </div>
      </section>

      {/* Offline Reading */}
      <section className="mt-6 animate-slide-up stagger-3">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 2.829a1.5 1.5 0 010 2.121M6.636 18.364a9 9 0 010-12.728" />
          </svg>
          Offline Reading
        </h2>
        <OfflineSection />
      </section>
    </>
  );
}
