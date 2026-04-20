import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'read-pal — Your AI Reading Companion',
  description:
    'Sign in or create a free account to start reading with your AI companion. Upload any book, get explanations, and remember every insight.',
  openGraph: {
    title: 'read-pal — Start Reading Smarter',
    description:
      'Meet your AI reading friend. Upload any book and start reading smarter today.',
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
