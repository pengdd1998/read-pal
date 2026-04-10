import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Chat',
  description:
    'Chat with AI reading agents — Companion, Research, Coach, Synthesis, and your personal Reading Friend. Ask questions, explore ideas, and deepen your understanding.',
  openGraph: {
    title: 'AI Chat | read-pal',
    description:
      'Chat with intelligent AI reading agents about anything. Get explanations, research deep-dives, coaching, and synthesis.',
  },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
