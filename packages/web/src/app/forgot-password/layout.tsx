import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Your Password',
  description:
    'Reset your read-pal password to get back to reading with your AI companion.',
  openGraph: {
    title: 'Reset Password — read-pal',
    description: 'Reset your read-pal password to continue your reading journey.',
  },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
