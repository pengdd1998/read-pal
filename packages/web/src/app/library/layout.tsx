import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Library',
  description:
    'Browse and manage your personal reading collection. Upload EPUB books, track progress, and organize your library.',
  openGraph: {
    title: 'My Library | read-pal',
    description:
      'Browse and manage your personal reading collection on read-pal.',
  },
  robots: { index: false, follow: true },
};

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
