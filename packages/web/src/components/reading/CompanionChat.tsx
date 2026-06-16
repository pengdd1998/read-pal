'use client';

import { useState, useEffect, useCallback, forwardRef, useMemo, memo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { preloadDOMPurify } from '@/lib/dompurify';
import { safeGetItem, safeSetItem } from '@/lib/safe-storage';
import { useToast } from '@/components/Toast';
import { generateId } from '@read-pal/shared';
import { ROLLBACK_EVENT, type RollbackDetail } from '@/hooks/useStreamingChat';
import {
 detectGenre,
 getGenreTemplate,
 getSocraticPrompts,
 type BookGenre,
} from '@/lib/companion-prompts';
import { extractCodeBlocks } from '@/lib/extract-code-blocks';
import { useCompanionPersona } from '@/hooks/useCompanionPersona';
import { useAiHealth } from '@/hooks/useAiHealth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useDraggable } from '@/hooks/useDraggable';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { ChatFabButton } from './ChatFabButton';
import { ChatOpenPanel } from './ChatOpenPanel';
import { useSanitizedMessages } from './useSanitizedMessages';
import { useCompanionEffects } from './useCompanionEffects';
import { useChatActions } from './useChatActions';

export interface CompanionChatHandle {
 openWithMessage: (message: string) => void;
}

interface CompanionChatProps {
 bookId: string;
 currentPage: number;
 totalPages?: number;
 bookTitle?: string;
 author?: string;
 chapterContent?: string;
 genreMetadata?: string[] | string;
 bookDescription?: string;
 externalIsOpen?: boolean;
 onOpenChange?: (open: boolean) => void;
 onReady?: (handle: CompanionChatHandle) => void;
}

const CompanionChatInner = forwardRef<CompanionChatHandle, CompanionChatProps>(function CompanionChat({
 bookId,
 currentPage,
 totalPages,
 bookTitle,
 author,
 chapterContent,
 genreMetadata,
 bookDescription,
 externalIsOpen,
 onOpenChange,
 onReady,
}, ref) {
 const { toast } = useToast();
 const t = useTranslations('reader');
 const tRef = useRef(t); tRef.current = t;
 const [internalOpen, setInternalOpen] = useState(false);
 const isOpen = externalIsOpen ?? internalOpen;
 const setIsOpen = useCallback((open: boolean) => {
  setInternalOpen(open);
  onOpenChange?.(open);
 }, [onOpenChange]);
 const [input, setInput] = useState('');
 const [isFirstChat] = useState(() => {
 if (typeof window === 'undefined') return false;
 return !safeGetItem('read-pal-chat-opened');
 });

 const {
 friendName,
 friendEmoji,
 friendPersonaKey,
 companionMode,
 setCompanionMode,
 } = useCompanionPersona();

 const aiHealthy = useAiHealth();

 // Detect genre for adaptive behavior
 const genre: BookGenre = useMemo(
 () => detectGenre(genreMetadata, bookTitle, bookDescription),
 [genreMetadata, bookTitle, bookDescription],
 );

 // Chat history (loads from API, resets on book change)
 const { messages, setMessages, hasMore, loadingMore, loadMore } = useChatHistory({
 isOpen,
 bookId,
 friendName,
 bookTitle,
 genre,
 toast,
 t: t as (key: string, params?: Record<string, string | number>) => string,
 });

 // --- Draggable floating button ---
 const {
 btnPos,
 isDragging,
 isSnapping,
 onDragStart,
 onDragMove,
 onDragEnd,
 wasDragRef,
 btnRef,
 snapTransition,
 dragRef,
 } = useDraggable({
 storageKey: 'read-pal-chat-btn-pos',
 btnSize: 56,
 edgeMargin: 20,
 headerMinY: 64,
 });

 // --- Streaming chat ---
 const createAssistantMessage = useCallback(() => generateId(), []);
 const {
 sendStreamMessage,
 regenerate,
 loading,
 connecting,
 stopStreaming,
 } = useStreamingChat({
 bookId,
 currentPage,
 totalPages,
 bookTitle,
 author,
 chapterContent,
 genreMetadata,
 bookDescription,
 companionMode,
 persona: friendPersonaKey,
 onMessagesUpdate: setMessages,
 createAssistantMessage,
 extractCodeBlocks,
 t: t as (key: string, params?: Record<string, unknown>) => string,
 // C3: surface the B3 fallback-used metadata event as a non-blocking
 // toast. Users seeing the response style change mid-message otherwise
 // misattribute it to a bug in their book / prompt — the disclosure lets
 // them attribute it correctly to a silent provider downgrade.
 onFallbackNotice: useCallback(() => {
 toast(t('companion_fallback_notice'), 'info', 6000);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []),
 });

 // Preload DOMPurify on mount
 const [purifyReady, setPurifyReady] = useState(false);
  useEffect(() => { preloadDOMPurify(() => setPurifyReady(true)); }, []);

 // Check if any message is currently streaming
 const hasStreamingMessage = messages.some((m) => m.streaming);

 // Memoize sanitized assistant messages
 const sanitizedMessages = useSanitizedMessages(messages, purifyReady);

 // Auto-open, imperative handle, pending message effects
 useCompanionEffects({
 ref,
 onReady,
 isFirstChat,
 bookId,
 bookTitle,
 friendName,
 genre,
 isOpen,
 loading,
 sendStreamMessage,
 setMessages,
 setInput,
 setIsOpen,
 t,
 });

 // Mark chat as opened when user manually opens it
 const handleOpenChat = useCallback(() => {
 safeSetItem('read-pal-chat-opened', 'true');
 setIsOpen(true);
 }, []);

 const handleClose = useCallback(() => setIsOpen(false), [setIsOpen]);

 // Listen for rollback events (stream failure / persist_failed): pre-fill
 // the input with the user's original text so they can retry with one
 // keystroke. Also re-open the panel in case it was closed.
 useEffect(() => {
 if (typeof window === 'undefined') return;
 const onRollback = (e: Event) => {
  const detail = (e as CustomEvent<RollbackDetail>).detail;
  if (detail?.text) {
  setInput(detail.text);
  setIsOpen(true);
  }
 };
 window.addEventListener(ROLLBACK_EVENT, onRollback);
 return () => window.removeEventListener(ROLLBACK_EVENT, onRollback);
 }, [setIsOpen]);

 // Action handlers
 const {
 toggleCompanionMode,
 handleSend,
 handleKeyPress,
 submitFeedback,
 } = useChatActions({
 bookId,
 companionMode,
 setCompanionMode,
 input,
 setInput,
 loading,
 sendStreamMessage,
 toast,
 t: t as (key: string, params?: Record<string, unknown>) => string,
 });

 const suggestedPrompts = useMemo(
 () => {
  const tp = tRef.current as (key: string, params?: Record<string, string | number>) => string;
  return companionMode === 'socratic'
  ? getSocraticPrompts(tp, bookTitle ?? '')
  : getGenreTemplate(genre).suggestedPrompts(tp, bookTitle ?? '');
 },
 [companionMode, genre, bookTitle],
 );

 return (
 <>
  {!isOpen && (
  <ChatFabButton
   btnRef={btnRef}
   wasDragRef={wasDragRef}
   btnPos={btnPos}
   isDragging={isDragging}
   isSnapping={isSnapping}
   snapTransition={snapTransition}
   onDragStart={onDragStart}
   onDragMove={onDragMove}
   onDragEnd={onDragEnd}
   dragRef={dragRef}
   onOpen={handleOpenChat}
   ariaLabel={t('companion_aria_chat_with', { name: friendName })}
  />
  )}

  {isOpen && (
  <ChatOpenPanel
   friendEmoji={friendEmoji}
   friendName={friendName}
   aiHealthy={aiHealthy}
   companionMode={companionMode}
   onToggleMode={toggleCompanionMode}
   onClose={handleClose}
   loading={loading}
   connecting={connecting}
   hasStreamingMessage={hasStreamingMessage}
   sanitizedMessages={sanitizedMessages}
   suggestedPrompts={suggestedPrompts}
   bookTitle={bookTitle}
   input={input}
   onInputChange={setInput}
   onKeyDown={handleKeyPress}
   onSend={handleSend}
   onStop={stopStreaming}
   onRegenerate={regenerate}
   hasMoreHistory={hasMore}
   loadingMoreHistory={loadingMore}
   onLoadMoreHistory={loadMore}
   submitFeedback={submitFeedback}
   t={t as (key: string, params?: Record<string, unknown>) => string}
  />
  )}
 </>
 );
});

export const CompanionChat = memo(CompanionChatInner);
