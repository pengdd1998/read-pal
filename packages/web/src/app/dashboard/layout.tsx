import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Your reading dashboard — track progress, view stats, reading streaks, and AI agent insights.',
  openGraph: {
    title: 'Dashboard | read-pal',
    description:
      'Track your reading progress, streaks, and AI-powered insights on your read-pal dashboard.',
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
