import Link from 'next/link';

const AGENTS = [
  {
    name: 'Companion',
    emoji: '\uD83D\uDCD6',
    desc: 'Explains difficult concepts in context. Answers questions about what you\'re reading right now.',
    color: 'from-teal-500 to-teal-700',
    tagBg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
  },
  {
    name: 'Research',
    emoji: '\uD83D\uDD2C',
    desc: 'Deep-dives into topics. Provides historical context, cross-references, and fact-checking.',
    color: 'from-violet-500 to-violet-700',
    tagBg: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
  },
  {
    name: 'Coach',
    emoji: '\uD83C\uDFAF',
    desc: 'Improves your reading skills with exercises, vocabulary building, and spaced repetition.',
    color: 'from-emerald-500 to-emerald-700',
    tagBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
  },
  {
    name: 'Synthesis',
    emoji: '\uD83E\uDDE0',
    desc: 'Connects ideas across all your books. Builds knowledge graphs and finds hidden relationships.',
    color: 'from-amber-500 to-amber-700',
    tagBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
  },
];

const FRIENDS = [
  { name: 'Sage', emoji: '\uD83E\uDDD9', desc: 'Wise & patient. Asks deep questions.', accent: 'border-l-teal-500' },
  { name: 'Penny', emoji: '\uD83C\uDF1F', desc: 'Enthusiastic explorer of ideas.', accent: 'border-l-yellow-500' },
  { name: 'Alex', emoji: '\u26A1', desc: 'Gentle challenger. Pushes thinking.', accent: 'border-l-red-400' },
  { name: 'Quinn', emoji: '\uD83C\uDF19', desc: 'Quiet companion. Speaks when needed.', accent: 'border-l-slate-400' },
  { name: 'Sam', emoji: '\uD83D\uDCDA', desc: 'Study buddy. Practical & focused.', accent: 'border-l-purple-500' },
];

const REVIEWS = [
  { quote: 'read-pal helped me understand Thinking, Fast and Slow in a way no other tool could. The AI companion asks questions I never thought to ask.', reader: 'Sarah K., Product Manager' },
  { quote: 'The knowledge graph is incredible. I can see how concepts from different books connect. It\'s like having a personal research assistant.', reader: 'David M., PhD Student' },
  { quote: 'My reading streak is now 45 days! The Coach Agent keeps me motivated and the Reading Friend makes it feel less lonely.', reader: 'Emma L., Software Engineer' },
];

export default function HomePage() {
  return (
    <div className="min-h-[80vh]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary-100/40 dark:bg-primary-900/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-100/30 dark:bg-accent-900/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
        </div>

        <div className="max-w-5xl mx-auto px-4 pt-24 pb-20 text-center">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-sm font-medium rounded-full border border-primary-200/50 dark:border-primary-800/50">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
              AI-Powered Reading Companion
            </span>
          </div>

          <h1 className="mt-8 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[0.95] animate-slide-up">
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
              className="btn btn-primary px-8 py-4 text-base rounded-2xl shadow-glow"
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

      {/* Agents */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
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
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center text-white text-xl mb-5 shadow-soft`}>
                {agent.emoji}
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{agent.name} Agent</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                {agent.desc}
              </p>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${agent.tagBg}`}>
                {agent.name === 'Companion' ? 'Real-time help' : agent.name === 'Research' ? 'Deep analysis' : agent.name === 'Coach' ? 'Skill building' : 'Cross-book insights'}
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
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-6">
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
                    <div className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card bg-gradient-to-br from-primary-50/50 to-accent-50/30 dark:from-primary-950/30 dark:to-accent-950/20 text-center py-16 shadow-soft">
              <div className="text-7xl mb-4 animate-float">{'\uD83D\uDD78'}</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">Knowledge Graph</div>
              <div className="text-sm text-gray-500 mt-2">156 concepts, 89 connections, 23 themes</div>
              <div className="mt-6 flex justify-center gap-6 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary-400" />
                  Concepts
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-accent-400" />
                  Connections
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
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
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
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

      {/* Social Proof */}
      <section className="bg-surface-1 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white text-center mb-12 tracking-tight">
            What Readers Are Saying
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {REVIEWS.map((review, i) => (
              <div key={i} className={`card stagger-${i + 1} animate-slide-up`}>
                <div className="flex gap-0.5 mb-4">
                  {[1,2,3,4,5].map((s) => (
                    <svg key={s} className="w-4 h-4 text-accent-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed mb-4">
                  &ldquo;{review.quote}&rdquo;
                </p>
                <p className="text-xs text-gray-500 font-medium">{review.reader}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-wrap justify-center gap-x-10 gap-y-4 items-center">
            <span className="text-sm font-medium text-gray-400">Trusted by readers at</span>
            {['Stanford', 'MIT', 'Google', 'Amazon', 'Harvard'].map((name) => (
              <span key={name} className="text-sm font-semibold text-gray-300 dark:text-gray-600 tracking-wide">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-5">
          Ready to Transform Your Reading?
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg mb-10">
          Join thousands of readers who are building knowledge, not just checking off books.
        </p>
        <Link href="/register" className="btn btn-primary px-10 py-4 text-base rounded-2xl shadow-glow">
          Get Started Free
        </Link>
        <p className="text-sm text-gray-400 mt-5">No credit card required. Free forever plan available.</p>
      </section>
    </div>
  );
}
