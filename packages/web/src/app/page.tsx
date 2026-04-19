import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'read-pal — AI Reading Companion | Read Smarter, Remember More',
  description:
    'Meet your AI reading friend. Upload any EPUB and read alongside an intelligent companion who explains concepts, asks questions, and helps you remember every insight. Free to start.',
  openGraph: {
    title: 'read-pal — A Friend Who Reads With You',
    description:
      'Upload any book and read alongside an AI friend who asks thoughtful questions, explains tricky parts, and celebrates insights with you.',
  },
  twitter: {
    title: 'read-pal — A Friend Who Reads With You',
    description:
      'Upload any book and read alongside an AI friend who asks thoughtful questions, explains tricky parts, and celebrates insights with you.',
  },
};

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
    title: 'Upload any book',
    desc: 'Add an EPUB to your library and your companion gets to know it instantly.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Read with a friend',
    desc: 'Your companion asks thoughtful questions, explains tricky parts, and celebrates insights with you.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Remember everything',
    desc: 'Ideas connect across books naturally, building a knowledge network that grows with every page.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
];

const FAQS = [
  {
    q: 'What is an AI reading companion?',
    a: 'An AI reading companion is an intelligent assistant that reads alongside you. It explains concepts in context, asks thoughtful questions about what you\'re reading, highlights connections across books, and helps you remember key insights — like a friend who\'s always read the same book.',
  },
  {
    q: 'How do I remember what I read?',
    a: 'read-pal helps you retain more through active reading techniques: smart highlights with AI-powered notes, a personal knowledge graph that connects ideas across books, spaced repetition prompts from your reading friend, and beautiful memory books that compile your journey.',
  },
  {
    q: 'Is read-pal free to use?',
    a: 'Yes! read-pal has a free tier that lets you upload EPUB books, chat with your AI reading companion, create highlights and annotations, and track your reading streaks. No credit card required to get started.',
  },
  {
    q: 'What book formats does read-pal support?',
    a: 'read-pal currently supports EPUB files. Upload any EPUB and the AI companion instantly gets to know the content, ready to discuss, explain, and explore ideas with you. More formats are coming soon.',
  },
  {
    q: 'How is read-pal different from Kindle or Readwise?',
    a: 'Unlike passive e-readers (Kindle) or highlight collectors (Readwise), read-pal is an active reading partner. Its AI agents chat with you in real-time, explain passages in context, ask questions that deepen understanding, and build a knowledge graph connecting everything you\'ve read.',
  },
  {
    q: 'Can I share my book highlights?',
    a: 'Yes! read-pal lets you turn your favorite passages into beautiful quote cards that you can share on social media. You can also export all your highlights and annotations as Markdown or JSON.',
  },
];

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((faq) => ({
    '@type': 'Question',
    name: faq.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.a,
    },
  })),
};

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
              Beta — Your Reading Companion
            </span>
          </div>

          <h1 className="mt-10 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-navy-700 dark:text-white leading-[0.95] animate-slide-up font-display">
            A friend who
            <br />
            <span className="text-gradient">reads with you.</span>
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed animate-slide-up-delayed">
            Your reading companion, always by your side. Ask questions, explore ideas, and remember
            every insight &mdash; like having a thoughtful friend who&apos;s read every book you love.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-slide-up-delayed">
            <Link
              href="/auth?mode=register"
              className="btn btn-primary btn-glow px-8 py-4 text-base rounded-2xl shadow-glow-amber"
            >
              Start Reading Free
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/auth?mode=login"
              className="btn btn-secondary px-8 py-4 text-base rounded-2xl"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof Stats */}
      <section className="bg-surface-1 pt-8 pb-4">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center py-6">
            {[
              { value: '140+', label: 'API Endpoints' },
              { value: '275', label: 'Tests Passing' },
              { value: '16', label: 'Data Models' },
              { value: '5', label: 'AI Personas' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl sm:text-3xl font-bold text-primary-500">{stat.value}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-surface-1 pt-4 pb-20">
        {/* Trust bar */}
        <div className="max-w-5xl mx-auto px-4 mb-16">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Free to start
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              No credit card
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              EPUB support
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Open source
            </span>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
              How It Works
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              Three simple steps to start reading with your new companion.
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


      {/* Reading Experience */}
      <section className="bg-gradient-to-b from-surface-1 to-transparent py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight mb-4 font-display">
              Reading, But Better
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              Highlight a passage and ask &ldquo;why does this matter?&rdquo; Get an instant answer in context.
              No tabs, no searching, no losing your place.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '\uD83D\uDDA5',
                title: 'Highlight & Ask',
                desc: 'Select any text and ask your friend about it. Get explanations that make sense in context.',
              },
              {
                icon: '\uD83D\uDCDD',
                title: 'Notes That Remember',
                desc: 'Add notes and highlights. Your friend connects them across chapters and books automatically.',
              },
              {
                icon: '\uD83C\uDF1F',
                title: '"Aha!" Moments',
                desc: 'Your friend notices when something clicks and celebrates with you. Reading becomes a shared experience.',
              },
            ].map((item) => (
              <div key={item.title} className="card text-center group hover:shadow-lg transition-shadow duration-300">
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="font-bold text-navy-700 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
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
            Pick a companion who gets you. Each one has their own style, and they all remember
            what you&apos;ve read and talked about together.
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

      {/* Features Grid */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            Everything You Need
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
            Built for people who actually read, not just collect books.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {[
            { icon: '\uD83D\uDCD6', title: 'Beautiful Reader', desc: 'EPUB reader with themes, fonts, and a reading experience designed for focus.' },
            { icon: '\uD83E\uDD16', title: '5 AI Agents', desc: 'Companion, Research, Coach, Synthesis, and your personal Reading Friend.' },
            { icon: '\uD83D\uDCA1', title: 'Smart Highlights', desc: 'Highlight passages and add notes. AI connects ideas across all your books.' },
            { icon: '\uD83D\uDD78\uFE0F', title: 'Knowledge Graph', desc: 'See how concepts connect across everything you\'ve read, visualized beautifully.' },
            { icon: '\uD83D\uDD25', title: 'Reading Streaks', desc: 'Track your daily reading habit. Streaks, stats, and activity heatmaps.' },
            { icon: '\uD83D\uDCD3', title: 'Memory Books', desc: 'Beautiful compilations of your reading journeys with AI-extracted insights.' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-shadow">
              <span className="text-3xl flex-shrink-0">{f.icon}</span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Built For */}
      <section className="bg-surface-1 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
              Built for People Who Actually Read
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
              Whether you&apos;re studying for exams, doing research, or just love books — read-pal adapts to you.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                emoji: '\uD83C\uDF93',
                title: 'Students',
                desc: 'Ace your exams with AI-powered study sessions, spaced repetition flashcards, and a knowledge graph that connects course material across semesters.',
                features: ['Flashcards from highlights', 'Study mode with quizzes', 'Cross-book connections'],
              },
              {
                emoji: '\uD83D\uDD0D',
                title: 'Researchers',
                desc: 'Synthesize insights across papers, track citations, and export in academic formats. Your research companion that never forgets a connection.',
                features: ['APA/MLA/Chicago export', 'Cross-book synthesis', 'Knowledge graph'],
              },
              {
                emoji: '\uD83D\uDCDA',
                title: 'Book Lovers',
                desc: 'Remember every insight from every book. Share beautiful reading cards, join book clubs, and build a personal library of ideas.',
                features: ['Memory books', 'Reading streaks', 'Book clubs'],
              },
            ].map((persona) => (
              <div key={persona.title} className="card-hover text-center">
                <div className="text-4xl mb-4">{persona.emoji}</div>
                <h3 className="text-lg font-bold text-navy-700 dark:text-white mb-2">{persona.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">{persona.desc}</p>
                <ul className="space-y-1.5">
                  {persona.features.map((f) => (
                    <li key={f} className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
                      <svg className="w-3 h-3 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Source */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-navy-700/5 to-primary-500/5 dark:from-navy-700/20 dark:to-primary-500/10 p-10 sm:p-14">
          <div className="grid sm:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
                Open Source
              </h2>
              <p className="mt-4 text-gray-600 dark:text-gray-400 leading-relaxed">
                read-pal is open source under the MIT license. Inspect the code, contribute features,
                or self-host on your own server. Built with transparency in mind.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {['Python + FastAPI', 'Next.js + TypeScript', 'PostgreSQL', 'MIT License'].map((tag) => (
                  <span key={tag} className="px-3 py-1.5 text-xs font-medium rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              {[
                { value: '275+', label: 'Tests' },
                { value: '27', label: 'API Routers' },
                { value: '140+', label: 'Endpoints' },
                { value: '50+', label: 'Components' },
              ].map((stat) => (
                <div key={stat.label} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-primary-500">{stat.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
            Frequently Asked Questions
          </h2>
        </div>
        <div className="space-y-6">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">{faq.q}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(FAQ_SCHEMA),
          }}
        />
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 dark:from-navy-900 dark:via-gray-950 dark:to-navy-900 py-24 noise-overlay">
        <div className="hero-orb hero-orb-1 opacity-30" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-5 font-display">
            Join the Beta — Shape the Future of Reading
          </h2>
          <p className="text-gray-300 text-lg mb-10">
            We&apos;re looking for avid readers to try read-pal and tell us what they think.
            Your feedback shapes every feature we build.
          </p>
          <Link href="/auth?mode=register" className="btn btn-primary btn-glow px-10 py-4 text-base rounded-2xl shadow-glow-amber">
            Join the Beta
          </Link>
          <p className="text-sm text-gray-400 mt-5">Free during beta. No credit card required.</p>
        </div>
      </section>
    </div>
  );
}
