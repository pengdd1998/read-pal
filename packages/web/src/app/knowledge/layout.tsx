import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Knowledge Graph',
  description:
    'Visualize how concepts connect across all the books you have read. Your personal knowledge graph grows with every page and highlight.',
  robots: { index: false, follow: true },
};

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
