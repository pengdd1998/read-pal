import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Memory Books',
  description:
    'Beautiful AI-generated compilations of your reading journeys — highlights, insights, and milestones preserved forever.',
  robots: { index: false, follow: true },
};

export default function MemoryBooksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
