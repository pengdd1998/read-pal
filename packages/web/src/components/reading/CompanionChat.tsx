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

type Edge = 'top' | 'bottom' | 'left' | 'right';

interface BubblePosition {
  edge: Edge;
  offset: number; // distance along the edge (e.g., from left for top/bottom, or from top for left/right)
  crossOffset: number; // distance from edge into viewport
}

const STORAGE_KEY = 'readpal-chat-bubble-pos';
const DRAG_THRESHOLD = 4;
const BUBBLE_SIZE = 56;
const SLIM_WIDTH = 6;
const EDGE_MARGIN = 4;
const SAVE_DEBOUNCE = 300;
const SNAP_MARGIN = 40; // snap to edge when within this many pixels

function defaultPosition(): BubblePosition {
  const y = typeof window === 'undefined' ? 200 : Math.max(EDGE_MARGIN, (window.innerHeight - BUBBLE_SIZE) / 2);
  return { edge: 'right', offset: Math.round(y), crossOffset: EDGE_MARGIN };
}

function loadPosition(): BubblePosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (['top', 'bottom', 'left', 'right'].includes(parsed.edge)) {
        return {
          edge: parsed.edge,
          offset: Math.max(EDGE_MARGIN, parsed.offset || 0),
          crossOffset: Math.max(EDGE_MARGIN, parsed.crossOffset || EDGE_MARGIN),
        };
      }
    }
  } catch {
    // Ignore
  }
  return defaultPosition();
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

/** Compute absolute x,y position from the BubblePosition. */
function posToXY(pos: BubblePosition, vw: number, vh: number): { x: number; y: number } {
  switch (pos.edge) {
    case 'right': return { x: vw - pos.crossOffset - BUBBLE_SIZE, y: pos.offset };
    case 'left':  return { x: pos.crossOffset, y: pos.offset };
    case 'top':   return { x: pos.offset, y: pos.crossOffset };
    case 'bottom':return { x: pos.offset, y: vh - pos.crossOffset - BUBBLE_SIZE };
  }
}

/** Snap an absolute x,y to the nearest edge. */
function snapToEdge(x: number, y: number, vw: number, vh: number): BubblePosition {
  const distRight = vw - x - BUBBLE_SIZE;
  const distLeft = x;
  const distTop = y;
  const distBottom = vh - y - BUBBLE_SIZE;

  const minDist = Math.min(distRight, distLeft, distTop, distBottom);

  if (minDist === distRight) {
    return { edge: 'right', offset: Math.round(y), crossOffset: EDGE_MARGIN };
  } else if (minDist === distLeft) {
    return { edge: 'left', offset: Math.round(y), crossOffset: EDGE_MARGIN };
  } else if (minDist === distTop) {
    return { edge: 'top', offset: Math.round(x), crossOffset: EDGE_MARGIN };
  } else {
    return { edge: 'bottom', offset: Math.round(x), crossOffset: EDGE_MARGIN };
  }
}

export function CompanionChat({ bookId, currentPage, totalPages, bookTitle, author, chapterContent }: CompanionChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Bubble position
  const [position, setPosition] = useState<BubblePosition>(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isSlim, setIsSlim] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Drag refs
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartXY = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const totalMovement = useRef(0);
  const isDraggingRef = useRef(false);
  const slimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    setPosition(loadPosition());
    setHydrated(true);
  }, []);

  // Slim bar timer — collapse bubble after inactivity
  useEffect(() => {
    if (isOpen || isDragging) {
      if (slimTimerRef.current !== null) {
        clearTimeout(slimTimerRef.current);
        slimTimerRef.current = null;
      }
      setIsSlim(false);
      return;
    }

    slimTimerRef.current = setTimeout(() => setIsSlim(true), 2000);
    return () => {
      if (slimTimerRef.current) clearTimeout(slimTimerRef.current);
    };
  }, [isOpen, isDragging]);

  // Persist position
  const persistPosition = useCallback((pos: BubblePosition) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
    }, SAVE_DEBOUNCE);
  }, []);

  // Clamp on resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let next = { ...prev };
        // Clamp offset based on edge
        if (prev.edge === 'left' || prev.edge === 'right') {
          next.offset = Math.max(EDGE_MARGIN, Math.min(vh - BUBBLE_SIZE - EDGE_MARGIN, prev.offset));
        } else {
          next.offset = Math.max(EDGE_MARGIN, Math.min(vw - BUBBLE_SIZE - EDGE_MARGIN, prev.offset));
        }
        persistPosition(next);
        return next;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [persistPosition]);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);

  // Load history
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    let cancelled = false;
    const loadHistory = async () => {
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
    loadHistory();
    return () => { cancelled = true; };
  }, [isOpen, bookId, historyLoaded]);

  useEffect(() => { setHistoryLoaded(false); setMessages([]); }, [bookId]);

  // WebSocket
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

  // Send message
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

  // --- Drag handlers ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isOpen) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    totalMovement.current = 0;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    dragStartXY.current = posToXY(position, vw, vh);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isOpen, position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - dragStartX.current;
    const deltaY = e.clientY - dragStartY.current;
    totalMovement.current = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rawX = Math.max(0, Math.min(vw - BUBBLE_SIZE, dragStartXY.current.x + deltaX));
    const rawY = Math.max(0, Math.min(vh - BUBBLE_SIZE, dragStartXY.current.y + deltaY));

    // Snap to nearest edge
    const snapped = snapToEdge(rawX, rawY, vw, vh);
    setPosition(snapped);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    setPosition((prev) => {
      persistPosition(prev);
      return prev;
    });
    if (totalMovement.current < DRAG_THRESHOLD && !isOpen) {
      setIsOpen(true);
    }
  }, [isOpen, persistPosition]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (slimTimerRef.current) clearTimeout(slimTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // --- Compute bubble inline styles ---
  const showSlim = isSlim && !isDragging && !isOpen;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  let bubbleLeft: number;
  let bubbleTop: number;
  if (hydrated) {
    const xy = posToXY(position, vw, vh);
    bubbleLeft = xy.x;
    bubbleTop = xy.y;
  } else {
    bubbleLeft = vw - EDGE_MARGIN - BUBBLE_SIZE;
    bubbleTop = Math.max(EDGE_MARGIN, (vh - BUBBLE_SIZE) / 2);
  }

  const bubbleStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 40,
    left: bubbleLeft,
    top: bubbleTop,
    width: showSlim ? SLIM_WIDTH : BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: showSlim ? 3 : 28,
    background: isOpen
      ? 'linear-gradient(135deg, #6b7280, #4b5563)'
      : 'linear-gradient(135deg, #14b8a6, #10b981)',
    opacity: isDragging ? 0.85 : showSlim ? 0.7 : 1,
    touchAction: 'none',
    transition: isDragging
      ? 'none'
      : 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
    transform: isDragging ? 'scale(1.1)' : 'scale(1)',
    cursor: isDragging ? 'grabbing' : 'grab',
    boxShadow: isDragging
      ? '0 8px 24px -4px rgb(0 0 0 / 0.2)'
      : '0 2px 8px -2px rgb(0 0 0 / 0.08)',
    overflow: 'hidden',
  };

  // Panel positioning — slides in from whichever edge the bubble is on
  const panelStyle: React.CSSProperties = position.edge === 'left'
    ? { left: 0 }
    : position.edge === 'right'
      ? { right: 0 }
      : position.edge === 'top'
        ? { top: 0, left: Math.max(0, bubbleLeft - 340), right: 0 }
        : { bottom: 0, left: Math.max(0, bubbleLeft - 340), right: 0 };

  const panelSlideClass = position.edge === 'left'
    ? 'animate-slide-in-left'
    : 'animate-slide-in-right';

  if (!hydrated) return null;

  return (
    <>
      {/* Draggable Chat Bubble */}
      <button
        ref={bubbleRef}
        onPointerDown={isOpen ? undefined : handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={isOpen ? undefined : handlePointerUp}
        onClick={isOpen ? () => setIsOpen(false) : showSlim ? () => { setIsSlim(false); setIsOpen(true); } : undefined}
        className="fixed z-40 select-none touch-none"
        style={bubbleStyle}
        title={isOpen ? 'Close chat' : 'Chat with AI Companion'}
        aria-label={isOpen ? 'Close chat' : 'Chat with AI Companion'}
      >
        {!showSlim && (
          <span className="flex items-center justify-center w-full h-full text-white text-xl">
            {isOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            )}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`fixed top-0 h-full w-full md:w-96 md:top-16 md:h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col ${panelSlideClass}`}
          style={panelStyle}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Reading Companion</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Your AI reading assistant</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !loading ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <div className="text-4xl mb-2">{'\uD83E\uDD16'}</div>
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
                      className="block w-full text-left text-xs p-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${
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
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about what you're reading..."
                className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
