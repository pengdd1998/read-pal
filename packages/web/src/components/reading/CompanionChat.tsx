'use client';

import { useState, useEffect, useCallback, forwardRef, useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import { preloadDOMPurify } from '@/lib/dompurify';
import { safeGetItem, safeSetItem } from '@/lib/safe-storage';
import { useToast } from '@/components/Toast';
import { generateId } from '@read-pal/shared';
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
 const { messages, setMessages } = useChatHistory({
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
  const tp = t as (key: string, params?: Record<string, string | number>) => string;
  return companionMode === 'socratic'
  ? getSocraticPrompts(tp, bookTitle ?? '')
  : getGenreTemplate(genre).suggestedPrompts(tp, bookTitle ?? '');
 },
 [companionMode, genre, bookTitle, t],
 );

 return (
 <>
  {!isOpen && (
  <ChatFabButton
   btnRef={btnRef}
   friendName={friendName}
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
   submitFeedback={submitFeedback}
   t={t as (key: string, params?: Record<string, unknown>) => string}
  />
  )}
 </>
 );
});

export const CompanionChat = memo(CompanionChatInner);
