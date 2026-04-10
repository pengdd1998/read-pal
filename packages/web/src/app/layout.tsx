import type { Metadata } from 'next';
import { DM_Sans, Crimson_Pro, Source_Serif_4, Literata } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-reading',
  display: 'swap',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://read-pal.app';

export const metadata: Metadata = {
  title: {
    default: 'read-pal — Your AI Reading Companion',
    template: '%s | read-pal',
  },
  description:
    'Transform passive reading into active, social, and memorable learning with AI companions that read with you, explain concepts, and build your knowledge graph.',
  keywords: [
    'AI reading companion',
    'reading assistant',
    'book chat',
    'AI book reader',
    'reading tracker',
    'knowledge graph',
    'reading streak',
    'book annotations',
    'EPUB reader',
    'reading friend',
    'learn faster',
    'active reading',
  ],
  authors: [{ name: 'read-pal' }],
  creator: 'read-pal',
  publisher: 'read-pal',
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'read-pal',
    title: 'read-pal — Your AI Reading Companion',
    description:
      'Transform passive reading into active, social, and memorable learning with AI companions that read with you, explain concepts, and build your knowledge graph.',
    images: [
      {
        url: `${APP_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'read-pal — A friend who reads with you',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'read-pal — Your AI Reading Companion',
    description:
      'Transform passive reading into active, social, and memorable learning with AI companions.',
    images: [`${APP_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: APP_URL,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${crimsonPro.variable} ${sourceSerif.variable} ${literata.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
