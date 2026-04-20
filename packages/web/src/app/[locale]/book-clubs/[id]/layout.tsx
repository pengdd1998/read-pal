import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book Club',
  description: 'View and participate in your book club discussions.',
  robots: { index: false, follow: true },
};

export default function BookClubDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
