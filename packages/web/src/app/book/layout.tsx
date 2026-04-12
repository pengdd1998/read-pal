import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book Detail',
  description: 'View book details, reading progress, stats, and highlights.',
  robots: { index: false, follow: true },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
