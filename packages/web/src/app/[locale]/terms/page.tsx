'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function TermsPage() {
  const t = useTranslations('terms');
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
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using read-pal (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">2. Service Description</h2>
          <p>read-pal is an open-source AI reading companion that helps you understand, remember, and connect ideas from the books you read. The Service includes an EPUB reader, AI-powered reading companion, annotations, knowledge graph, flashcards, and personal reading books. The source code is available under the MIT License at <a href="https://github.com/pengdd1998/read-pal" target="_blank" rel="noopener noreferrer" className="text-amber-700 dark:text-amber-400 underline hover:text-amber-600">github.com/pengdd1998/read-pal</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">3. User Accounts</h2>
          <p>You may need to create an account to access certain features. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate information and promptly update it if it changes.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">4. Acceptable Use</h2>
          <p>You agree not to misuse the Service. This includes, but is not limited to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
            <li>Attempting to gain unauthorized access to other users&apos; accounts or data</li>
            <li>Using the Service for any unlawful purpose</li>
            <li>Uploading content that infringes on others&apos; intellectual property</li>
            <li>Attempting to overwhelm or disrupt the Service&apos;s infrastructure</li>
            <li>Using the API in a way that exceeds published rate limits</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">5. Intellectual Property</h2>
          <p>read-pal is open-source software released under the <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer" className="text-amber-700 dark:text-amber-400 underline hover:text-amber-600">MIT License</a>. You retain full ownership of all content you upload, including books, annotations, highlights, notes, and AI conversation logs. Your reading data is yours.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">6. Disclaimer of Warranties</h2>
          <p>The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, either express or implied. We do not guarantee that the Service will be uninterrupted, error-free, or free of harmful components. As an open-source project, you are encouraged to inspect, modify, and self-host the software.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">7. Limitation of Liability</h2>
          <p>To the fullest extent permitted by applicable law, the maintainers of read-pal shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. This includes damages for loss of data, reading progress, or annotations.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">8. Modifications</h2>
          <p>We may update these Terms from time to time. Changes will be reflected on this page with an updated revision date. Continued use of the Service after changes constitutes acceptance of the revised Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">9. Governing Law</h2>
          <p>read-pal is an open-source project without a specific legal entity. These Terms are governed by applicable law in the jurisdiction where you reside. For dispute resolution, please open an issue on our GitHub repository.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-white mb-3">10. Contact</h2>
          <p>For questions about these Terms, please open an issue at <a href="https://github.com/pengdd1998/read-pal/issues" target="_blank" rel="noopener noreferrer" className="text-amber-700 dark:text-amber-400 underline hover:text-amber-600">github.com/pengdd1998/read-pal/issues</a>.</p>
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
