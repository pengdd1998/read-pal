'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { api, API_BASE_URL } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { useToast } from '@/components/Toast';
import { renderSimpleMarkdown } from '@/lib/markdown';
import { consumeSSEStream } from '@/lib/sse';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { generateId } from '@read-pal/shared';
import { authFetch } from '@/lib/auth-fetch';
import {
  detectGenre,
  getGenreTemplate,
  getSocraticPrompts,
  shouldAutoOpen,
  type BookGenre,
} from '@/lib/companion-prompts';

/** Extract code blocks from raw HTML chapter content for technical context. */
function extractCodeBlocks(html: string, maxChars = 2000): string {
  if (!html) return '';
  const blocks: string[] = [];
  let totalChars = 0;
  const preRegex = /<pre[^>]*>(?:<code[^>]*?(?:class="language-(\w+)")?[^>]*>)?([\s\S]*?)(?:<\/code>)?<\/pre>/gi;
  let match;
  while ((match = preRegex.exec(html)) !== null && totalChars < maxChars) {
    const lang = match[1] || 'code';
    const code = match[2]
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
    if (code) {
      const block = `[${lang}]\n${code}`;
      if (totalChars + block.length <= maxChars) {
        blocks.push(block);
        totalChars += block.length;
      }
    }
  }
  return blocks.join('\n\n');
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
}

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
  genreMetadata?: string[];
  bookDescription?: string;
}

interface FriendPersona {
  name: string;
  emoji: string;
}

const FRIEND_PERSONAS: Record<string, FriendPersona> = {
  sage: { name: 'Sage', emoji: '\uD83E\uDD89' },
  penny: { name: 'Penny', emoji: '\u2B50' },
  alex: { name: 'Alex', emoji: '\uD83D\uDD0D' },
  quinn: { name: 'Quinn', emoji: '\uD83C\uDF0A' },
  sam: { name: 'Sam', emoji: '\uD83C\uDFAF' },
};

const DEFAULT_PERSONA: FriendPersona = { name: 'Penny', emoji: '\u2B50' };

export const CompanionChat = forwardRef<CompanionChatHandle, CompanionChatProps>(function CompanionChat({ bookId, currentPage, totalPages, bookTitle, author, chapterContent, genreMetadata, bookDescription }, ref) {
  const { toast } = useToast();
  const t = useTranslations('reader');
  const tc = useTranslations('common');
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isFirstChat] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('read-pal-chat-opened');
  });
  const [friendName, setFriendName] = useState<string>(DEFAULT_PERSONA.name);
  const [friendEmoji, setFriendEmoji] = useState<string>(DEFAULT_PERSONA.emoji);
  const [companionMode, setCompanionMode] = useState<'casual' | 'scholar' | 'socratic'>('casual');
  const [aiHealthy, setAiHealthy] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Detect genre for adaptive behavior
  const genre: BookGenre = detectGenre(genreMetadata, bookTitle, bookDescription);
  const genreTemplate = getGenreTemplate(genre);

  // Preload DOMPurify on mount
  useEffect(() => { preloadDOMPurify(); }, []);

  // Memoize sanitized assistant messages to avoid re-sanitizing on every render
  const sanitizedMessages = useMemo(() => {
    const cache = new Map<string, string>();
    return messages.map((msg) => {
      if (msg.role === 'assistant' && !cache.has(msg.id)) {
        cache.set(msg.id, purifySync(renderSimpleMarkdown(msg.content)));
      }
      return { ...msg, sanitized: cache.get(msg.id) || '' };
    });
  }, [messages]);
  const pendingMessageRef = useRef<string | null>(null);

  // Expose imperative handle so parent can open chat with a pre-filled message
  useImperativeHandle(ref, () => ({
    openWithMessage: (message: string) => {
      pendingMessageRef.current = message;
      setIsOpen(true);
    },
  }), []);

  // Auto-open chat for first-time readers after a brief delay (the "aha moment")
  // Genre-aware: auto-opens for non-fiction/technical/academic; stays closed for fiction
  // Skip if FeatureTour hasn't completed — avoid competing overlays on first visit
  useEffect(() => {
    if (!isFirstChat || !bookId) return;
    if (localStorage.getItem('read-pal-tour-complete') !== 'true') return;

    // Fiction: don't auto-open — it breaks immersion. Show tooltip hint instead.
    if (!shouldAutoOpen(genre)) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
      localStorage.setItem('read-pal-chat-opened', 'true');

      const greeting = genreTemplate.greeting(friendName, bookTitle);
      setMessages([{
        id: generateId(),
        role: 'assistant' as const,
        content: greeting,
        timestamp: Date.now(),
      }]);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isFirstChat, bookId, bookTitle, friendName, genre, genreTemplate]);

  // Mark chat as opened when user manually opens it
  const handleOpenChat = useCallback(() => {
    localStorage.setItem('read-pal-chat-opened', 'true');
    setIsOpen(true);
  }, []);

  // Helper to send a message via SSE streaming with automatic retry
  const sendStreamMessage = useCallback(async (msg: string, retryCount = 0) => {
    const assistantMsgId = generateId();
    const MAX_RETRIES = 2;

    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: 'user', content: msg, timestamp: Date.now() },
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true },
    ]);
    setLoading(true);
    setConnecting(true);

    const attemptStream = async (attempt: number): Promise<void> => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/agents/chat/stream`, {
          method: 'POST',
          body: JSON.stringify({
            book_id: bookId,
            message: msg,
            context: {
              bookId,
              currentPage,
              totalPages: totalPages ?? 0,
              bookTitle: bookTitle ?? '',
              author: author ?? '',
              chapterContent: chapterContent ? chapterContent.replace(/<[^>]*>/g, '').slice(0, 3000) : '',
              nearbyCode: extractCodeBlocks(chapterContent ?? ''),
              genres: genreMetadata,
              bookDescription,
              companionMode,
            },
          }),
        });

        if (!response.ok) {
          // Retry on 5xx or 429, not on 4xx client errors
          if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000;
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: t('companion_retrying', { seconds: delay / 1000 }) } : m));
            await new Promise((r) => setTimeout(r, delay));
            return attemptStream(attempt + 1);
          }
          let errorMsg = t('companion_server_error', { status: response.status });
          try { const errData = await response.json() as { error?: { message?: string } }; errorMsg = errData.error?.message || errorMsg; } catch { /* use default */ }
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: t('companion_error_prefix', { message: errorMsg }), streaming: false } : m));
          setLoading(false);
          setConnecting(false);
          return;
        }

        setConnecting(false);
        abortRef.current = consumeSSEStream(
          response,
          (tokenChunk: string) => {
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + tokenChunk } : m));
          },
          () => {
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, streaming: false, content: m.content || t('companion_no_response') } : m));
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
          (errMsg: string) => {
            // Retry on stream errors
            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: t('companion_connection_lost', { seconds: delay / 1000 }) } : m));
              setTimeout(() => attemptStream(attempt + 1), delay);
              return;
            }
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content || t('companion_stream_failed', { message: errMsg }), streaming: false } : m));
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
        );
      } catch {
        // Network error — retry with backoff
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: t('companion_network_error', { seconds: delay / 1000 }) } : m));
          await new Promise((r) => setTimeout(r, delay));
          return attemptStream(attempt + 1);
        }
        setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: t('companion_connect_failed'), streaming: false } : m));
        setLoading(false);
        setConnecting(false);
      }
    };

    await attemptStream(retryCount);
  }, [bookId, currentPage, totalPages, bookTitle, author, chapterContent]);

  // Auto-send pending message after chat opens
  useEffect(() => {
    if (isOpen && pendingMessageRef.current && !loading) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setInput(msg);
      const timer = setTimeout(() => sendStreamMessage(msg), 100);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sendStreamMessage]);

  // Fetch friend persona and companion mode from settings
  useEffect(() => {
    let cancelled = false;
    const loadPersona = async () => {
      try {
        const result = await api.get<{ friendPersona?: string; companionMode?: string }>('/api/settings');
        if (!cancelled && result.success && result.data) {
          const data = result.data;
          const persona = FRIEND_PERSONAS[data.friendPersona ?? ''] ?? DEFAULT_PERSONA;
          setFriendName(persona.name);
          setFriendEmoji(persona.emoji);
          if (data.companionMode === 'scholar' || data.companionMode === 'casual' || data.companionMode === 'socratic') {
            setCompanionMode(data.companionMode);
          }
        }
      } catch {
        // Keep defaults on error
      }
    };
    loadPersona();
    return () => { cancelled = true; };
  }, []);

  // Check AI health
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/agent/health`);
        if (!cancelled && res.ok) {
          const data = await res.json() as { healthy?: boolean };
          setAiHealthy(data.healthy === true);
        }
      } catch {
        if (!cancelled) setAiHealthy(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // re-check every 60s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, loading, connecting, scrollToBottom]);

  // Load history
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    let cancelled = false;
    let greetTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const result = await api.get<Message[]>('/api/agents/history', { bookId, limit: 50 });
        if (!cancelled && result.success && result.data) {
          const raw = result.data;
          if (Array.isArray(raw) && raw.length > 0) {
            const history = raw.map((m) => ({ id: m.id || generateId(), role: m.role, content: m.content, timestamp: m.timestamp || Date.now() }));
            setMessages(history);

            // Add a contextual greeting after loading history
            const lastMsg = history[history.length - 1];
            const isReturning = lastMsg && (Date.now() - lastMsg.timestamp > 30 * 60 * 1000); // 30 min gap
            if (isReturning && lastMsg?.role === 'user') {
              const greeting = genreTemplate.returnGreeting(friendName, bookTitle);
              greetTimer = setTimeout(() => {
                if (!cancelled) {
                  setMessages((prev) => [...prev, {
                    id: generateId(),
                    role: 'assistant' as const,
                    content: greeting,
                    timestamp: Date.now(),
                  }]);
                }
              }, 800);
            }
          }
        }
      } catch { toast(t('companion_history_load_error'), 'error'); } finally { if (!cancelled) setHistoryLoaded(true); }
    };
    load();
    return () => {
      cancelled = true;
      if (greetTimer) clearTimeout(greetTimer);
    };
  }, [isOpen, bookId, historyLoaded, toast]);

  useEffect(() => { setHistoryLoaded(false); setMessages([]); }, [bookId]);

  // Abort stream on unmount
  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
    setLoading(false);
    setConnecting(false);
  }, []);

  const toggleCompanionMode = useCallback(() => {
    const modes: Array<'casual' | 'scholar' | 'socratic'> = ['casual', 'scholar', 'socratic'];
    const idx = modes.indexOf(companionMode);
    const newMode = modes[(idx + 1) % modes.length];
    setCompanionMode(newMode);
    api.patch('/api/settings', { companionMode: newMode }).catch(() => {
      setCompanionMode(companionMode);
    });
  }, [companionMode]);

  // Send
  const handleSend = () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    analytics.track('ai_chat_sent');
    sendStreamMessage(msg);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const submitFeedback = useCallback(async (messageId: string, rating: boolean) => {
    try {
      await api.post('/api/v1/agent/feedback', {
        book_id: bookId,
        message_id: messageId,
        rating,
      });
    } catch {
      // Silent fail for feedback
    }
  }, [bookId]);

  return (
    <>
      {/* Fixed chat button — bottom-right, labeled and discoverable for first-time users */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-10 flex flex-col items-end gap-2">
          {/* First-time tooltip */}
          {isFirstChat && (
            <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 animate-fade-in max-w-[200px]">
              {genre === 'fiction'
                ? t('companion_tooltip_fiction', { name: friendName })
                : t('companion_tooltip_general', { name: friendName })}
            </div>
          )}
          <button
            id="tour-ai-companion"
            onClick={handleOpenChat}
            className="flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-xl relative"
            style={{
              background: 'linear-gradient(135deg, #14b8a6, #10b981)',
            }}
            aria-label={t('companion_aria_chat_with', { name: friendName })}
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <>
          {/* Backdrop — click to close on all screen sizes */}
          <div
            className="fixed inset-0 z-30 bg-black/10"
            onClick={() => setIsOpen(false)}
          />

          {/* Mobile: bottom sheet (55vh) — Desktop: full-height sidebar (400px) */}
          <div
            className="fixed right-0 bottom-0 h-[55vh] w-full md:top-0 md:bottom-0 md:h-full md:w-[400px] bg-white dark:bg-gray-800 shadow-2xl z-40 flex flex-col rounded-t-2xl md:rounded-none animate-slide-in-up md:animate-slide-in-right overscroll-contain"
          >
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
              <div className="flex items-center gap-2.5">
                <div className="relative w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-teal-500 text-sm shrink-0">
                  {friendEmoji}
                  {aiHealthy === false && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white dark:border-gray-800" title={t('companion_ai_slow')} />
                  )}
                  {aiHealthy === true && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white dark:border-gray-800" title={t('companion_ai_healthy')} />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">{friendName}</h3>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/60">{t('companion_your_reading_companion')}</p>
                </div>
              </div>
              <button
                onClick={toggleCompanionMode}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  companionMode === 'socratic'
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                    : companionMode === 'scholar'
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={companionMode === 'socratic' ? t('companion_mode_socratic_title') : companionMode === 'scholar' ? t('companion_mode_scholar_title') : t('companion_mode_casual_title')}
                aria-label={t('companion_aria_switch_mode', { mode: companionMode })}
              >
                {companionMode === 'socratic' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ) : companionMode === 'scholar' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label={t('companion_aria_close')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div ref={chatContainerRef} role="log" aria-label={t('companion_aria_messages')} aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !loading ? (
                <div className="text-center text-amber-700/60 dark:text-amber-300/50 py-10">
                  <div className="text-3xl mb-3">{friendEmoji}</div>
                  <p className="text-sm mb-1 font-medium text-amber-800 dark:text-amber-200">
                    {bookTitle ? `${friendName} on "${bookTitle}"` : `Chat with ${friendName}`}
                  </p>
                  <p className="text-xs text-amber-600/60 dark:text-amber-400/40 mb-4">
                    {t('companion_ask_anything')}
                  </p>
                  <div className="text-left space-y-2 max-w-xs mx-auto">
                    {(companionMode === 'socratic' ? getSocraticPrompts(bookTitle) : genreTemplate.suggestedPrompts(bookTitle)).map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="block w-full text-left text-xs p-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200/50 dark:border-amber-800/30 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                sanitizedMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                                className="p-1 rounded text-amber-400/50 hover:text-green-500 transition-colors"
                                aria-label={t('companion_aria_helpful')}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                </svg>
                              </button>
                              <button
                                onClick={() => submitFeedback(msg.id, false)}
                                className="p-1 rounded text-amber-400/50 hover:text-red-500 transition-colors"
                                aria-label={t('companion_aria_unhelpful')}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                      <div className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-bounce" style={{ animationDelay: '120ms', animationDuration: '0.6s' }} />
                      <div className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-bounce" style={{ animationDelay: '240ms', animationDuration: '0.6s' }} />
                      <span className="text-[10px] text-amber-500/80 ml-1">{t('companion_thinking')}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-amber-200/50 dark:border-amber-900/30">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={t('companion_placeholder')}
                  aria-label={t('companion_aria_message')}
                  className="flex-1 resize-none rounded-xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                  rows={2}
                  disabled={loading}
                />
                {loading ? (
                  <button
                    onClick={stopStreaming}
                    className="self-end shrink-0 px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                  >
                    {t('companion_stop')}
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    aria-label={t('companion_aria_send')}
                    className="btn self-end shrink-0 bg-gradient-to-r from-amber-500 to-teal-500 text-white hover:from-amber-600 hover:to-teal-600 shadow-soft disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
});
