import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reading Stats',
  description:
    'Track your reading habits with detailed stats — reading velocity, streaks, time spent, pages read, and activity heatmaps.',
  robots: { index: false, follow: true },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
