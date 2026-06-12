'use client';

import { useState, useRef, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { isDisplayableAuthor } from '@/lib/book-cover';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

interface ReadingCardData {
 user: { name: string };
 stats: {
 booksCompleted: number;
 totalBooks: number;
 totalPages: number;
 sessions: number;
 highlights: number;
 };
 currentlyReading: {
 title: string;
 author: string;
 progress: number;
 } | null;
 recentBooks: { title: string; author: string; progress: number }[];
 generatedAt: string;
}

export const ShareReadingCard = memo(function ShareReadingCard() {
 const t = useTranslations('shareCard');
 const { toast } = useToast();
 const [card, setCard] = useState<ReadingCardData | null>(null);
 const [loading, setLoading] = useState(false);
 const [copied, setCopied] = useState(false);
 const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

 useEffect(() => { return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }; }, []);

 const generateCard = async () => {
 setLoading(true);
 try {
  const res = await api.get<ReadingCardData>('/api/share/reading-card');
  if (res.success && res.data) {
  setCard(res.data);
  }
 } catch (error) {
  warn('ReadingShareCard: generate failed', error);
  toast(t('failed_generate'), 'error');
 } finally {
  setLoading(false);
 }
 };

 const stats = card?.stats ?? { booksCompleted: 0, totalPages: 0, highlights: 0 };

 const shareText = card
 ? t('share_text_intro') + '\n'
  + t('share_text_stats', {
   books: stats.booksCompleted,
   pages: stats.totalPages,
   highlights: stats.highlights,
  }) + '\n'
  + (card.currentlyReading
  ? '\n' + t('share_text_reading', {
   title: card.currentlyReading.title,
   author: card.currentlyReading.author,
   progress: card.currentlyReading.progress,
   })
  : '')
 : '';

 const handleCopy = async () => {
 const ok = await copyToClipboard(shareText);
 if (ok) {
  setCopied(true);
  copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
 }
 };

 const handleNativeShare = async () => {
 if (navigator.share) {
  try {
  await navigator.share({
   title: t('share_title'),
   text: shareText,
  });
  } catch (err) {
  if (err instanceof Error && err.name !== 'AbortError') {
   warn('ReadingShareCard: share failed', err);
   toast(t('share_failed'), 'error');
  }
  }
 } else {
  handleCopy();
 }
 };

 return (
 <div className="space-y-4">
  {!card ? (
  <button type="button"
   onClick={generateCard}
   disabled={loading}
   className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50"
  >
   {loading ? t('generating') : t('button_generate')}
  </button>
  ) : (
  <div className="space-y-4">
   {/* Visual Card */}
   <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 p-6 shadow-lg max-w-md">
   <div className="flex items-center gap-2 mb-4">
    <span className="text-2xl">{'\uD83D\uDCDA'}</span>
    <div>
    <div className="font-bold text-gray-900 dark:text-gray-100">{t('reading_journey', { name: card.user.name })}</div>
    <div className="text-xs text-gray-500">{t('brand')}</div>
    </div>
   </div>

   {/* Stats grid */}
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
    <div className="text-center p-2 bg-surface-0/60 rounded-xl">
    <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.booksCompleted}</div>
    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t('books')}</div>
    </div>
    <div className="text-center p-2 bg-surface-0/60 rounded-xl">
    <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.totalPages}</div>
    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t('pages')}</div>
    </div>
    <div className="text-center p-2 bg-surface-0/60 rounded-xl">
    <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.highlights}</div>
    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{t('highlights_label')}</div>
    </div>
   </div>

   {/* Currently reading */}
   {card.currentlyReading && (
    <div className="bg-surface-0/70 rounded-xl p-3 mb-3">
    <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-1">{t('currently_reading')}</div>
    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{card.currentlyReading.title}</div>
    {isDisplayableAuthor(card.currentlyReading.author) && <div className="text-xs text-gray-500 mb-2">{card.currentlyReading.author}</div>}
    <div className="w-full bg-surface-2 rounded-full h-2">
     <div
     className="bg-amber-500 rounded-full h-2 transition-all duration-500"
     style={{ width: `${Math.min(100, Math.max(0, card.currentlyReading.progress))}%` }}
     />
    </div>
    <div className="text-[10px] text-gray-500 mt-1">{card.currentlyReading.progress}% {t('complete')}</div>
    </div>
   )}

   {/* Recent books */}
   {card.recentBooks && card.recentBooks.length > 1 && (
    <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-1">{t('recently_read')}</div>
   )}
   {card.recentBooks && card.recentBooks.slice(card.currentlyReading ? 1 : 0, 3).map((book) => (
    <div key={book.title} className="flex items-center gap-2 py-1">
    <div className="w-1 h-1 rounded-full bg-amber-400" />
    <span className="text-xs text-gray-600 truncate">{book.title}</span>
    <span className="text-[10px] text-gray-500 ml-auto">{book.progress}%</span>
    </div>
   ))}
   </div>

   {/* Share actions */}
   <div className="flex gap-2">
   <button type="button"
    onClick={handleNativeShare}
    className="btn btn-primary flex-1 text-sm focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    {t('share')}
   </button>
   <button type="button"
    onClick={handleCopy}
    className="btn flex-1 text-sm bg-surface-0 border border-surface-3 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    {copied ? t('copied') : t('copy_clipboard')}
   </button>
   </div>

   <button type="button"
   onClick={() => setCard(null)}
   className="text-xs text-gray-500 hover:text-gray-600"
   >
   {t('dismiss')}
   </button>
  </div>
  )}
 </div>
 );
});