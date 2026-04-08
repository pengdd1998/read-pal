'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/websocket';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function renderSimpleMarkdown(text: string): string {
  let html = text;
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-200 dark:bg-gray-900 rounded p-2 my-1 overflow-x-auto text-xs"><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-900 px-1 rounded text-xs">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br />');
  return html;
}

export const CompanionChat = forwardRef<CompanionChatHandle, CompanionChatProps>(function CompanionChat({ bookId, currentPage, totalPages, bookTitle, author, chapterContent }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [friendName, setFriendName] = useState<string>(DEFAULT_PERSONA.name);
  const [friendEmoji, setFriendEmoji] = useState<string>(DEFAULT_PERSONA.emoji);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);

  // Expose imperative handle so parent can open chat with a pre-filled message
  useImperativeHandle(ref, () => ({
    openWithMessage: (message: string) => {
      pendingMessageRef.current = message;
      setIsOpen(true);
    },
  }), []);

  // Auto-send pending message after chat opens
  useEffect(() => {
    if (isOpen && pendingMessageRef.current && !loading) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setInput(msg);
      // Use setTimeout to ensure input state is set before sending
      setTimeout(() => {
        setMessages((prev) => [...prev, { id: uid(), role: 'user', content: msg, timestamp: Date.now() }]);
        setLoading(true);
        api.post<{ content: string; agentsUsed: string[] }>('/api/agents/chat', {
          message: msg,
          context: { bookId, currentPage, totalPages: totalPages ?? 0, bookTitle: bookTitle ?? '', author: author ?? '', chapterContent: chapterContent ? chapterContent.replace(/<[^>]*>/g, '').slice(0, 3000) : '' },
        }).then((result) => {
          const raw = result as unknown as { success: boolean; content?: string };
          const assistantContent = raw.content ?? (result.data as { content?: string })?.content;
          setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: assistantContent || 'Sorry, I encountered an error. Please try again.', timestamp: Date.now() }]);
        }).catch(() => {
          setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: 'Failed to connect to the AI companion. Please check your connection.', timestamp: Date.now() }]);
        }).finally(() => setLoading(false));
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch friend persona from settings
  useEffect(() => {
    let cancelled = false;
    const loadPersona = async () => {
      try {
        const result = await api.get<{ friendPersona?: string }>('/api/settings');
        if (!cancelled && result.success && result.data) {
          const data = result.data as unknown as { friendPersona?: string };
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
  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);

  // Load history
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.get<Message[]>('/api/agents/history', { bookId, limit: 50 });
        if (!cancelled && result.success && result.data) {
          const raw = result.data as unknown as Message[];
          if (Array.isArray(raw) && raw.length > 0) {
            setMessages(raw.map((m) => ({ id: m.id || uid(), role: m.role, content: m.content, timestamp: m.timestamp || Date.now() })));
          }
        }
      } catch {} finally { if (!cancelled) setHistoryLoaded(true); }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, bookId, historyLoaded]);

  useEffect(() => { setHistoryLoaded(false); setMessages([]); }, [bookId]);

  // WebSocket streaming — connect only when chat is open, disconnect on close
  useEffect(() => {
    if (!isOpen) return;

    const token = localStorage.getItem('auth_token');
    if (token) wsClient.connect(token);

    const handler = (msg: { type: string; content?: string }) => {
      if (msg.type === 'token' && msg.content) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + msg.content! }];
          }
          return prev;
        });
      }
    };
    const unsub = wsClient.onMessage(handler);

    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, [isOpen]);

  // Send
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, { id: uid(), role: 'user', content: userMessage, timestamp: Date.now() }]);
    try {
      const result = await api.post<{ content: string; agentsUsed: string[] }>('/api/agents/chat', {
        message: userMessage,
        context: { bookId, currentPage, totalPages: totalPages ?? 0, bookTitle: bookTitle ?? '', author: author ?? '', chapterContent: chapterContent ? chapterContent.replace(/<[^>]*>/g, '').slice(0, 3000) : '' },
      });
      const raw = result as unknown as { success: boolean; content?: string };
      const assistantContent = raw.content ?? (result.data as { content?: string })?.content;
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: assistantContent || 'Sorry, I encountered an error. Please try again.', timestamp: Date.now() }]);
    } catch {
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: 'Failed to connect to the AI companion. Please check your connection.', timestamp: Date.now() }]);
    } finally { setLoading(false); }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* Fixed chat button — bottom-right, simple tap to open */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-xl"
          style={{
            background: 'linear-gradient(135deg, #14b8a6, #10b981)',
          }}
          aria-label="Open AI reading companion"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="fixed right-0 top-0 h-full w-full md:w-[400px] bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col animate-slide-in-right"
          >
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
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !loading ? (
                <div className="text-center text-amber-700/60 dark:text-amber-300/50 py-10">
                  <div className="text-3xl mb-3">{'\uD83D\uDCD6'}</div>
                  <p className="text-sm mb-4">Let&apos;s explore this book together!</p>
                  <div className="text-left space-y-2 max-w-xs mx-auto">
                    {[
                      "What's the author really saying here?",
                      'Help me connect this to the bigger picture',
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
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-teal-600 text-white rounded-br-md'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 border border-amber-200/50 dark:border-amber-800/30 rounded-bl-md'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div
                          className="text-sm prose-sm prose-p:my-1 prose-pre:my-1"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderSimpleMarkdown(msg.content)) }}
                        />
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
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="btn self-end shrink-0 bg-gradient-to-r from-amber-500 to-teal-500 text-white hover:from-amber-600 hover:to-teal-600 shadow-soft"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
});
