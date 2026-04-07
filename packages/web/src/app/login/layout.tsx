import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your read-pal account to continue your reading journey.',
  openGraph: {
    title: 'Sign In | read-pal',
    description: 'Sign in to your read-pal account to continue your reading journey.',
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
