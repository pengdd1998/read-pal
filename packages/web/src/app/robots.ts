import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://175.178.66.207:8090';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/read/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
