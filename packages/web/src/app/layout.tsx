import type { Metadata } from 'next';
import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://175.178.66.207:8090';

export const metadata: Metadata = {
  title: {
    default: 'read-pal — Your AI Reading Companion',
    template: '%s | read-pal',
  },
  description:
    'Transform passive reading into active, social, and memorable learning with AI companions that read with you, explain concepts, and build your knowledge graph.',
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: 'zh_CN',
    siteName: 'read-pal',
    title: 'read-pal — Your AI Reading Companion',
    description:
      'Upload any book and read alongside an AI companion who explains concepts, asks questions, and helps you remember every insight.',
    url: '/',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'read-pal — A Friend Who Reads With You',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'read-pal — Your AI Reading Companion',
    description:
      'Upload any book and read alongside an AI companion who explains concepts, asks questions, and helps you remember every insight.',
    images: ['/opengraph-image'],
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
