'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/websocket';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface CompanionChatProps {
  bookId: string;
  currentPage: number;
  totalPages?: number;
  bookTitle?: string;
  author?: string;
  chapterContent?: string;
}

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

export function CompanionChat({ bookId, currentPage, totalPages, bookTitle, author, chapterContent }: CompanionChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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

  // WebSocket streaming
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) wsClient.connect(token);
  }, []);

  useEffect(() => {
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
    return unsub;
  }, []);

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
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-sm">Reading Companion</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ask about what you&apos;re reading</p>
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
                <div className="text-center text-gray-500 dark:text-gray-400 py-10">
                  <div className="text-3xl mb-3">{'\uD83E\uDD16'}</div>
                  <p className="text-sm mb-4">Ask me anything about what you&apos;re reading!</p>
                  <div className="text-left space-y-2 max-w-xs mx-auto">
                    {[
                      'What are the main ideas in this chapter?',
                      'Explain the key concept here',
                      'Summarize what I just read',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="block w-full text-left text-xs p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
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
                        ? 'bg-primary-600 text-white rounded-br-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
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
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask about what you're reading..."
                  className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={2}
                  disabled={loading}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="btn btn-primary self-end shrink-0"
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
}
