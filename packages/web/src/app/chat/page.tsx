'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

type AgentType = 'companion' | 'research' | 'coach' | 'synthesis' | 'friend';
type FriendPersona = 'sage' | 'penny' | 'alex' | 'quinn' | 'sam';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  agent?: AgentType;
}

const AGENTS: { id: AgentType; name: string; emoji: string; desc: string }[] = [
  { id: 'companion', name: 'Companion', emoji: '📖', desc: 'Explains concepts and answers questions' },
  { id: 'research', name: 'Research', emoji: '🔬', desc: 'Deep-dives into topics and fact-checks' },
  { id: 'coach', name: 'Coach', emoji: '🎯', desc: 'Improves reading skills with exercises' },
  { id: 'synthesis', name: 'Synthesis', emoji: '🧠', desc: 'Connects ideas across your library' },
  { id: 'friend', name: 'Friend', emoji: '🤝', desc: 'Your personal reading companion' },
];

const FRIEND_PERSONAS: { id: FriendPersona; name: string; emoji: string; desc: string }[] = [
  { id: 'sage', name: 'Sage', emoji: '🧙', desc: 'Wise, patient, asks deep questions' },
  { id: 'penny', name: 'Penny', emoji: '🌟', desc: 'Enthusiastic explorer' },
  { id: 'alex', name: 'Alex', emoji: '⚡', desc: 'Gentle challenger' },
  { id: 'quinn', name: 'Quinn', emoji: '🌙', desc: 'Quiet companion' },
  { id: 'sam', name: 'Sam', emoji: '📚', desc: 'Study buddy' },
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
  friend: [
    'What do you think about what I\'m reading?',
    'I\'m feeling stuck on this chapter',
    'Tell me something interesting about this topic',
  ],
};

export default function ChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('companion');
  const [selectedPersona, setSelectedPersona] = useState<FriendPersona>('sage');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || loading) return;

    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: message, agent: selectedAgent }]);

    try {
      let assistantContent = '';

      if (selectedAgent === 'friend') {
        // Route to friend-specific endpoint
        const result = await api.post<{ response: string; persona: string; emotion: string }>(
          '/api/friend/chat',
          { message, context: { persona: selectedPersona } },
        );
        // api.post returns the full { success, data } shape — data has { response, persona, emotion }
        const friendData = (result as any).data || result;
        assistantContent = friendData.response || '';
      } else {
        // Route to general agent endpoint
        const result = await api.post<{ content: string; agentsUsed: string[] }>(
          '/api/agents/chat',
          { message, agent: selectedAgent },
        );
        const raw = result as unknown as {
          success: boolean;
          content?: string;
          agentsUsed?: string[];
        };
        assistantContent = raw.content ?? ((result.data as any)?.content || '');
      }

      if (assistantContent) {
        setMessages(prev => [...prev, { role: 'assistant', content: assistantContent, agent: selectedAgent }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          agent: selectedAgent,
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to connect to the AI. Please check your connection.',
        agent: selectedAgent,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentAgent = AGENTS.find(a => a.id === selectedAgent)!;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">AI Chat</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Chat with your AI agents about anything — no book required.
        </p>
      </div>

      {/* Agent Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {AGENTS.map(agent => (
          <button
            key={agent.id}
            onClick={() => setSelectedAgent(agent.id)}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              selectedAgent === agent.id
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="text-2xl mb-1">{agent.emoji}</div>
            <div className="font-medium text-sm text-gray-900 dark:text-white">{agent.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{agent.desc}</div>
          </button>
        ))}
      </div>

      {/* Persona Selector — only when Friend is selected */}
      {selectedAgent === 'friend' && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choose a persona:</p>
          <div className="flex flex-wrap gap-2">
            {FRIEND_PERSONAS.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPersona(p.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                  selectedPersona === p.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>{p.emoji}</span>
                <span className="font-medium">{p.name}</span>
                <span className="text-xs opacity-60 hidden sm:inline">— {p.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Chat Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentAgent.emoji}</span>
            <span className="font-medium text-gray-900 dark:text-white">{currentAgent.name} Agent</span>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[400px] overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">{currentAgent.emoji}</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Chat with {currentAgent.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {currentAgent.desc}
              </p>
              <div className="space-y-2 max-w-md mx-auto">
                <p className="text-xs font-medium text-gray-400">Try asking:</p>
                {SUGGESTIONS[selectedAgent].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="block w-full text-left text-sm p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl p-3 ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="text-xs font-medium mb-1 opacity-60">
                      {AGENTS.find(a => a.id === msg.agent)?.emoji} {AGENTS.find(a => a.id === msg.agent)?.name}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-xl p-3">
                <div className="flex gap-1.5">
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
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${currentAgent.name} anything...`}
              className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={2}
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="btn btn-primary self-end disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
