import Link from 'next/link';

const AGENTS = [
  {
    name: 'Companion',
    emoji: '\uD83D\uDCD6',
    desc: 'Explains difficult concepts in context. Answers questions about what you\'re reading right now.',
    color: 'bg-sage',
    tagBg: 'bg-sage/10 text-sage',
    tag: 'Real-time help',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
  {
    name: 'Research',
    emoji: '\uD83D\uDD2C',
    desc: 'Deep-dives into topics. Provides historical context, cross-references, and fact-checking.',
    color: 'bg-navy-500',
    tagBg: 'bg-navy-100 dark:bg-navy-800/40 text-navy-700 dark:text-navy-300',
    tag: 'Deep analysis',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    name: 'Coach',
    emoji: '\uD83C\uDFAF',
    desc: 'Improves your reading skills with exercises, vocabulary building, and spaced repetition.',
    color: 'bg-forest',
    tagBg: 'bg-forest/10 text-forest',
    tag: 'Skill building',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    name: 'Synthesis',
    emoji: '\uD83E\uDDE0',
    desc: 'Connects ideas across all your books. Builds knowledge graphs and finds hidden relationships.',
    color: 'bg-russet',
    tagBg: 'bg-russet/10 text-russet',
    tag: 'Cross-book insights',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
];

const FRIENDS = [
  { name: 'Sage', emoji: '\uD83E\uDDD9', desc: 'Wise & patient. Asks deep questions.', accent: 'border-l-sage' },
  { name: 'Penny', emoji: '\uD83C\uDF1F', desc: 'Enthusiastic explorer of ideas.', accent: 'border-l-amber-500' },
  { name: 'Alex', emoji: '\u26A1', desc: 'Gentle challenger. Pushes thinking.', accent: 'border-l-russet' },
  { name: 'Quinn', emoji: '\uD83C\uDF19', desc: 'Quiet companion. Speaks when needed.', accent: 'border-l-navy-400' },
  { name: 'Sam', emoji: '\uD83D\uDCDA', desc: 'Study buddy. Practical & focused.', accent: 'border-l-forest' },
];

const STEPS = [
  {
    number: '01',
    title: 'Upload a book',
    desc: 'Add any EPUB to your library. Your AI companion gets to know the content instantly.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Read with AI agents',
    desc: 'Four specialized agents help you understand, research, practice, and connect ideas.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Build lasting knowledge',
    desc: 'Knowledge graphs and memory grow with every page, creating a permanent learning archive.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="min-h-[80vh]">
      {/* Hero */}
      <section className="relative overflow-hidden noise-overlay">
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 -z-10">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-28 pb-24 text-center">
          {/* Animated gradient badge */}
          <div className="animate-fade-in">
            <span className="badge-gradient inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-full shadow-glow">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              AI-Powered Reading Companion
            </span>
          </div>

          <h1 className="mt-10 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-navy-700 dark:text-white leading-[0.95] animate-slide-up font-display">
            Read Smarter.
            <br />
            <span className="text-gradient">Remember More.</span>
            <br />
            Grow Together.
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed animate-slide-up-delayed">
            read-pal uses intelligent AI agents that learn with you, build knowledge over time,
            and become your reading friend. Transform passive reading into an active, social learning journey.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-slide-up-delayed">
            <Link
              href="/register"
              className="btn btn-primary btn-glow px-8 py-4 text-base rounded-2xl shadow-glow-amber"
            >
              Start Reading Free
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="btn btn-secondary px-8 py-4 text-base rounded-2xl"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-surface-1 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
              How It Works
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              Three steps to transform how you read and retain knowledge.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="step-connector text-center group">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 mb-5 group-hover:bg-primary-500 group-hover:text-white transition-all duration-300">
                  {step.icon}
                </div>
                <div className="text-xs font-mono font-bold text-primary-500 tracking-wider mb-2">{step.number}</div>
                <h3 className="text-lg font-bold text-navy-700 dark:text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            Four AI Agents, One Reading Companion
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
            Each agent specializes in a different aspect of your reading journey, working together to deepen understanding.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {AGENTS.map((agent, i) => (
            <div
              key={agent.name}
              className={`card-hover stagger-${i + 1} animate-slide-up group`}
            >
              <div className={`feature-icon ${agent.color} text-white`}>
                {agent.icon}
              </div>
              <h3 className="text-lg font-bold text-navy-700 dark:text-white mb-2 mt-5">{agent.name} Agent</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                {agent.desc}
              </p>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${agent.tagBg}`}>
                {agent.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Knowledge Graph */}
      <section className="bg-gradient-to-b from-surface-1 to-transparent py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight mb-6 font-display">
                Your Personal Knowledge Graph
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-8">
                As you read, read-pal automatically builds a knowledge network connecting concepts,
                themes, and ideas across everything you&apos;ve read. Watch your understanding grow visually.
              </p>
              <ul className="space-y-4">
                {[
                  'Auto-discover connections between books',
                  'Visual concept mapping and relationships',
                  'Track learning progress over time',
                  'Find contradictions and agreements between authors',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                    <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card bg-gradient-to-br from-amber-50/50 to-primary-100/30 dark:from-amber-950/30 dark:to-primary-950/20 text-center py-16 shadow-soft">
              <div className="text-7xl mb-4 animate-float">{'\uD83D\uDD78'}</div>
              <div className="text-lg font-bold text-navy-700 dark:text-white">Knowledge Graph</div>
              <div className="text-sm text-gray-500 mt-2">156 concepts, 89 connections, 23 themes</div>
              <div className="mt-6 flex justify-center gap-6 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sage" />
                  Concepts
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Connections
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-navy-400" />
                  Themes
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reading Friends */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            Meet Your Reading Friend
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
            Choose an AI personality that matches your reading style. Your friend learns your preferences
            and grows with you over time.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {FRIENDS.map((friend) => (
            <div key={friend.name} className={`card-hover text-center border-l-4 ${friend.accent}`}>
              <div className="text-4xl mb-3">{friend.emoji}</div>
              <h3 className="font-bold text-gray-900 dark:text-white">{friend.name}</h3>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{friend.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 dark:from-navy-900 dark:via-gray-950 dark:to-navy-900 py-24 noise-overlay">
        <div className="hero-orb hero-orb-1 opacity-30" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-5 font-display">
            Ready to Transform Your Reading?
          </h2>
          <p className="text-gray-300 text-lg mb-10">
            Start building real knowledge, not just checking off books.
          </p>
          <Link href="/register" className="btn btn-primary btn-glow px-10 py-4 text-base rounded-2xl shadow-glow-amber">
            Get Started Free
          </Link>
          <p className="text-sm text-gray-400 mt-5">No credit card required. Free forever plan available.</p>
        </div>
      </section>
    </div>
  );
}
