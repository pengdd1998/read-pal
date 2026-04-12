import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reading Friend',
  description:
    'Chat with your personal AI reading companion. Choose from 5 unique personalities and discuss books, explore ideas, and deepen your understanding together.',
  robots: { index: false, follow: true },
};

export default function FriendLayout({ children }: { children: React.ReactNode }) {
  return children;
}
