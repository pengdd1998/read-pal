export default function HomePage() {
  return (
    <div className="min-h-[80vh]">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-primary-50/50 to-transparent dark:from-primary-900/10">
        <div className="max-w-5xl mx-auto px-4 py-20 text-center">
          <div className="mb-4">
            <span className="inline-block px-4 py-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded-full">
              AI-Powered Reading Companion
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 bg-clip-text text-transparent leading-tight">
            Read Smarter.<br />
            Remember More.<br />
            Grow Together.
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            read-pal uses intelligent AI agents that learn with you, build knowledge over time,
            and become your reading friend. Transform passive reading into an active, social learning journey.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/register" className="inline-flex items-center justify-center px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl text-lg transition-colors shadow-lg shadow-primary-600/25">
              Start Reading Free
            </a>
            <a href="/login" className="inline-flex items-center justify-center px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl text-lg transition-colors border border-gray-200 dark:border-gray-700">
              Sign In
            </a>
          </div>
        </div>
      </div>

      {/* Four Agents Section */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Four AI Agents, One Reading Companion
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Each agent specializes in a different aspect of your reading journey, working together to deepen understanding.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card hover:border-blue-300 transition-all hover:-translate-y-1">
            <div className="text-4xl mb-4">📖</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Companion Agent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Explains difficult concepts in context. Answers questions about what you&apos;re reading right now.
            </p>
            <div className="mt-4 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full inline-block">
              Real-time help
            </div>
          </div>

          <div className="card hover:border-purple-300 transition-all hover:-translate-y-1">
            <div className="text-4xl mb-4">🔬</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Research Agent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Deep-dives into topics. Provides historical context, cross-references, and fact-checking.
            </p>
            <div className="mt-4 text-xs font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-3 py-1 rounded-full inline-block">
              Deep analysis
            </div>
          </div>

          <div className="card hover:border-green-300 transition-all hover:-translate-y-1">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Coach Agent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Improves your reading skills with exercises, vocabulary building, and spaced repetition.
            </p>
            <div className="mt-4 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full inline-block">
              Skill building
            </div>
          </div>

          <div className="card hover:border-amber-300 transition-all hover:-translate-y-1">
            <div className="text-4xl mb-4">🧠</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Synthesis Agent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connects ideas across all your books. Builds knowledge graphs and finds hidden relationships.
            </p>
            <div className="mt-4 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full inline-block">
              Cross-book insights
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Graph Feature */}
      <div className="bg-gradient-to-r from-purple-50 to-primary-50 dark:from-purple-900/10 dark:to-primary-900/10 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Your Personal Knowledge Graph
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                As you read, read-pal automatically builds a knowledge network connecting concepts,
                themes, and ideas across everything you&apos;ve read. Watch your understanding grow visually.
              </p>
              <ul className="space-y-3">
                {[
                  'Auto-discover connections between books',
                  'Visual concept mapping and relationships',
                  'Track learning progress over time',
                  'Find contradictions and agreements between authors',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 text-purple-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card bg-white/50 dark:bg-gray-900/50 backdrop-blur text-center py-12">
              <div className="text-6xl mb-4">🕸️</div>
              <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">Knowledge Graph</div>
              <div className="text-sm text-gray-500 mt-1">156 concepts, 89 connections, 23 themes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Reading Friends Section */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Meet Your Reading Friend
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Choose an AI personality that matches your reading style. Your friend learns your preferences
            and grows with you over time.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { name: 'Sage', emoji: '🦉', desc: 'Wise & patient. Asks deep questions.', color: 'blue' },
            { name: 'Penny', emoji: '🌟', desc: 'Enthusiastic explorer of ideas.', color: 'yellow' },
            { name: 'Alex', emoji: '💪', desc: 'Gentle challenger. Pushes thinking.', color: 'red' },
            { name: 'Quinn', emoji: '🌿', desc: 'Quiet companion. Speaks when needed.', color: 'green' },
            { name: 'Sam', emoji: '📚', desc: 'Study buddy. Practical & focused.', color: 'purple' },
          ].map((friend) => (
            <div key={friend.name} className="card text-center hover:-translate-y-1 transition-all">
              <div className="text-4xl mb-3">{friend.emoji}</div>
              <h3 className="font-bold text-gray-900 dark:text-white">{friend.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{friend.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Social Proof */}
      <div className="bg-gray-50 dark:bg-gray-900/50 py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
            What Readers Are Saying
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { quote: 'read-pal helped me understand Thinking, Fast and Slow in a way no other tool could. The AI companion asks questions I never thought to ask.', reader: 'Sarah K., Product Manager' },
              { quote: 'The knowledge graph is incredible. I can see how concepts from different books connect. It\'s like having a personal research assistant.', reader: 'David M., PhD Student' },
              { quote: 'My reading streak is now 45 days! The Coach Agent keeps me motivated and the Reading Friend makes it feel less lonely.', reader: 'Emma L., Software Engineer' },
            ].map((review, i) => (
              <div key={i} className="card bg-white dark:bg-gray-800">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className="text-yellow-400">&#9733;</span>
                  ))}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic mb-3">&quot;{review.quote}&quot;</p>
                <p className="text-xs text-gray-500">{review.reader}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-8 items-center opacity-50">
            <span className="text-sm font-medium text-gray-500">Trusted by readers at</span>
            <span className="font-bold text-gray-400">Stanford</span>
            <span className="font-bold text-gray-400">MIT</span>
            <span className="font-bold text-gray-400">Google</span>
            <span className="font-bold text-gray-400">Amazon</span>
            <span className="font-bold text-gray-400">Harvard</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Ready to Transform Your Reading?
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Join thousands of readers who are building knowledge, not just checking off books.
        </p>
        <a href="/register" className="inline-flex items-center justify-center px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl text-lg transition-colors shadow-lg shadow-primary-600/25">
          Get Started Free
        </a>
        <p className="text-sm text-gray-400 mt-4">No credit card required. Free forever plan available.</p>
      </div>
    </div>
  );
}
