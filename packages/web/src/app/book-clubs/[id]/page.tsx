'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberUser {
  id: string;
  name: string;
  email: string;
}

interface ClubMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user?: MemberUser;
}

interface CurrentBook {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  progress: number;
}

interface ClubDetail {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  inviteCode: string;
  maxMembers: number;
  currentBookId?: string;
  currentUserRole: string | null;
  clubMembers: ClubMember[];
  currentBook?: CurrentBook | null;
}

interface MemberProgress {
  userId: string;
  title: string;
  author: string;
  progress: number;
  currentPage: number;
  totalPages: number;
  status: string;
  user: { id: string; name: string };
}

interface DiscussionMessage {
  id: string;
  clubId: string;
  userId: string;
  content: string;
  createdAt: string;
  author?: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BookClubDetailPage() {
  const params = useParams();
  const clubId = params?.id as string;

  const [club, setClub] = useState<ClubDetail | null>(null);
  const [progress, setProgress] = useState<MemberProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    async function fetch() {
      try {
        const res = await api.get<ClubDetail>(`/api/book-clubs/${clubId}`);
        if (!cancelled && res.success && res.data) {
          setClub(res.data);
        }
      } catch {
        if (!cancelled) setError('Failed to load club');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [clubId]);

  // Fetch progress if there's a current book
  useEffect(() => {
    if (!clubId || !club?.currentBookId) return;
    let cancelled = false;

    api
      .get<{ hasBook: boolean; progress: MemberProgress[] }>(`/api/book-clubs/${clubId}/progress`)
      .then((res) => {
        if (!cancelled && res.success && res.data?.progress) {
          setProgress(res.data.progress);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [clubId, club?.currentBookId]);

  // Fetch discussion messages
  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    api
      .get<{ data: DiscussionMessage[] }>(`/api/book-clubs/${clubId}/discussions?limit=50`)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setMessages(Array.isArray(res.data) ? res.data : []);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [clubId]);

  async function handleSendMessage() {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await api.post<DiscussionMessage>(`/api/book-clubs/${clubId}/discussions`, {
        content: newMessage.trim(),
      });
      if (res.success && res.data) {
        setMessages((prev) => [...prev, res.data as DiscussionMessage]);
        setNewMessage('');
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function handleLeave() {
    if (!confirm('Leave this book club?')) return;
    try {
      await api.post(`/api/book-clubs/${clubId}/leave`);
      window.location.href = '/book-clubs';
    } catch {
      setError('Failed to leave club');
    }
  }

  function copyInviteCode() {
    if (!club) return;
    navigator.clipboard.writeText(club.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !club) {
    return (
      <main className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">{error || 'Club not found'}</p>
          <Link href="/book-clubs" className="text-sm text-primary-600 hover:underline mt-2 inline-block">
            Back to Book Clubs
          </Link>
        </div>
      </main>
    );
  }

  const isAdmin = club.currentUserRole === 'admin';
  const memberCount = (club.clubMembers || []).length;

  return (
    <main className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 mb-6">
          <Link href="/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300">Dashboard</Link>
          <span>/</span>
          <Link href="/book-clubs" className="hover:text-gray-600 dark:hover:text-gray-300">Book Clubs</Link>
          <span>/</span>
          <span className="text-gray-700 dark:text-gray-300">{club.name}</span>
        </div>

        {/* Club header */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center text-2xl">
                  {'\uD83D\uDCDA'}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {club.name}
                    {club.isPrivate && (
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    )}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {memberCount} member{memberCount !== 1 ? 's' : ''} &middot; Max {club.maxMembers}
                  </p>
                </div>
              </div>
              {club.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                  {club.description}
                </p>
              )}
            </div>
          </div>

          {/* Invite code */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">Invite code:</span>
            <button
              onClick={copyInviteCode}
              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary-400 transition-colors"
            >
              <code className="text-sm font-mono font-bold tracking-widest text-gray-700 dark:text-gray-300">
                {club.inviteCode}
              </code>
              <span className="text-[10px] text-gray-400">
                {copiedCode ? 'Copied!' : 'Copy'}
              </span>
            </button>
          </div>
        </div>

        {/* Current reading book */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm mb-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-lg">{'\uD83D\uDCD6'}</span>
            Currently Reading
          </h2>
          {club.currentBook ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-14 rounded bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-lg">
                  {'\uD83D\uDCD5'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{club.currentBook.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{club.currentBook.author}</p>
                </div>
              </div>

              {/* Group progress */}
              {progress.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Group Progress</p>
                  {progress.map((p) => (
                    <div key={p.userId} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 w-24 truncate">
                        {p.user?.name || 'Unknown'}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all"
                          style={{ width: `${Math.min(p.progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                        {p.progress}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {isAdmin ? 'Set a book for the club to read together' : 'No book selected yet'}
              </p>
              {isAdmin && (
                <Link
                  href="/library"
                  className="text-sm text-primary-600 hover:underline mt-1 inline-block"
                >
                  Choose from your library
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm mb-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-lg">{'\uD83D\uDC65'}</span>
            Members ({memberCount})
          </h2>
          <div className="space-y-2">
            {(club.clubMembers || []).map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                  {(member.user?.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {member.user?.name || 'Unknown'}
                  </span>
                </div>
                {member.role === 'admin' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                    Admin
                  </span>
                )}
                {member.role === 'moderator' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                    Mod
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Discussion */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm mb-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-lg">{'\uD83D\uDCAC'}</span>
            Discussion
          </h2>

          {/* Messages */}
          <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                No messages yet. Start the conversation!
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 shrink-0">
                  {(msg.author?.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {msg.author?.name || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(msg.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          {club.currentUserRole && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Share your thoughts..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                maxLength={2000}
                disabled={sending}
              />
              <button
                onClick={handleSendMessage}
                disabled={sending || !newMessage.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/book-clubs"
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            &larr; Back to Clubs
          </Link>
          {!isAdmin && (
            <button
              onClick={handleLeave}
              className="text-sm text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              Leave Club
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
