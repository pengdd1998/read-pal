import type { Metadata } from 'next';
import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://read-pal.app';

export const metadata: Metadata = {
  title: {
    default: 'read-pal — Your AI Reading Companion',
    template: '%s | read-pal',
  },
  description:
    'Transform passive reading into active, social, and memorable learning with AI companions that read with you, explain concepts, and build your knowledge graph.',
  metadataBase: new URL(APP_URL),
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
