import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your read-pal account, reading preferences, and companion settings.',
  robots: { index: false, follow: true },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
