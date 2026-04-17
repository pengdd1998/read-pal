import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reader',
  description:
    'Immersive reading experience with AI companion chat, highlights, annotations, bookmarks, and multi-theme support.',
  openGraph: {
    title: 'Reader | read-pal',
    description:
      'Read with AI companions that explain concepts, answer questions, and help you learn deeply.',
  },
};

export default function ReadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
