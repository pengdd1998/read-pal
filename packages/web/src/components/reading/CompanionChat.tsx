'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/websocket';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CompanionChatProps {
  bookId: string;
  currentPage: number;
}

export function CompanionChat({ bookId, currentPage }: CompanionChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // WebSocket connection for real-time agent streaming
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) wsClient.connect(token);

    const handler = (msg: any) => {
      if (msg.type === 'token' && msg.content) {
        setMessages(prev => [...prev, { role: 'assistant', content: msg.content }]);
      }
    };

    wsClient.onMessage(handler);

    return () => {
      wsClient.offMessage(handler);
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

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

      // The agent chat endpoint returns { success, content, agentsUsed }
      // at the top level rather than wrapped in { data }.
      const raw = result as unknown as {
        success: boolean;
        content?: string;
        agentsUsed?: string[];
      };
      const assistantContent = raw.content ?? result.data?.content;

      if (raw.success && assistantContent) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Failed to connect to the AI companion. Please check your connection.',
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
        className="fixed bottom-6 right-6 z-40 bg-primary-600 text-white p-4 rounded-full shadow-lg hover:bg-primary-700 transition-colors"
        title="Chat with AI Companion"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-96 bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
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
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <div className="text-4xl mb-2">🤖</div>
                <p className="text-sm">
                  Hi! I'm your reading companion. Ask me anything about what
                  you're reading!
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
              messages.map((msg, index) => (
                <div
                  key={index}
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
                    <p className="text-sm whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
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
                onKeyPress={handleKeyPress}
                placeholder="Ask about what you're reading..."
                className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
