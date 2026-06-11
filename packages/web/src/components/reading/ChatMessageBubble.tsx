'use client';

import { memo } from 'react';
import type { SanitizedMessage } from './ChatMessageList';

interface ChatMessageBubbleProps {
 msg: SanitizedMessage;
 t: (key: string, params?: Record<string, unknown>) => string;
 submitFeedback: (messageId: string, rating: boolean) => void;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ msg, t, submitFeedback }: ChatMessageBubbleProps) {
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
    <button
     onClick={() => submitFeedback(msg.id, true)}
     className="p-2.5 rounded text-amber-400/50 hover:text-green-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
     aria-label={t('companion_aria_helpful')}
    >
     <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
     </svg>
    </button>
    <button
     onClick={() => submitFeedback(msg.id, false)}
     className="p-2.5 rounded text-amber-400/50 hover:text-red-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
     aria-label={t('companion_aria_unhelpful')}
    >
     <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
     </svg>
    </button>
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
