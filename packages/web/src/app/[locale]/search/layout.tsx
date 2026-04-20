import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search across your books, highlights, and annotations with AI-powered semantic search.',
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
