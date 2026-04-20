'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';

interface ClubListItem {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  maxMembers: number;
  memberCount: number;
  createdAt: string;
}

export default function BookClubsPage() {
  const t = useTranslations('bookClubs');
  usePageTitle(t('pageTitle'));
  const [myClubs, setMyClubs] = useState<ClubListItem[]>([]);
  const [discoverClubs, setDiscoverClubs] = useState<ClubListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'discover'>('my');

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const [myRes, discRes] = await Promise.all([
          api.get<ClubListItem[]>('/api/book-clubs'),
          api.get<ClubListItem[]>('/api/book-clubs/discover'),
        ]);
        if (!cancelled) {
          if (myRes.success && myRes.data) setMyClubs(myRes.data);
          if (discRes.success && discRes.data) setDiscoverClubs(discRes.data as ClubListItem[]);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, []);

  const displayClubs = tab === 'my' ? myClubs : discoverClubs;

  return (
    <main className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {'\uD83D\uDCDA'} {t('pageTitle')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
          {(['my', 'discover'] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors ${
                tab === tabKey
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tabKey === 'my' ? t('myClubs', { count: myClubs.length }) : t('discover', { count: discoverClubs.length })}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
                <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded mb-2" />
                <div className="h-3 w-56 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Club list */}
        {!loading && displayClubs.length === 0 && (
          <div className="text-center py-16">
            <span className="text-4xl block mb-3">{'\uD83D\uDCDA'}</span>
            <p className="text-gray-500 dark:text-gray-400 mb-1">
              {tab === 'my' ? t('noJoinedClubs') : t('noPublicClubs')}
            </p>
            {tab === 'my' && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t('discoverHint')}
              </p>
            )}
          </div>
        )}

        {!loading && displayClubs.length > 0 && (
          <div className="space-y-3">
            {displayClubs.map((club) => (
              <Link
                key={club.id}
                href={`/book-clubs/${club.id}`}
                className="block rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {club.name}
                      </h3>
                      {club.isPrivate && (
                        <svg aria-label="Private club" className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      )}
                    </div>
                    {club.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {club.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 dark:text-gray-500">
                  <span>{club.memberCount ?? '—'} {t('members')}</span>
                  <span>{t('max', { count: club.maxMembers })}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
