'use client';

import { memo, useState } from 'react';
import type { SanitizedMessage } from './ChatMessageList';

interface ChatMessageBubbleProps {
 msg: SanitizedMessage & { myRating?: boolean | null };
 t: (key: string, params?: Record<string, unknown>) => string;
 submitFeedback: (messageId: string, rating: boolean | null, onFail?: () => void) => void;
 onRegenerate: () => void;
 showRegenerate: boolean;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ msg, t, submitFeedback, onRegenerate, showRegenerate }: ChatMessageBubbleProps) {
 // Optimistic rating state: the clicked thumb FILLS and plays its gesture
 // (raise for 👍, jab for 👎); clicking it AGAIN cancels (toggle); rolls
 // back if the request fails. null = not rated.
 // History echo: messages restored from the DB carry the user's prior rating.
 const [myRating, setMyRating] = useState<boolean | null>(msg.myRating ?? null);
 const rate = (rating: boolean) => {
  const next = myRating === rating ? null : rating; // toggle-off on re-click
  setMyRating(next);
  submitFeedback(msg.id, next, () => setMyRating(myRating));
 };
 return (
 <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
  msg.role === 'user'
   ? 'bg-teal-600 text-white rounded-br-md'
   : 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 border border-amber-200/50 dark:border-amber-800/30 rounded-bl-md'
  }`}>
  {msg.role === 'assistant' ? (
   <>
   <div className="text-sm prose-sm prose-p:my-1 prose-pre:my-1">
    <div
    dangerouslySetInnerHTML={{ __html: msg.sanitized }}
    />
    {msg.streaming && (
    <span className="inline-block w-1.5 h-4 ml-0.5 bg-amber-600/60 dark:bg-amber-400/60 animate-pulse align-text-bottom" />
    )}
   </div>
   {!msg.streaming && (
    <div className="flex gap-1 mt-1.5">
    <button type="button"
     onClick={() => rate(true)}
     aria-pressed={myRating === true}
     className={`p-2.5 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
      myRating === true
       ? 'bg-green-500/10'
       : myRating === false
        ? 'text-amber-400/30'
        : 'text-amber-400/50 hover:text-green-500'
     }`}
     aria-label={t('companion_aria_helpful')}
    >
    {myRating === true ? (
     <svg aria-hidden="true" className="w-4 h-4 text-green-600 dark:text-green-400 thumb-raise" fill="currentColor" viewBox="0 0 24 24">
     <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z" />
     </svg>
    ) : (
     <svg aria-hidden="true" className={`w-3.5 h-3.5 ${myRating === false ? 'text-amber-400/30' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
     </svg>
    )}
    </button>
    <button type="button"
     onClick={() => rate(false)}
     aria-pressed={myRating === false}
     className={`p-2.5 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
      myRating === false
       ? 'bg-gray-500/10'
       : myRating === true
        ? 'text-amber-400/30'
        : 'text-amber-400/50 hover:text-red-500 dark:hover:text-red-400'
     }`}
     aria-label={t('companion_aria_unhelpful')}
    >
    {myRating === false ? (
     <svg aria-hidden="true" className="w-4 h-4 text-gray-800 dark:text-gray-100 thumb-jab" fill="currentColor" viewBox="0 0 24 24">
     <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
     </svg>
    ) : (
     <svg aria-hidden="true" className={`w-3.5 h-3.5 ${myRating === true ? 'text-amber-400/30' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
     </svg>
    )}
    </button>
    {showRegenerate && (
    <button type="button"
     onClick={onRegenerate}
     className="p-2.5 rounded text-amber-400/50 hover:text-amber-700 dark:hover:text-amber-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
     aria-label={t('companion_regenerate')}
     title={t('companion_regenerate')}
    >
     <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
     </svg>
    </button>
    )}
    </div>
   )}
   </>
  ) : (
   <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
  )}
  </div>
 </div>
 );
});
