'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { BookClubCard } from './BookClubCard';
import { CreateClubForm } from './CreateClubForm';
import { JoinClubForm } from './JoinClubForm';
import { warn } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types (re-exported for sub-components)
// ---------------------------------------------------------------------------

export interface ClubMember {
 id: string;
 userId: string;
 role: string;
}

export interface BookClub {
 id: string;
 name: string;
 description?: string;
 coverImage?: string;
 isPrivate: boolean;
 inviteCode: string;
 maxMembers: number;
 currentBookId?: string;
 currentUserRole: string;
 clubMembers?: ClubMember[];
 currentBook?: {
 id: string;
 title: string;
 author: string;
 coverUrl?: string;
 progress: number;
 };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-5 sm:p-6 shadow-sm">
  <div className="h-5 w-32 bg-surface-1 rounded animate-pulse mb-4" />
  <div className="space-y-3">
  {[1, 2].map((i) => (
   <div key={i} className="flex items-center gap-3">
   <div className="w-10 h-10 rounded-lg bg-surface-1 animate-pulse" />
   <div className="flex-1">
    <div className="h-4 w-28 bg-surface-1 rounded animate-pulse mb-1" />
    <div className="h-3 w-20 bg-surface-1 rounded animate-pulse" />
   </div>
   </div>
  ))}
  </div>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

function BookClubsWidgetInner() {
 const t = useTranslations('bookClubs');
 const [clubs, setClubs] = useState<BookClub[]>([]);
 const [loading, setLoading] = useState(true);
 const [showCreate, setShowCreate] = useState(false);
 const [showJoin, setShowJoin] = useState(false);
 const [newName, setNewName] = useState('');
 const [newDesc, setNewDesc] = useState('');
 const [joinCode, setJoinCode] = useState('');
 const [error, setError] = useState<string | null>(null);
 const [creating, setCreating] = useState(false);
 const [joining, setJoining] = useState(false);
 const mountedRef = useRef(true);
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 useEffect(() => {
 let cancelled = false;
 api
  .get<{ items: BookClub[] }>('/api/book-clubs')
  .then((res) => {
  if (!cancelled && res.success && res.data) {
   const list = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
   setClubs(list);
  }
  })
  .catch((err) => { warn('BookClubsWidget: fetch failed', err); if (!cancelled) setError(t('clubs_failed_load')); })
  .finally(() => {
  if (!cancelled) setLoading(false);
  });
 return () => { cancelled = true; };
 }, [t]);

 const handleCreate = useCallback(async () => {
 if (!newName.trim()) return;
 setCreating(true);
 setError(null);
 try {
  const res = await api.post<BookClub>('/api/book-clubs', {
  name: newName.trim(),
  description: newDesc.trim() || undefined,
  });
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setClubs((prev) => [res.data as BookClub, ...prev]);
  setShowCreate(false);
  setNewName('');
  setNewDesc('');
  }
 } catch (err) {
  warn('BookClubsWidget: create failed', err);
  setError(t('failedToLoad'));
 } finally {
  setCreating(false);
 }
 }, [newName, newDesc, t]);

 const handleJoin = useCallback(async () => {
 if (!joinCode.trim()) return;
 setJoining(true);
 setError(null);
 try {
  const res = await api.post<{ clubId: string; clubName: string }>(
  '/api/book-clubs/join-code',
  { inviteCode: joinCode.trim().toUpperCase() },
  );
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  const listRes = await api.get<BookClub[]>('/api/book-clubs');
  if (listRes.success && listRes.data) {
   setClubs(listRes.data);
  }
  setShowJoin(false);
  setJoinCode('');
  }
 } catch (err) {
  warn('BookClubsWidget: join failed', err);
  setError(t('clubNotFound'));
 } finally {
  setJoining(false);
 }
 }, [joinCode, t]);

 if (loading) return <Skeleton />;

 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-5 sm:p-6 shadow-sm">
  {/* Header */}
  <div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
   <svg aria-hidden="true" className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
   {t('pageTitle')}
  </h3>
  <div className="flex items-center gap-2">
   <button
   onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setError(null); }}
   className="text-xs px-3 py-1.5 rounded-lg border border-surface-3 text-gray-600 dark:text-gray-400 hover:bg-surface-1 transition-colors min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400"
   >
   {t('join')}
   </button>
   <button
   onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setError(null); }}
   className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400"
   >
   + {t('create')}
   </button>
  </div>
  </div>

  {/* Create form */}
  {showCreate && (
  <CreateClubForm
   newName={newName}
   newDesc={newDesc}
   creating={creating}
   onNameChange={setNewName}
   onDescChange={setNewDesc}
   onCreate={handleCreate}
   onCancel={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}
  />
  )}

  {/* Join form */}
  {showJoin && (
  <JoinClubForm
   joinCode={joinCode}
   joining={joining}
   onCodeChange={setJoinCode}
   onJoin={handleJoin}
   onCancel={() => { setShowJoin(false); setJoinCode(''); }}
  />
  )}

  {error && (
  <div className="text-xs text-red-500 dark:text-red-400 mb-3 flex items-center justify-between"><span>{error}</span><button type="button" onClick={() => window.location.reload()} className="font-medium underline hover:no-underline min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">{t("retry")}</button></div>
  )}

  {/* Club list */}
  {clubs.length === 0 ? (
  <div className="text-center py-6">
   <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
   {t('noClubsYet')}
   </p>
   <p className="text-xs text-gray-500 dark:text-gray-400">
   {t('noClubsHint')}
   </p>
  </div>
  ) : (
  <div className="space-y-3">
   {clubs.map((club) => (
   <BookClubCard key={club.id} club={club} />
   ))}
  </div>
  )}

  {/* Discover link */}
  <Link
  href="/book-clubs"
  className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
  >
  {t('discoverClubs')}
  <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
  </Link>
 </div>
 );
}

export default React.memo(BookClubsWidgetInner);
