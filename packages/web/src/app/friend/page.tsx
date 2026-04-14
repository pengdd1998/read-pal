'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, API_BASE_URL } from '@/lib/api';

interface FriendSettings {
  friendPersona: string;
  friendFrequency: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const PERSONAS: Record<string, { name: string; emoji: string; personality: string; greeting: string }> = {
  sage: { name: 'Sage', emoji: '\uD83E\uDD89', personality: 'Thoughtful, patient, deep', greeting: 'Every book holds a secret waiting to be discovered.' },
  penny: { name: 'Penny', emoji: '\u2B50', personality: 'Enthusiastic, curious, warm', greeting: 'I\'m so glad you\'re here! Let\'s explore together.' },
  alex: { name: 'Alex', emoji: '\uD83D\uDD0D', personality: 'Challenging, direct, sharp', greeting: 'Ready to push your thinking? Let\'s go.' },
  quinn: { name: 'Quinn', emoji: '\uD83C\uDF0A', personality: 'Calm, minimalist, wise', greeting: 'Silence has its own wisdom. I speak when it matters.' },
  sam: { name: 'Sam', emoji: '\uD83C\uDFAF', personality: 'Practical, focused, helpful', greeting: 'Let\'s make the most of your reading time.' },
};

const QUICK_PROMPTS = [
  'What should I read next?',
  'Explain a concept from my reading',
  'Help me get back into reading',
  'What connections did you find in my books?',
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function consumeSSEStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): AbortController {
  const controller = new AbortController();
  const reader = response.body?.getReader();
  if (!reader) { onError('No response body'); return controller; }

  const decoder = new TextDecoder();
  let buffer = '';

  const processChunk = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') { onDone(); return; }
      try {
        const parsed = JSON.parse(payload) as { token?: string; error?: string };
        if (parsed.error) { onError(parsed.error); return; }
        if (parsed.token) onToken(parsed.token);
      } catch { /* skip */ }
    }
  };

  (async () => {
    try {
      while (!controller.signal.aborted) {
        const result = await reader.read();
        if (result.done) break;
        processChunk(decoder.decode(result.value, { stream: true }));
      }
      onDone();
    } catch { onDone(); }
  })();

  return controller;
}

export default function FriendPage() {
  const [settings, setSettings] = useState<FriendSettings | null>(null);
  const [tab, setTab] = useState<'chat' | 'settings'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get<FriendSettings>('/api/settings')
      .then((res) => {
        if (res.success && res.data) setSettings(res.data);
      })
      .catch(() => {
        /* Settings load failure — proceed with defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  // Abort SSE stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const persona = settings ? PERSONAS[settings.friendPersona] || PERSONAS.penny : PERSONAS.penny;

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    setInput('');
    setSending(true);

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: msg };
    const assistantId = uid();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE_URL}/api/friend/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) throw new Error('Failed to send');

      abortRef.current = consumeSSEStream(
        res,
        (token) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: m.content + token } : m),
          );
        },
        () => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m),
          );
          setSending(false);
        },
        (err) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${err}`, streaming: false } : m),
          );
          setSending(false);
        },
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: 'Sorry, I couldn\'t connect. Try again?', streaming: false } : m),
      );
      setSending(false);
    }
  }, [input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePersonaChange = async (id: string) => {
    const prev = settings?.friendPersona;
    setSettings((s) => s ? { ...s, friendPersona: id } : s);
    try {
      const res = await api.patch('/api/settings', { friendPersona: id });
      if (!res.success) setSettings((s) => s ? { ...s, friendPersona: prev || s.friendPersona } : s);
    } catch {
      setSettings((s) => s ? { ...s, friendPersona: prev || s.friendPersona } : s);
    }
  };

  const handleFrequencyChange = async (value: string) => {
    const prev = settings?.friendFrequency;
    setSettings((s) => s ? { ...s, friendFrequency: value } : s);
    try {
      const res = await api.patch('/api/settings', { friendFrequency: value });
      if (!res.success) setSettings((s) => s ? { ...s, friendFrequency: prev || s.friendFrequency } : s);
    } catch {
      setSettings((s) => s ? { ...s, friendFrequency: prev || s.friendFrequency } : s);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
        <div className="mb-8"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" /></div>
        <div className="text-center mb-10">
          <div className="w-24 h-24 mx-auto mb-4 bg-gray-200 dark:bg-gray-700 rounded-3xl animate-pulse" />
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-20 mx-auto animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      {/* Back */}
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
        <Link href="/chat" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          AI Agents
        </Link>
      </div>

      {/* Header with persona */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center shadow-sm">
          <span className="text-2xl">{persona.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{persona.name}</h1>
          <p className="text-xs text-gray-500">{persona.personality}</p>
        </div>
        <button
          onClick={() => setTab(tab === 'chat' ? 'settings' : 'chat')}
          className={`p-2 rounded-lg transition-colors ${
            tab === 'settings'
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Settings Panel */}
      {tab === 'settings' && (
        <div className="animate-fade-in space-y-4 mb-4">
          {/* Persona selector */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="font-semibold text-sm mb-1">Choose Your Companion</h2>
            <p className="text-xs text-gray-400 mb-3">Your friend learns your style over time</p>
            <div className="grid grid-cols-1 gap-1.5">
              {Object.entries(PERSONAS).map(([id, p]) => {
                const isSelected = settings?.friendPersona === id;
                return (
                  <button
                    key={id}
                    onClick={() => handlePersonaChange(id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 active:scale-[0.98] ${
                      isSelected
                        ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-xl">{p.emoji}</span>
                    <div className="text-left flex-1">
                      <div className="font-medium text-sm text-gray-900 dark:text-white">{p.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{p.personality}</div>
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interaction frequency */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="font-semibold text-sm mb-1">Interaction Style</h2>
            <p className="text-xs text-gray-400 mb-3">How often should your companion speak up?</p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {([
                ['minimal', 'Listener', 'I wait for you'],
                ['normal', 'Balanced', 'I nudge when helpful'],
                ['frequent', 'Proactive', 'I share often'],
              ] as const).map(([value, label, desc]) => (
                <button
                  key={value}
                  onClick={() => handleFrequencyChange(value)}
                  className={`py-2 px-2 rounded-lg text-center transition-all duration-200 active:scale-[0.98] border ${
                    settings?.friendFrequency === value
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className={`text-xs font-medium ${settings?.friendFrequency === value ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}>
                    {label}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3 italic">&ldquo;{persona.greeting}&rdquo;</p>
              <p className="text-xs text-gray-400 mb-4">Your personal reading companion. Ask anything, or pick a question below.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 active:scale-95 transition-all duration-150"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {msg.content}
                  {msg.streaming && (
                    <span className="inline-block w-1.5 h-4 bg-amber-400 ml-1 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Talk to ${persona.name}...`}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 outline-none transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className="px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
