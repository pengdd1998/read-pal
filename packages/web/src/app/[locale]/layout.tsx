import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DM_Sans, Crimson_Pro, Source_Serif_4, Literata, Fira_Code, Noto_Serif_SC } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { NetworkStatus } from '@/components/NetworkStatus';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { routing } from '@/i18n/routing';

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

const firaCode = Fira_Code({
 subsets: ['latin'],
 variable: '--font-mono',
 display: 'swap',
});

// CJK reading face: 宋体-style serif for long-form Chinese. Latin glyphs
// resolve from the earlier Latin font in the stack (W3C/Noto guidance);
// Noto Serif SC covers hanzi. Swap display so text renders immediately in
// the system fallback, then upgrades when the font arrives.
const notoSerifSC = Noto_Serif_SC({
 weight: ['400', '500', '700'],
 preload: false, // huge font (65k glyphs) — no preload, swap on demand
 variable: '--font-cjk-serif',
 display: 'swap',
});

export function generateStaticParams() {
 return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
 children,
 params,
}: {
 children: React.ReactNode;
 params: Promise<{ locale: string }>;
}) {
 const { locale } = await params;

 if (!routing.locales.includes(locale as 'en' | 'zh')) {
 notFound();
 }

 setRequestLocale(locale);
 const messages = await getMessages({ locale });

 return (
 <html lang={locale} suppressHydrationWarning className={`${dmSans.variable} ${crimsonPro.variable} ${sourceSerif.variable} ${literata.variable} ${firaCode.variable} ${notoSerifSC.variable}`}>
  <head>
  <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}" }} />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
  <meta name="theme-color" content="#d97706" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <script
   type="application/ld+json"
   dangerouslySetInnerHTML={{
   __html: JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
    {
     '@type': 'SoftwareApplication',
     name: 'read-pal',
     description: 'AI reading companion that reads with you, explains concepts, and builds your knowledge graph.',
     applicationCategory: 'EducationApplication',
     operatingSystem: 'Web',
     offers: {
     '@type': 'Offer',
     price: '0',
     priceCurrency: 'USD',
     },
    },
    ],
   }),
   }}
  />
  </head>
  <body className="font-sans antialiased">
  <NextIntlClientProvider messages={messages}>
   <AuthProvider>
   <AnalyticsProvider>
    <ErrorBoundary>
    <ServiceWorkerRegistrar />
    <NetworkStatus />
    <AppShell>{children}</AppShell>
    </ErrorBoundary>
   </AnalyticsProvider>
   </AuthProvider>
  </NextIntlClientProvider>
  </body>
 </html>
 );
}
