'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { api, API_BASE_URL } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { renderSimpleMarkdown } from '@/lib/markdown';
import { consumeSSEStream } from '@/lib/sse';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { generateId } from '@read-pal/shared';
import { authFetch } from '@/lib/auth-fetch';

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

export const CompanionChat = forwardRef<CompanionChatHandle, CompanionChatProps>(function CompanionChat({ bookId, currentPage, totalPages, bookTitle, author, chapterContent }, ref) {
  const { toast } = useToast();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    if (!isFirstChat || !bookId) return;
    const timer = setTimeout(() => {
      setIsOpen(true);
      localStorage.setItem('read-pal-chat-opened', 'true');
    }, 2500);
    return () => clearTimeout(timer);
  }, [isFirstChat, bookId]);

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
            message: msg,
            context: {
              bookId,
              currentPage,
              totalPages: totalPages ?? 0,
              bookTitle: bookTitle ?? '',
              author: author ?? '',
              chapterContent: chapterContent ? chapterContent.replace(/<[^>]*>/g, '').slice(0, 3000) : '',
            },
          }),
        });

        if (!response.ok) {
          // Retry on 5xx or 429, not on 4xx client errors
          if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000;
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `Retrying in ${delay / 1000}s...` } : m));
            await new Promise((r) => setTimeout(r, delay));
            return attemptStream(attempt + 1);
          }
          let errorMsg = `Server error (${response.status})`;
          try { const errData = await response.json() as { error?: { message?: string } }; errorMsg = errData.error?.message || errorMsg; } catch { /* use default */ }
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `Error: ${errorMsg}`, streaming: false } : m));
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
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, streaming: false, content: m.content || "Sorry, I couldn't generate a response." } : m));
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
          (errMsg: string) => {
            // Retry on stream errors
            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `Connection lost. Retrying in ${delay / 1000}s...` } : m));
              setTimeout(() => attemptStream(attempt + 1), delay);
              return;
            }
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content || `Failed: ${errMsg}`, streaming: false } : m));
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
        );
      } catch {
        // Network error — retry with backoff
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `Network error. Retrying in ${delay / 1000}s...` } : m));
          await new Promise((r) => setTimeout(r, delay));
          return attemptStream(attempt + 1);
        }
        setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: 'Failed to connect to the AI companion. Please check your connection and try again.', streaming: false } : m));
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

  // Fetch friend persona from settings
  useEffect(() => {
    let cancelled = false;
    const loadPersona = async () => {
      try {
        const result = await api.get<{ friendPersona?: string }>('/api/settings');
        if (!cancelled && result.success && result.data) {
          const data = result.data;
          const persona = FRIEND_PERSONAS[data.friendPersona ?? ''] ?? DEFAULT_PERSONA;
          setFriendName(persona.name);
          setFriendEmoji(persona.emoji);
        }
      } catch {
        // Keep defaults on error
      }
    };
    loadPersona();
    return () => { cancelled = true; };
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
            if (isReturning && lastMsg.role === 'user') {
              const greetings = [
                "Welcome back! Ready to pick up where we left off?",
                "Hey! Good to see you again. Let's continue.",
                "You're back! I was thinking about our last discussion...",
              ];
              greetTimer = setTimeout(() => {
                if (!cancelled) {
                  setMessages((prev) => [...prev, {
                    id: generateId(),
                    role: 'assistant' as const,
                    content: greetings[Math.floor(Math.random() * greetings.length)],
                    timestamp: Date.now(),
                  }]);
                }
              }, 800);
            }
          }
        }
      } catch { toast('Failed to load chat history', 'error'); } finally { if (!cancelled) setHistoryLoaded(true); }
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

  // Send
  const handleSend = () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    sendStreamMessage(msg);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* Fixed chat button — bottom-right, labeled and discoverable for first-time users */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          {/* First-time tooltip */}
          {isFirstChat && (
            <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 animate-fade-in max-w-[180px]">
              Chat with {friendName} about what you&apos;re reading
            </div>
          )}
          <button
            onClick={handleOpenChat}
            className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-xl relative ${
              isFirstChat ? 'animate-pulse' : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, #14b8a6, #10b981)',
            }}
            aria-label={`Chat with ${friendName}, your reading companion`}
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
          {/* Mobile: semi-transparent backdrop covering top portion */}
          <div
            className="fixed inset-0 z-40 md:hidden bg-black/10"
            onClick={() => setIsOpen(false)}
          />

          {/* Mobile: bottom sheet (55vh) — Desktop: full-height sidebar (400px) */}
          <div
            className="fixed right-0 bottom-0 h-[55vh] w-full md:top-0 md:bottom-0 md:h-full md:w-[400px] bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col rounded-t-2xl md:rounded-none animate-slide-in-up md:animate-slide-in-right overscroll-contain"
          >
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-teal-500 text-sm shrink-0">
                  {friendEmoji}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">{friendName}</h3>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/60">Your reading companion</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div ref={chatContainerRef} role="log" aria-label="Chat messages" aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !loading ? (
                <div className="text-center text-amber-700/60 dark:text-amber-300/50 py-10">
                  <div className="text-3xl mb-3">{friendEmoji}</div>
                  <p className="text-sm mb-1 font-medium text-amber-800 dark:text-amber-200">
                    {bookTitle ? `${friendName} on "${bookTitle}"` : `Chat with ${friendName}`}
                  </p>
                  <p className="text-xs text-amber-600/60 dark:text-amber-400/40 mb-4">
                    Ask anything about what you&apos;re reading
                  </p>
                  <div className="text-left space-y-2 max-w-xs mx-auto">
                    {[
                      "What's the main idea of this chapter?",
                      'Help me understand this passage better',
                      'What should I pay attention to next?',
                    ].map((q) => (
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
                        <div className="text-sm prose-sm prose-p:my-1 prose-pre:my-1">
                          <div
                            dangerouslySetInnerHTML={{ __html: msg.sanitized }}
                          />
                          {msg.streaming && (
                            <span className="inline-block w-1.5 h-4 ml-0.5 bg-amber-600/60 dark:bg-amber-400/60 animate-pulse align-text-bottom" />
                          )}
                        </div>
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
                      <span className="text-[10px] text-amber-500/80 ml-1">Thinking...</span>
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
                  placeholder="Ask about what you're reading..."
                  className="flex-1 resize-none rounded-xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                  rows={2}
                  disabled={loading}
                />
                {loading ? (
                  <button
                    onClick={stopStreaming}
                    className="self-end shrink-0 px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
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
