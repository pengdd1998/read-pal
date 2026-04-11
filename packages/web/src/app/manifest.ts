import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'read-pal — Your AI Reading Companion',
    short_name: 'read-pal',
    description: 'Transform passive reading into active learning with AI companions',
    start_url: '/',
    display: 'standalone',
    background_color: '#fefdfb',
    theme_color: '#d97706',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
