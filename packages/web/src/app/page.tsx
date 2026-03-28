export default function HomePage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-4 text-center">
        {/* Hero Section */}
        <div className="mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            Meet Your AI Reading Companion
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Transform passive reading into active, social, and memorable learning.
            Let AI agents learn with you, build knowledge over time, and become your reading friend.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="card">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">AI Companions</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Four specialized agents help you understand, research, improve, and synthesize ideas.
            </p>
          </div>

          <div className="card">
            <div className="text-4xl mb-4">📚</div>
            <h3 className="text-xl font-semibold mb-2">Knowledge Graph</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Automatically build connections across everything you read. Watch your knowledge grow.
            </p>
          </div>

          <div className="card">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-semibold mb-2">Reading Friends</h3>
            <p className="text-gray-600 dark:text-gray-400">
              AI personalities that build genuine relationships and make reading a shared journey.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="/register" className="btn btn-primary text-lg px-8 py-3">
            Get Started Free
          </a>
          <a href="/login" className="btn btn-secondary text-lg px-8 py-3">
            Sign In
          </a>
        </div>

        {/* Social Proof */}
        <div className="mt-16 text-sm text-gray-500 dark:text-gray-500">
          <p>Join thousands of readers who are transforming their reading experience</p>
        </div>
      </div>
    </div>
  );
}
