import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://175.178.66.207:8090';
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
