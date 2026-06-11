'use client';

import React, { useState, useCallback } from 'react';
import { Link } from '@/i18n/navigation';
import { isDisplayableAuthor } from '@/lib/book-cover';
import { BookCoverOverlay } from './BookCoverOverlay';
import { BookTagEditor } from './BookTagEditor';
import { BookProgressFooter } from './BookProgressFooter';

interface BookCardProps {
 id: string;
 title: string;
 author: string;
 coverUrl?: string;
 progress: number;
 status: 'unread' | 'reading' | 'completed';
 currentPage: number;
 totalPages: number;
 tags?: string[];
 lastReadAt?: Date | string;
 onDelete?: (id: string) => void;
 onTagsChange?: (id: string, tags: string[]) => void;
}

function BookCardInner({
 id,
 title,
 author,
 coverUrl,
 progress,
 status,
 currentPage,
 totalPages,
 tags = [],
 lastReadAt,
 onDelete,
 onTagsChange,
}: BookCardProps) {
 const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
 const [deleting, setDeleting] = useState(false);

 const handleShowDeleteConfirm = useCallback(() => {
 if (!showDeleteConfirm) {
  setShowDeleteConfirm(true);
 }
 }, [showDeleteConfirm]);

 const handleConfirmDelete = useCallback(() => {
 if (deleting) return;
 setDeleting(true);
 setShowDeleteConfirm(false);
 onDelete?.(id);
 }, [deleting, id, onDelete]);

 const handleCancelDelete = useCallback(() => {
 setShowDeleteConfirm(false);
 }, []);

 return (
 <Link href={`/read/${id}`} className="group">
  <div className="group hover:-translate-y-1 hover:shadow-lg transition-all duration-300 h-full flex flex-col rounded-2xl bg-surface-0 border border-surface-2 p-3 shadow-xs hover:ring-1 hover:ring-primary-300/50 overflow-hidden">
  {/* Cover with overlay actions */}
  <BookCoverOverlay
   bookId={id}
   title={title}
   coverUrl={coverUrl}
   status={status}
   deleting={deleting}
   onShowDeleteConfirm={handleShowDeleteConfirm}
   onDeleteCancel={handleCancelDelete}
   onDeleteConfirm={handleConfirmDelete}
   showDeleteConfirm={showDeleteConfirm}
  />

  {/* Title & Author */}
  <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
   {title}
  </h3>
  {isDisplayableAuthor(author) && <p className="text-xs text-gray-500 mb-2">{author}</p>}

  {/* Tags */}
  <BookTagEditor bookId={id} tags={tags} onTagsChange={onTagsChange} />

  {/* Progress */}
  <BookProgressFooter
   status={status}
   progress={progress}
   currentPage={currentPage}
   totalPages={totalPages}
   lastReadAt={lastReadAt}
  />
  </div>
 </Link>
 );
}

export const BookCard = React.memo(BookCardInner);
