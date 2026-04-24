'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function PrivacyPage() {
  const t = useTranslations('privacy');
  usePageTitle(t('page_title'));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-amber-800 dark:bg-amber-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="text-amber-200 hover:text-white text-sm mb-2 inline-block">
            &larr; Dashboard
          </Link>
          <h1 className="text-3xl font-bold font-serif">{t('page_title')}</h1>
          <p className="text-amber-200 mt-2">Last updated: April 2026</p>
        </div>
      </header>

      {/* TODO: i18n — body text below is English-only for now. Add translation keys when needed. */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10 text-stone-700 dark:text-gray-300 text-sm leading-relaxed">

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">1. Information We Collect</h2>
          <p>When you use read-pal, we may collect the following information:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
            <li><strong>Account information:</strong> email address and name (provided during registration)</li>
            <li><strong>Reading data:</strong> books you upload, reading progress, and reading session history</li>
            <li><strong>Annotations:</strong> highlights, notes, bookmarks, and tags you create</li>
            <li><strong>AI conversations:</strong> messages exchanged with the AI reading companion</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">2. How We Use Your Data</h2>
          <p>Your data is used solely to provide and improve the Service:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
            <li>To deliver reading features, annotations, and the AI companion experience</li>
            <li>To generate AI responses in the context of your reading material</li>
            <li>To build personal reading books and knowledge graphs from your annotations</li>
            <li>To track reading streaks, statistics, and flashcard review schedules</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">3. Data Storage</h2>
          <p>read-pal is a self-hosted, open-source application. Your data is stored on the server where you (or your administrator) deploy the application. Data is kept in a PostgreSQL database under your control. We do not operate a centralized cloud service — the instance you use is managed by whoever deployed it.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">4. Third-Party Sharing</h2>
          <p>We do not sell, trade, or share your personal data with third parties. As an open-source, self-hosted application, your data stays on your server. The only external service involved is the AI language model provider (see section 9).</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">5. Tracking and Analytics</h2>
          <p>read-pal does not include any third-party tracking, analytics, or advertising SDKs by default. No Google Analytics, no Facebook Pixel, no telemetry. Your reading habits are your own.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">6. Cookies</h2>
          <p>The Service uses a single HTTP-only cookie containing a JWT authentication token. This cookie is required to keep you logged in and is not used for tracking. No other cookies are set.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">7. Data Retention</h2>
          <p>Your data is retained for as long as your account exists. If you delete your account, all associated data — including books, annotations, AI conversations, flashcards, and reading statistics — will be permanently removed from the database.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">8. Your Rights</h2>
          <p>You have full control over your data:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
            <li><strong>Export:</strong> Download all your data at any time via the Export API (JSON, CSV, Markdown, and other formats)</li>
            <li><strong>Delete:</strong> Delete your account and all associated data permanently through Settings</li>
            <li><strong>Self-host:</strong> Deploy read-pal on your own infrastructure for complete data sovereignty</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">9. AI Data Processing</h2>
          <p>When you chat with the AI reading companion, your messages and relevant book context are sent to the AI model provider (Zhipu AI / GLM API) for processing. The provider&apos;s own privacy policy applies to data they receive. Conversations are stored in your local database and are not used to train AI models by read-pal.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">10. Contact</h2>
          <p>For privacy-related questions or data requests, please open an issue at <a href="https://github.com/pengdd1998/read-pal/issues" target="_blank" rel="noopener noreferrer" className="text-amber-700 dark:text-amber-400 underline hover:text-amber-600">github.com/pengdd1998/read-pal/issues</a>.</p>
        </section>

        <div className="pt-6 border-t border-stone-200 dark:border-gray-800">
          <Link href="/" className="text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 text-sm font-medium">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
