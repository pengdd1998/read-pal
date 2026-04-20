import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DM_Sans, Crimson_Pro, Source_Serif_4, Literata, Fira_Code } from 'next/font/google';
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

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${dmSans.variable} ${crimsonPro.variable} ${sourceSerif.variable} ${literata.variable} ${firaCode.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#d97706" />
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
