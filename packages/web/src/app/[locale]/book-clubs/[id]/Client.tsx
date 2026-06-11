'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBookClubDetail, useBookClubProgress, useBookClubDiscussion } from './hooks';
import { ClubHeaderCard } from './ClubHeaderCard';
import { ClubCurrentReading } from './ClubCurrentReading';
import { ClubMembersList } from './ClubMembersList';
import { ClubDiscussionPanel } from './ClubDiscussionPanel';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

export default function BookClubDetailPage() {
 const t = useTranslations('bookClubs');
 usePageTitle(t('detailPageTitle'));
 const params = useParams();
 const clubId = params?.id as string;

 const router = useRouter();
 const { club, loading, error, setError } = useBookClubDetail(clubId);
 const { progress, error: progressError } = useBookClubProgress(clubId, club?.currentBookId);
 const { messages, newMessage, setNewMessage, sending, sendMessage, error: discussionError, sendError, clearSendError } = useBookClubDiscussion(clubId);

 async function handleLeave() {
 if (!confirm(t('leaveConfirm'))) return;
 try {
  await api.post(`/api/book-clubs/${clubId}/leave`);
  router.push('/book-clubs');
 } catch (err) {
  warn('BookClubDetail: leave failed', err);
  setError(t('failedToLeave'));
 }
 }

 if (loading) {
 return (
  <main className="min-h-screen bg-gray-50/50">
  <div className="px-4 sm:px-6 lg:px-8 py-8">
   <div className="animate-pulse space-y-4">
   <div className="h-8 w-48 bg-surface-1 rounded" />
   <div className="h-4 w-64 bg-surface-1 rounded" />
   <div className="h-40 bg-surface-1 rounded-xl" />
   </div>
  </div>
  </main>
 );
 }

 if (error || !club) {
 return (
  <main className="min-h-screen bg-gray-50/50">
  <div className="px-4 sm:px-6 lg:px-8 py-8 text-center">
   <p className="text-gray-500">{error || t('clubNotFound')}</p>
   <Link href="/book-clubs" prefetch={false} className="text-sm text-primary-600 hover:underline mt-2 inline-block">
   {t('backToBookClubs')}
   </Link>
  </div>
  </main>
 );
 }

 const isAdmin = club.currentUserRole === 'admin';
 const memberCount = club.memberCount ?? (club.clubMembers || []).length;

 return (
 <main className="min-h-screen bg-gray-50/50">
  <div className="px-4 sm:px-6 lg:px-8 py-8">
  {/* Breadcrumb */}
  <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
   <Link href="/dashboard" prefetch={false} className="hover:text-gray-600">{t('dashboard')}</Link>
   <span>/</span>
   <Link href="/book-clubs" prefetch={false} className="hover:text-gray-600">{t('pageTitle')}</Link>
   <span>/</span>
   <span className="text-gray-700">{club.name}</span>
  </div>

  <ClubHeaderCard club={club} memberCount={memberCount} />
  <ClubCurrentReading club={club} progress={progress} progressError={progressError} isAdmin={isAdmin} />
  <ClubMembersList members={club.clubMembers || []} memberCount={memberCount} />
  <ClubDiscussionPanel
   messages={messages}
   newMessage={newMessage}
   onNewMessageChange={setNewMessage}
   onSend={sendMessage}
   sending={sending}
   currentUserRole={club.currentUserRole}
   loadError={discussionError}
   sendError={sendError}
   onClearSendError={clearSendError}
  />

  {/* Actions */}
  <div className="flex items-center justify-between">
   <Link
   href="/book-clubs" prefetch={false}
   className="text-sm text-gray-500 hover:text-gray-600 transition-colors"
   >
   &larr; {t('backToClubs')}
   </Link>
   {!isAdmin && (
   <button
    type="button"
    onClick={handleLeave}
    className="text-sm text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors min-h-[44px] inline-flex items-center px-2 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 rounded"
   >
    {t('leaveClub')}
   </button>
   )}
  </div>
  </div>
 </main>
 );
}
