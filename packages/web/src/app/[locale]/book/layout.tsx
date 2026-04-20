import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book Detail',
  description:
    'View book details, reading progress, stats, highlights, and discuss with your AI companion.',
  robots: { index: false, follow: true },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
