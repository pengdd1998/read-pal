'use client';

import { useEffect } from 'react';

/**
 * Sets the document title for client-side pages.
 * Appends " | read-pal" suffix automatically.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | read-pal` : 'read-pal';
    return () => { document.title = prev; };
  }, [title]);
}
