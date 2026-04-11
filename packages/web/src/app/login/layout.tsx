import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — Continue Your Reading Journey',
  description:
    'Sign in to read-pal to continue reading with your AI companion. Your books, highlights, and conversations are waiting.',
  openGraph: {
    title: 'Continue Reading — read-pal',
    description:
      'Your AI reading friend is waiting. Sign in to pick up where you left off.',
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
