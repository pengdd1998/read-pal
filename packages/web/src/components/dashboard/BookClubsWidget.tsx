'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { BookClubCard } from './BookClubCard';
import { CreateClubForm } from './CreateClubForm';
import { JoinClubForm } from './JoinClubForm';

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
  <div className="h-5 w-32 bg-gray-100 rounded animate-pulse mb-4" />
  <div className="space-y-3">
  {[1, 2].map((i) => (
   <div key={i} className="flex items-center gap-3">
   <div className="w-10 h-10 rounded-lg bg-gray-100 animate-pulse" />
   <div className="flex-1">
    <div className="h-4 w-28 bg-gray-100 rounded animate-pulse mb-1" />
    <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
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
  .catch(() => { if (!cancelled) setError(t('clubs_failed_load', { defaultValue: 'Failed to load book clubs' })); })
  .finally(() => {
  if (!cancelled) setLoading(false);
  });
 return () => { cancelled = true; };
 }, []);

 const handleCreate = useCallback(async () => {
 if (!newName.trim()) return;
 setCreating(true);
 setError(null);
 try {
  const res = await api.post<BookClub>('/api/book-clubs', {
  name: newName.trim(),
  description: newDesc.trim() || undefined,
  });
  if (res.success && res.data) {
  setClubs((prev) => [res.data as BookClub, ...prev]);
  setShowCreate(false);
  setNewName('');
  setNewDesc('');
  }
 } catch {
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
  if (res.success && res.data) {
  const listRes = await api.get<BookClub[]>('/api/book-clubs');
  if (listRes.success && listRes.data) {
   setClubs(listRes.data);
  }
  setShowJoin(false);
  setJoinCode('');
  }
 } catch {
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
  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
   <span className="text-xl">{'📚'}</span>
   {t('pageTitle')}
  </h3>
  <div className="flex items-center gap-2">
   <button
   onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setError(null); }}
   className="text-xs px-3 py-1.5 rounded-lg border border-surface-3 text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px] inline-flex items-center"
   >
   {t('join')}
   </button>
   <button
   onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setError(null); }}
   className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors min-h-[44px] inline-flex items-center"
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
  <p className="text-xs text-red-500 mb-3">{error}</p>
  )}

  {/* Club list */}
  {clubs.length === 0 ? (
  <div className="text-center py-6">
   <p className="text-sm text-gray-400 mb-2">
   {t('noClubsYet')}
   </p>
   <p className="text-xs text-gray-400">
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
  className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
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
