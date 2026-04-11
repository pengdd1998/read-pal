'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';

export default function WelcomePage() {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Book[]>('/api/books');
        if (res.success && res.data) {
          const books = (res.data as unknown as Book[]) || [];
          // Find the sample book
          const sample = books.find(
            (b) => b.title?.includes('Art of Reading') || b.author === 'read-pal',
          );
          if (sample) setBook(sample);
          else if (books.length > 0) setBook(books[0]);
        }
      } catch {
        // Continue without book
      }
      setLoading(false);
    })();
  }, []);

  // Auto-advance through steps
  useEffect(() => {
    if (loading) return;
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 1800),
      setTimeout(() => setStep(3), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* Step 0: Welcome */}
        <div
          className={`transition-all duration-700 ${
            step >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Penny avatar */}
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-teal-200 dark:from-amber-800/40 dark:to-teal-800/40 rounded-3xl rotate-6 scale-95" />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 rounded-3xl flex items-center justify-center shadow-sm">
              <span className="text-4xl">{'\u2B50'}</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              Preparing your reading space...
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2">Hi there! I&apos;m Penny.</h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                Your reading friend. I&apos;ll be right here while you read —
                asking questions, making connections, and celebrating those
                &quot;aha!&quot; moments with you.
              </p>
            </>
          )}
        </div>

        {/* Step 1: What we'll do */}
        {step >= 1 && !loading && (
          <div
            className={`mt-8 transition-all duration-700 ${
              step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-left space-y-4">
              <h2 className="font-semibold text-lg text-center">Here&apos;s what we can do together</h2>
              {[
                { icon: '\uD83D\uDCD6', title: 'Read together', desc: 'I highlight insights as you go' },
                { icon: '\uD83D\uDCAC', title: 'Chat about ideas', desc: 'Ask me anything — I explain in context' },
                { icon: '\uD83C\uDF31', title: 'Build knowledge', desc: 'I connect ideas across your books' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{item.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Sample book ready */}
        {step >= 2 && !loading && (
          <div
            className={`mt-6 transition-all duration-700 ${
              step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="bg-gradient-to-br from-amber-50 to-teal-50 dark:from-amber-900/20 dark:to-teal-900/20 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5">
              <div className="flex items-center gap-3 text-left">
                <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800 dark:to-amber-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{'\uD83D\uDCD6'}</span>
                </div>
                <div>
                  <div className="font-semibold text-sm">
                    {book?.title || 'The Art of Reading'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    A sample book is ready for you — let&apos;s explore together!
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: CTA */}
        {step >= 3 && !loading && (
          <div
            className={`mt-8 transition-all duration-700 ${
              step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <button
              onClick={() => {
                if (book) {
                  router.push(`/read/${book.id}`);
                } else {
                  router.push('/library');
                }
              }}
              className="btn btn-primary py-3.5 px-8 rounded-2xl text-lg hover:scale-105 active:scale-95 transition-transform duration-200"
            >
              Start Reading
            </button>
            <div className="mt-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Go to dashboard instead
              </button>
              {!book && (
                <button
                  onClick={async () => {
                    try {
                      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
                      if (res.success && res.data) {
                        const data = res.data as unknown as { book: { id: string } };
                        router.push(`/read/${data.book.id}`);
                      }
                    } catch {
                      router.push('/library');
                    }
                  }}
                  className="text-sm text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors ml-4"
                >
                  Load a sample book
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
