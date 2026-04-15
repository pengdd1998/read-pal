'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { renderSimpleMarkdown } from '@/lib/markdown';
import { consumeSSEStream } from '@/lib/sse';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { generateId } from '@read-pal/shared';
import { authFetch } from '@/lib/auth-fetch';

type AgentType = 'companion' | 'research' | 'coach' | 'synthesis';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: AgentType;
  streaming?: boolean;
}

const AGENTS: { id: AgentType; name: string; emoji: string; desc: string }[] = [
  { id: 'companion', name: 'Companion', emoji: '\uD83D\uDCD6', desc: 'Explains concepts and answers questions' },
  { id: 'research', name: 'Research', emoji: '\uD83D\uDD2C', desc: 'Deep-dives into topics and fact-checks' },
  { id: 'coach', name: 'Coach', emoji: '\uD83C\uDFAF', desc: 'Improves reading skills with exercises' },
  { id: 'synthesis', name: 'Synthesis', emoji: '\uD83E\uDDE0', desc: 'Connects ideas across your library' },
];

const SUGGESTIONS: Record<AgentType, string[]> = {
  companion: [
    'Help me understand a concept I\'m struggling with',
    'What are effective note-taking strategies?',
    'How can I improve my reading comprehension?',
  ],
  research: [
    'Deep dive into cognitive biases',
    'Fact-check a claim from my reading',
    'Find cross-references on a topic',
  ],
  coach: [
    'Give me a reading comprehension exercise',
    'Test my vocabulary knowledge',
    'Create a review schedule for what I\'ve read',
  ],
  synthesis: [
    'Find connections between books I\'ve read',
    'What themes appear across my library?',
    'Create a knowledge summary of my reading',
  ],
};

export default function ChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('companion');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Preload DOMPurify on mount so purifySync works immediately
  useEffect(() => { preloadDOMPurify(); }, []);

  // Abort any in-flight stream when the component unmounts
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
    setLoading(false);
    setConnecting(false);
  }, []);

  const handleSend = useCallback(async (text?: string): Promise<void> => {
    const message = text || input.trim();
    if (!message || loading) return;

    setInput('');
    setLoading(true);
    setConnecting(true);

    const userMsgId = generateId();
    const assistantMsgId = generateId();

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: message, agent: selectedAgent },
      { id: assistantMsgId, role: 'assistant', content: '', agent: selectedAgent, streaming: true },
    ]);

    const endpoint = `${API_BASE_URL}/api/agents/chat/stream`;

    const body = { message, agent: selectedAgent };

    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMsg = `Server error (${response.status})`;
        try {
          const errData = await response.json() as { error?: { message?: string } };
          errorMsg = errData.error?.message || errorMsg;
        } catch { /* use default error message */ }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `Error: ${errorMsg}`, streaming: false }
              : m,
          ),
        );
        setLoading(false);
        setConnecting(false);
        return;
      }

      setConnecting(false);

      abortRef.current = consumeSSEStream(
        response,
        // onToken: append token to the assistant message
        (tokenChunk: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + tokenChunk }
                : m,
            ),
          );
        },
        // onDone: finalize the message
        () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    streaming: false,
                    content: m.content || 'Sorry, I couldn\'t generate a response.',
                  }
                : m,
            ),
          );
          setLoading(false);
          setConnecting(false);
          abortRef.current = null;
        },
        // onError
        (errMsg: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: m.content
                      ? m.content
                      : `Failed: ${errMsg}`,
                    streaming: false,
                  }
                : m,
            ),
          );
          setLoading(false);
          setConnecting(false);
          abortRef.current = null;
        },
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: 'Couldn\'t reach the AI. Check your connection and try again.', streaming: false }
            : m,
        ),
      );
      setLoading(false);
      setConnecting(false);
    }
  }, [input, loading, selectedAgent]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentAgent = AGENTS.find((a) => a.id === selectedAgent)!;

  return (
    <main className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">AI Agents</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Ask questions, explore topics, and build knowledge — even without a book open.
        </p>
      </div>

      {/* Agent Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setSelectedAgent(agent.id)}
            className={`p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all duration-200 active:scale-[0.98] ${
              selectedAgent === agent.id
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="text-xl sm:text-2xl mb-1">{agent.emoji}</div>
            <div className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white">{agent.name}</div>
            <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 line-clamp-2">{agent.desc}</div>
          </button>
        ))}
      </div>

      {/* Link to Reading Friend page */}
      <Link
        href="/friend"
        className="flex items-center gap-2 px-3 py-2 mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors group"
      >
        <span className="text-lg">{'\uD83E\uDD1D'}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200 group-hover:text-amber-900 dark:group-hover:text-amber-100">
            Looking for your Reading Friend?
          </span>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/60">
            Chat with your personalized companion who learns your style over time.
          </p>
        </div>
        <svg className="w-4 h-4 text-amber-400 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Chat Area */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Chat Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentAgent.emoji}</span>
            <span className="font-medium text-gray-900 dark:text-white">{currentAgent.name}</span>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[45vh] sm:h-[50vh] min-h-[300px] sm:min-h-[400px] overflow-y-auto p-3 sm:p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">{currentAgent.emoji}</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {currentAgent.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {currentAgent.desc}. Pick a question to get started:
              </p>
              <div className="space-y-2 max-w-md mx-auto">
                {SUGGESTIONS[selectedAgent].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="block w-full text-left text-sm p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-[0.98] transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl p-3 ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="text-xs font-medium mb-1 opacity-60">
                      {AGENTS.find((a) => a.id === msg.agent)?.emoji} {AGENTS.find((a) => a.id === msg.agent)?.name}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div
                      className="text-sm prose-sm prose-p:my-1 prose-pre:my-1"
                      dangerouslySetInnerHTML={{ __html: purifySync(renderSimpleMarkdown(msg.content)) }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {/* Blinking cursor while streaming */}
                  {msg.role === 'assistant' && msg.streaming && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-gray-600 dark:bg-gray-300 animate-pulse align-text-bottom" />
                  )}
                </div>
              </div>
            ))
          )}
          {/* Connecting indicator (shown only during the initial fetch, before streaming starts) */}
          {connecting && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-xl p-3">
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
        <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${currentAgent.name} anything...`}
              className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[60px]"
              rows={2}
              disabled={loading}
            />
            {loading ? (
              <button
                onClick={stopStreaming}
                className="btn self-end px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="btn btn-primary self-end disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
