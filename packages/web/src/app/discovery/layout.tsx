import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Discover Books & Get AI Recommendations',
  description:
    'Find your next great read with AI-powered book recommendations based on your reading history, favorite themes, and knowledge graph connections. Free book suggestions updated daily.',
  openGraph: {
    title: 'Discover Your Next Book — read-pal',
    description:
      'AI-powered book recommendations tailored to what you\'ve read and loved.',
  },
};

export default function DiscoveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
              { '@type': 'ListItem', position: 2, name: 'Discover' },
            ],
          }),
        }}
      />
      {children}
    </>
  );
}
