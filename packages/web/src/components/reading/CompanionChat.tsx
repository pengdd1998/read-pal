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

// ── Constants ──
const BUBBLE_SIZE = 52;
const BUBBLE_MARGIN = 12;
const HEADER_HEIGHT = 56;
const DRAG_THRESHOLD = 5;
type Side = 'left' | 'right';

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

function loadSide(): Side {
  try {
    const v = localStorage.getItem('readpal-chat-side');
    if (v === 'left' || v === 'right') return v;
  } catch {}
  return 'right';
}

function loadY(): number {
  try {
    const v = localStorage.getItem('readpal-chat-y');
    if (v) return Math.max(HEADER_HEIGHT + BUBBLE_MARGIN, parseInt(v, 10) || 0);
  } catch {}
  return HEADER_HEIGHT + BUBBLE_MARGIN;
}

export function CompanionChat({ bookId, currentPage, totalPages, bookTitle, author, chapterContent }: CompanionChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Bubble: side + Y position
  const [side, setSide] = useState<Side>('right');
  const [bubbleY, setBubbleY] = useState(HEADER_HEIGHT + BUBBLE_MARGIN);
  const [hydrated, setHydrated] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Drag refs
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const dragStartPointer = useRef({ x: 0, y: 0 });
  const dragStartY = useRef(0);
  const dragStartSide = useRef<Side>('right');
  const totalMovement = useRef(0);

  // Hydrate from localStorage
  useEffect(() => {
    setSide(loadSide());
    setBubbleY(loadY());
    setHydrated(true);
  }, []);

  // Persist
  const persist = useCallback((s: Side, y: number) => {
    try {
      localStorage.setItem('readpal-chat-side', s);
      localStorage.setItem('readpal-chat-y', String(Math.round(y)));
    } catch {}
  }, []);

  // Clamp Y on resize
  useEffect(() => {
    const onResize = () => {
      setBubbleY((prev) => {
        const maxY = window.innerHeight - BUBBLE_SIZE - BUBBLE_MARGIN;
        return Math.max(HEADER_HEIGHT + BUBBLE_MARGIN, Math.min(maxY, prev));
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
    const userMsg: Message = { id: uid(), role: 'user', content: userMessage, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
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

  // ── Drag handlers (vertical drag only, snaps to left/right) ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isOpen) return;
    e.preventDefault();
    setIsDragging(true);
    totalMovement.current = 0;
    dragStartPointer.current = { x: e.clientX, y: e.clientY };
    dragStartY.current = bubbleY;
    dragStartSide.current = side;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isOpen, bubbleY, side]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaY = e.clientY - dragStartPointer.current.y;
    const deltaX = e.clientX - dragStartPointer.current.x;
    totalMovement.current = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Update Y position
    const vh = window.innerHeight;
    const newY = Math.max(HEADER_HEIGHT + BUBBLE_MARGIN, Math.min(vh - BUBBLE_SIZE - BUBBLE_MARGIN, dragStartY.current + deltaY));
    setBubbleY(newY);

    // Snap to left/right based on which half the pointer is in
    const newSide: Side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
    setSide(newSide);
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    // Persist final position
    setSide((s) => {
      setBubbleY((y) => {
        persist(s, y);
        return y;
      });
      return s;
    });

    // If barely moved, treat as click to open
    if (totalMovement.current < DRAG_THRESHOLD && !isOpen) {
      setIsOpen(true);
    }
  }, [isDragging, isOpen, persist]);

  if (!hydrated) return null;

  // ── Computed styles ──
  const bubbleLeft = side === 'right'
    ? window.innerWidth - BUBBLE_SIZE - BUBBLE_MARGIN
    : BUBBLE_MARGIN;

  const bubbleStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 40,
    left: bubbleLeft,
    top: bubbleY,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: 26,
    background: isOpen
      ? 'linear-gradient(135deg, #6b7280, #4b5563)'
      : 'linear-gradient(135deg, #14b8a6, #10b981)',
    opacity: isDragging ? 0.9 : 1,
    touchAction: 'none',
    transition: isDragging ? 'none' : 'left 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease, box-shadow 0.2s ease',
    transform: isDragging ? 'scale(1.08)' : 'scale(1)',
    cursor: isDragging ? 'grabbing' : 'grab',
    boxShadow: isDragging
      ? '0 8px 24px -4px rgb(0 0 0 / 0.2)'
      : '0 2px 8px -2px rgb(0 0 0 / 0.1)',
  };

  // Panel: slides from whichever edge the bubble is on
  const panelStyle: React.CSSProperties = side === 'left'
    ? { left: 0 }
    : { right: 0 };

  return (
    <>
      {/* Draggable Chat Bubble */}
      <button
        ref={bubbleRef}
        onPointerDown={isOpen ? undefined : handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={isOpen ? undefined : handlePointerUp}
        onClick={isOpen ? () => setIsOpen(false) : undefined}
        className="fixed z-40 select-none touch-none flex items-center justify-center"
        style={bubbleStyle}
        title={isOpen ? 'Close chat' : 'Chat with AI Companion'}
        aria-label={isOpen ? 'Close chat' : 'Chat with AI Companion'}
      >
        <span className="flex items-center justify-center w-full h-full text-white text-xl">
          {isOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          )}
        </span>
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`fixed top-0 h-full w-full md:w-96 bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col animate-slide-in-${side}`}
          style={panelStyle}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Reading Companion</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Your AI reading assistant</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !loading ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <div className="text-3xl mb-2">{'\uD83E\uDD16'}</div>
                <p className="text-sm">
                  Hi! I&apos;m your reading companion. Ask me anything about what you&apos;re reading!
                </p>
                <div className="mt-4 text-left space-y-2">
                  <p className="text-xs font-medium">Try asking:</p>
                  {[
                    'What are the main ideas in this chapter?',
                    'Explain the key concept here',
                    'Summarize what I just read',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="block w-full text-left text-xs p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
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
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-3">
                  <div className="flex space-x-1">
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
                className="btn btn-primary self-end"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
