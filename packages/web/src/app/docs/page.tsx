import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Documentation — Getting Started with read-pal',
  description: 'Learn how to use read-pal: upload books, read with AI companions, create annotations, and build your knowledge graph.',
};

const SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '\uD83D\uDE80',
    items: [
      {
        title: 'Create an account',
        content: 'Sign up for free at read-pal. No credit card required. You\'ll get immediate access to all beta features including the AI reading companion, knowledge graph, and flashcards.',
      },
      {
        title: 'Upload your first book',
        content: 'Click "Upload" in your library and select an EPUB file. read-pal processes it instantly — extracting chapters, building a table of contents, and preparing the AI companion to discuss the content with you.',
      },
      {
        title: 'Start reading',
        content: 'Open the book and start reading. The reader supports customizable fonts, themes, and a distraction-free mode. Use keyboard shortcuts (arrow keys) to navigate between chapters.',
      },
      {
        title: 'Meet your companion',
        content: 'Click the chat icon to open your AI reading companion. Ask questions about the current passage, request explanations, or discuss themes. The companion knows the full book content.',
      },
    ],
  },
  {
    id: 'reading',
    title: 'Reading Features',
    icon: '\uD83D\uDCD6',
    items: [
      {
        title: 'Highlights & Notes',
        content: 'Select any text to highlight it. Add notes to captures your thoughts. All annotations are searchable and feed into the AI companion\'s context and your knowledge graph.',
      },
      {
        title: 'Bookmarks',
        content: 'Bookmark key passages for quick access. Bookmarks appear in the chapter outline and can be browsed from the annotation sidebar.',
      },
      {
        title: 'Reading Streaks',
        content: 'read-pal tracks your daily reading habit. Build streaks, see your reading calendar heatmap, and track your reading speed over time.',
      },
      {
        title: 'Study Mode',
        content: 'Toggle study mode for focused reading sessions. Get AI-generated objectives, concept checks, and mastery tracking. Perfect for academic reading.',
      },
    ],
  },
  {
    id: 'ai-companion',
    title: 'AI Features',
    icon: '\uD83E\uDD16',
    items: [
      {
        title: 'Reading Companion',
        content: 'Your book-aware AI assistant that can explain passages, generate summaries, answer questions, and suggest discussion topics. Streams responses in real-time via SSE.',
      },
      {
        title: 'Reading Friends',
        content: 'Choose from 5 distinct AI personas: Sage (wise & patient), Penny (enthusiastic), Alex (challenger), Quinn (quiet companion), or Sam (study buddy). Each has their own style and personality.',
      },
      {
        title: 'Knowledge Graph',
        content: 'As you read and annotate, read-pal automatically builds a knowledge graph connecting concepts across all your books. Visualize relationships and discover unexpected connections.',
      },
      {
        title: 'Cross-Book Synthesis',
        content: 'The synthesis engine analyzes your highlights, notes, and AI conversations across multiple books to find thematic connections and generate integrated insights.',
      },
    ],
  },
  {
    id: 'learning',
    title: 'Learning & Retention',
    icon: '\uD83E\uDDE0',
    items: [
      {
        title: 'Spaced Repetition Flashcards',
        content: 'read-pal uses the SM-2 algorithm (same as Anki) to schedule flashcard reviews at optimal intervals. Flashcards are generated from your highlights and notes.',
      },
      {
        title: 'Memory Books',
        content: 'When you finish a book, read-pal generates a beautiful 6-chapter Memory Book: Cover, Reading Journey, Highlights, Notes, Conversations, and Looking Forward.',
      },
      {
        title: 'Interventions',
        content: 'The AI monitors your reading patterns and provides timely interventions: marathon reading alerts, low-engagement nudges, and welcome-back messages.',
      },
    ],
  },
  {
    id: 'social',
    title: 'Sharing & Social',
    icon: '\uD83C\uDF1F',
    items: [
      {
        title: 'Book Clubs',
        content: 'Create or join book clubs. Share reading progress, discuss chapters, and compare notes with other readers.',
      },
      {
        title: 'Reading Cards',
        content: 'Turn your favorite passages into beautiful shareable cards. Perfect for social media, study groups, or personal collections.',
      },
      {
        title: 'Export Formats',
        content: 'Export your annotations and data in multiple formats: CSV, Markdown, HTML, APA 7th, MLA 9th, Chicago, and Zotero RIS. Ideal for research and academic work.',
      },
    ],
  },
  {
    id: 'developer',
    title: 'Developer Tools',
    icon: '\uD83D\uDCBB',
    items: [
      {
        title: 'REST API',
        content: 'Full REST API with 140+ endpoints. Includes OpenAPI/Swagger documentation, API key management, and comprehensive endpoint reference.',
      },
      {
        title: 'Webhooks',
        content: 'Subscribe to real-time events like book.completed, annotation.created, and session.ended. HMAC-SHA256 signed payloads with automatic retry.',
      },
      {
        title: 'API Keys',
        content: 'Create up to 5 personal access tokens (rpk_ prefix) for scripts, integrations, and automation. Keys are SHA-256 hashed on the server.',
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-navy-700 dark:bg-navy-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 text-sm text-amber-200 mb-4">
            <Link href="/" className="hover:text-white">Home</Link>
            <span>/</span>
            <span>Documentation</span>
          </div>
          <h1 className="text-4xl font-bold font-display tracking-tight">Documentation</h1>
          <p className="text-gray-300 mt-3 text-lg max-w-2xl">
            Everything you need to get the most out of read-pal — from uploading your first book to building integrations with our API.
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          {/* Sidebar nav */}
          <nav className="hidden lg:block space-y-1 sticky top-8 self-start">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:text-navy-700 dark:hover:text-white transition-colors"
              >
                <span className="text-base">{s.icon}</span>
                {s.title}
              </a>
            ))}
            <div className="border-t border-gray-200 dark:border-gray-800 my-3" />
            <Link
              href="/developers"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              API Reference &rarr;
            </Link>
          </nav>

          {/* Content */}
          <div className="space-y-12">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id}>
                <h2 className="text-2xl font-bold text-navy-700 dark:text-white font-display flex items-center gap-3 mb-6">
                  <span className="text-3xl">{section.icon}</span>
                  {section.title}
                </h2>
                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div
                      key={item.title}
                      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
                    >
                      <h3 className="font-semibold text-navy-700 dark:text-white mb-2">{item.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.content}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-navy-700 to-navy-800 dark:from-navy-800 dark:to-navy-900 p-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-3">Ready to start reading?</h2>
              <p className="text-gray-300 mb-6">Create a free account and upload your first book in under 60 seconds.</p>
              <Link
                href="/auth?mode=register"
                className="inline-block px-8 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
