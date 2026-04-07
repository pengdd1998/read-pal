import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  description:
    'Create a free read-pal account and start your AI-powered reading journey today.',
  openGraph: {
    title: 'Create Account | read-pal',
    description:
      'Join read-pal — your AI reading companion that transforms passive reading into active learning.',
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
