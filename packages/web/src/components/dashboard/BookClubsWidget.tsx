'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClubMember {
  id: string;
  userId: string;
  role: string;
}

interface BookClub {
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
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 shadow-sm">
      <div className="h-5 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-4" />
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-28 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-1" />
              <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
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

export default function BookClubsWidget() {
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
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleCreate() {
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
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const res = await api.post<{ clubId: string; clubName: string }>(
        '/api/book-clubs/join-code',
        { inviteCode: joinCode.trim().toUpperCase() },
      );
      if (res.success && res.data) {
        // Re-fetch clubs to include the new one
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
  }

  if (loading) return <Skeleton />;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-xl">{'\uD83D\uDCDA'}</span>
          {t('pageTitle')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setError(null); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('join')}
          </button>
          <button
            onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setError(null); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            + {t('create')}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 space-y-3">
          <input
            type="text"
            placeholder={t('clubName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            maxLength={100}
          />
          <textarea
            placeholder={t('descriptionOptional')}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            rows={2}
            maxLength={500}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="text-xs px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {creating ? t('creating') : t('createClub')}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 space-y-3">
          <input
            type="text"
            placeholder={t('enterCode')}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white tracking-widest text-center font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            maxLength={6}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleJoin}
              disabled={joining || joinCode.length < 6}
              className="text-xs px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {joining ? t('joining') : t('joinClub')}
            </button>
            <button
              onClick={() => { setShowJoin(false); setJoinCode(''); }}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mb-3">{error}</p>
      )}

      {/* Club list */}
      {clubs.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">
            {t('noClubsYet')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600">
            {t('noClubsHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clubs.map((club) => (
            <Link
              key={club.id}
              href={`/book-clubs/${club.id}`}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
            >
              {/* Club avatar */}
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center text-lg shrink-0">
                {'\uD83D\uDCDA'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {club.name}
                  </span>
                  {club.isPrivate && (
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  )}
                  {club.currentUserRole === 'admin' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                      {t('adminBadge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-400">
                    {(club.clubMembers || []).length} {(club.clubMembers || []).length !== 1 ? t('memberCountPlural', { count: (club.clubMembers || []).length }) : t('memberCount', { count: 1 })}
                  </span>
                  {club.currentBookId && (
                    <span className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-green-500" />
                      {t('reading')}
                    </span>
                  )}
                </div>
              </div>

              {/* Chevron */}
              <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {/* Discover link */}
      <Link
        href="/book-clubs"
        className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        {t('discoverClubs')}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>
    </div>
  );
}
