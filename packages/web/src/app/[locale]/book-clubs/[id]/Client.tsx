'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBookClubDetail, useBookClubProgress, useBookClubDiscussion } from './hooks';
import { ClubHeaderCard } from './ClubHeaderCard';
import { ClubCurrentReading } from './ClubCurrentReading';
import { ClubMembersList } from './ClubMembersList';
import { ClubDiscussionPanel } from './ClubDiscussionPanel';
import { api } from '@/lib/api';

export default function BookClubDetailPage() {
  const t = useTranslations('bookClubs');
  usePageTitle(t('detailPageTitle'));
  const params = useParams();
  const clubId = params?.id as string;

  const { club, loading, error, setError } = useBookClubDetail(clubId);
  const { progress } = useBookClubProgress(clubId, club?.currentBookId);
  const { messages, newMessage, setNewMessage, sending, sendMessage } = useBookClubDiscussion(clubId);

  async function handleLeave() {
    if (!confirm(t('leaveConfirm'))) return;
    try {
      await api.post(`/api/book-clubs/${clubId}/leave`);
      window.location.href = '/book-clubs';
    } catch {
      setError(t('failedToLeave'));
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
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
        <div className="px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">{error || t('clubNotFound')}</p>
          <Link href="/book-clubs" className="text-sm text-primary-600 hover:underline mt-2 inline-block">
            {t('backToBookClubs')}
          </Link>
        </div>
      </main>
    );
  }

  const isAdmin = club.currentUserRole === 'admin';
  const memberCount = (club.clubMembers || []).length;

  return (
    <main className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 mb-6">
          <Link href="/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300">{t('dashboard')}</Link>
          <span>/</span>
          <Link href="/book-clubs" className="hover:text-gray-600 dark:hover:text-gray-300">{t('pageTitle')}</Link>
          <span>/</span>
          <span className="text-gray-700 dark:text-gray-300">{club.name}</span>
        </div>

        <ClubHeaderCard club={club} memberCount={memberCount} />
        <ClubCurrentReading club={club} progress={progress} isAdmin={isAdmin} />
        <ClubMembersList members={club.clubMembers || []} memberCount={memberCount} />
        <ClubDiscussionPanel
          messages={messages}
          newMessage={newMessage}
          onNewMessageChange={setNewMessage}
          onSend={sendMessage}
          sending={sending}
          currentUserRole={club.currentUserRole}
        />

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/book-clubs"
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            &larr; {t('backToClubs')}
          </Link>
          {!isAdmin && (
            <button
              onClick={handleLeave}
              className="text-sm text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              {t('leaveClub')}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
