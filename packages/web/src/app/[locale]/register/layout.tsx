import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Join read-pal — Start Reading With Your AI Friend | Free',
  description:
    'Create your free read-pal account and meet your AI reading companion. Upload any EPUB, get explanations, build knowledge, and remember every insight. No credit card required.',
  openGraph: {
    title: 'Start Reading Free — read-pal',
    description:
      'Create a free account and meet your AI reading friend. Upload any book and start reading smarter today.',
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
