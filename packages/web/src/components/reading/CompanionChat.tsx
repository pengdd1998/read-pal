'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
}

/** Generate a simple unique id for messages. */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Very small markdown-ish renderer so we do not pull in a heavy dep.
 * Handles: **bold**, *italic*, `code`, ```code blocks```, and line breaks.
 */
function renderSimpleMarkdown(text: string): string {
  let html = text;

  // Code blocks (``` ... ```)
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-200 dark:bg-gray-900 rounded p-2 my-1 overflow-x-auto text-xs"><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-900 px-1 rounded text-xs">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Line breaks
  html = html.replace(/\n/g, '<br />');

  return html;
}

export function CompanionChat({ bookId, currentPage }: CompanionChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // Load chat history when the panel is opened
  useEffect(() => {
    if (!isOpen || historyLoaded) return;

    let cancelled = false;
    const loadHistory = async () => {
      try {
        const result = await api.get<Message[]>('/api/agents/history', {
          bookId,
          limit: 50,
        });
        if (!cancelled && result.success && result.data) {
          const raw = result.data as unknown as Message[];
          if (Array.isArray(raw) && raw.length > 0) {
            setMessages(
              raw.map((m: Message) => ({
                id: m.id || uid(),
                role: m.role,
                content: m.content,
                timestamp: m.timestamp || Date.now(),
              })),
            );
          }
        }
      } catch {
        // Silently fail -- user can still send new messages
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    };
    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [isOpen, bookId, historyLoaded]);

  // Reset history flag when book changes
  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([]);
  }, [bookId]);

  // WebSocket connection for real-time agent streaming
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) wsClient.connect(token);
  }, []);

  // Listen for WebSocket token events (real-time streaming)
  useEffect(() => {
    const handler = (msg: { type: string; content?: string; done?: boolean }) => {
      if (msg.type === 'token' && msg.content) {
        // Append streaming tokens to the last assistant message
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + msg.content },
            ];
          }
          return prev;
        });
      }
    };

    const unsubscribe = wsClient.onMessage(handler);
    return unsubscribe;
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await api.post<{ content: string; agentsUsed: string[] }>(
        '/api/agents/chat',
        {
          message: userMessage,
          context: {
            bookId,
            currentPage,
          },
        },
      );

      const raw = result as unknown as {
        success: boolean;
        content?: string;
        agentsUsed?: string[];
      };
      const assistantContent = raw.content ?? (result.data as { content?: string })?.content;

      const assistantMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: assistantContent || 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: 'Failed to connect to the AI companion. Please check your connection.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 md:left-auto md:bottom-6 md:right-6 z-40 bg-primary-600 text-white p-4 rounded-full shadow-lg hover:bg-primary-700 transition-colors"
        title="Chat with AI Companion"
      >
        {isOpen ? '\u2715' : '\uD83D\uDCAC'}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-full md:w-96 md:top-16 md:h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Reading Companion</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your AI reading assistant
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {'\u2715'}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.length === 0 && !loading ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <div className="text-4xl mb-2">{'\uD83E\uDD16'}</div>
                <p className="text-sm">
                  Hi! I&apos;m your reading companion. Ask me anything about what
                  you&apos;re reading!
                </p>
                <div className="mt-4 text-left space-y-2">
                  <p className="text-xs font-medium">Try asking:</p>
                  <button
                    onClick={() =>
                      setInput('What are the main ideas in this chapter?')
                    }
                    className="block w-full text-left text-xs p-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    What are the main ideas?
                  </button>
                  <button
                    onClick={() => setInput('Explain the key concept here')}
                    className="block w-full text-left text-xs p-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Explain this concept
                  </button>
                  <button
                    onClick={() =>
                      setInput('Summarize what I just read')
                    }
                    className="block w-full text-left text-xs p-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Summarize this chapter
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div
                        className="text-sm prose-sm prose-p:my-1 prose-pre:my-1"
                        dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(msg.content) }}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </p>
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
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
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
