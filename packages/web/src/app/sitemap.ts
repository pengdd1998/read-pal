import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://read-pal.app';
const LOCALES = ['en', 'zh'];

const PATHS = [
  '',
  '/register',
  '/login',
  '/forgot-password',
  '/memory-books',
  '/developers',
  '/flashcards',
  '/stats',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${APP_URL}/${locale}${path}`,
      lastModified,
      changeFrequency: path === '' ? 'weekly' : 'monthly',
      priority: path === '' ? 1.0 : 0.7,
    })),
  );
}
