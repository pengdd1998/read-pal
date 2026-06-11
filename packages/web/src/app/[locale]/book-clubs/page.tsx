'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
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

interface ClubDiscoveryCardProps {
  club: ClubListItem;
  memberLabel: string;
  maxLabel: string;
  privateAriaLabel: string;
}

const ClubDiscoveryCard = React.memo(function ClubDiscoveryCard({
  club,
  memberLabel,
  maxLabel,
  privateAriaLabel,
}: ClubDiscoveryCardProps) {
  return (
   <Link
   key={club.id}
   href={`/book-clubs/${club.id}`}
   className="block rounded-xl border border-surface-2 bg-surface-0 p-5 hover:shadow-md transition-shadow"
   >
   <div className="flex items-start justify-between">
    <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2">
     <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
     {club.name}
     </h3>
     {club.isPrivate && (
     <svg aria-label={privateAriaLabel} className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
   <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
    <span>{memberLabel}</span>
    {club.maxMembers != null && <span>{maxLabel}</span>}
   </div>
   </Link>
  );
});

export default function BookClubsPage() {
  const t = useTranslations('bookClubs');
  usePageTitle(t('pageTitle'));
  const [myClubs, setMyClubs] = useState<ClubListItem[]>([]);
  const [discoverClubs, setDiscoverClubs] = useState<ClubListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'my' | 'discover'>('my');

  useEffect(() => {
  let cancelled = false;

  async function fetchData() {
   setError(null);
   try {
   const [myRes, discRes] = await Promise.all([
    api.get<ClubListItem[]>('/api/book-clubs'),
    api.get<ClubListItem[]>('/api/book-clubs/discover'),
   ]);
   if (!cancelled) {
    if (myRes.success && myRes.data) {
    const d = myRes.data as unknown;
    setMyClubs(Array.isArray(d) ? d : ((d as Record<string, unknown>)?.items as ClubListItem[]) || []);
    }
    if (discRes.success && discRes.data) {
    const d = discRes.data as unknown;
    setDiscoverClubs(Array.isArray(d) ? d : ((d as Record<string, unknown>)?.items as ClubListItem[]) || []);
    }
   }
   } catch (err) {
   warn('BookClubs: failed to load', err);
   if (!cancelled) setError(t('clubs_failed_load'));
   } finally {
   if (!cancelled) setLoading(false);
   }
  }

  fetchData();
  const onFocus = () => { fetchData(); };
  window.addEventListener('focus', onFocus);
  return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [t]);

  const displayClubs = tab === 'my' ? myClubs : discoverClubs;

  return (
  <main id="main-content" aria-label={t('pageTitle')} className="min-h-screen bg-surface-0">
   <div className="px-4 sm:px-6 lg:px-8 py-8">
   {/* Header */}
   <div className="flex items-center justify-between mb-6">
    <div>
    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
     <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> {t('pageTitle')}
    </h1>
    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
     {t('subtitle')}
    </p>
    </div>
    <Link
    href="/dashboard"
    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors min-h-[44px] inline-flex items-center px-2"
    >
    {t('backToDashboard')}
    </Link>
   </div>

   {/* Tabs */}
   <div className="flex gap-1 p-1 bg-surface-2 rounded-xl mb-6" role="tablist" aria-label={t('clubs_tabs_label')}>
    {(['my', 'discover'] as const).map((tabKey) => (
    <button type="button"
     key={tabKey}
     id={`club-tab-${tabKey}`}
     role="tab"
     aria-selected={tab === tabKey}
     aria-controls={`club-panel-${tabKey}`}
     onClick={() => setTab(tabKey)}
     className={`flex-1 py-3 text-sm font-medium rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
     tab === tabKey
      ? 'bg-surface-0 text-gray-900 dark:text-gray-100 shadow-sm'
      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
     }`}
    >
     {tabKey === 'my' ? t('myClubs', { count: myClubs.length }) : t('discover', { count: discoverClubs.length })}
    </button>
    ))}
   </div>

   <div role="tabpanel" id={`club-panel-${tab}`} aria-labelledby={`club-tab-${tab}`}>
   {/* Loading */}
   {loading && (
    <div className="space-y-4">
    {[1, 2, 3].map((i) => (
     <div key={i} className="rounded-xl border border-surface-2 bg-surface-0 p-5 animate-pulse">
     <div className="h-5 w-40 bg-surface-1 rounded mb-2" />
     <div className="h-3 w-56 bg-surface-1 rounded" />
     </div>
    ))}
    </div>
   )}

   {/* Club list */}
   {!loading && error && (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm flex items-center justify-between">
    <span>{error}</span>
    <button type="button" onClick={() => window.location.reload()} className="text-xs font-medium underline hover:no-underline min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">{t('retry')}</button>
    </div>
   )}

   {!loading && !error && displayClubs.length === 0 && (
    <div className="text-center py-16">
    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-amber-50 to-teal-50 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center"><svg aria-hidden="true" className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div>
    <p className="text-gray-500 dark:text-gray-400 mb-1">
     {tab === 'my' ? t('noJoinedClubs') : t('noPublicClubs')}
    </p>
    {tab === 'my' && (
     <div>
     <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
     {t('discoverHint')}
     </p>
     <button type="button" onClick={() => setTab('discover')} className="text-sm text-amber-600 dark:text-amber-400 font-medium hover:underline min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">{t('discoverClubs')}</button>
     </div>
    )}
    </div>
   )}

   {!loading && !error && displayClubs.length > 0 && (
    <div className="space-y-3">
    {displayClubs.map((club) => (
     <ClubDiscoveryCard
     key={club.id}
     club={club}
     memberLabel={club.memberCount != null ? t(club.memberCount === 1 ? 'memberCount' : 'memberCountPlural', { count: club.memberCount }) : `— ${t('members')}`}
     maxLabel={t('max', { count: club.maxMembers })}
     privateAriaLabel={t('private_club')}
     />
    ))}
    </div>
   )}
   </div>
   </div>
  </main>
  );
}
