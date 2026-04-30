'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { isCapacitor } from '@/lib/capacitor';

/**
 * Handles the Android hardware back button in Capacitor.
 *
 * Priority-based handling:
 * 1. Close any open modal (register via `registerModalClose`)
 * 2. Navigate back if not on a root page
 * 3. Ignore on dashboard/root to prevent accidental exit
 *
 * Only active when running inside a Capacitor native shell.
 */
export function useHardwareBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const modalCloseRef = useRef<(() => boolean) | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Register a callback that returns true if a modal was closed
  const registerModalClose = useCallback((fn: () => boolean) => {
    modalCloseRef.current = fn;
    return () => {
      if (modalCloseRef.current === fn) {
        modalCloseRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isCapacitor()) return;

    let App: typeof import('@capacitor/app').App | null = null;

    const setup = async () => {
      const mod = await import('@capacitor/app');
      App = mod.App;

      const handler = App.addListener('backButton', () => {
        // Priority 1: close open modal
        if (modalCloseRef.current) {
          const closed = modalCloseRef.current();
          if (closed) return;
        }

        // Priority 2: navigate back if not on root
        const rootPaths = ['/', '/dashboard', '/auth'];
        const isRoot = rootPaths.some(
          (p) => pathnameRef.current === p || pathnameRef.current.startsWith('/auth'),
        );

        if (!isRoot) {
          router.back();
        }
        // On root: do nothing — let the OS handle it
      });

      return handler;
    };

    let cleanup: Promise<{ remove: () => void } | void> | null = null;
    setup().then((handler) => {
      cleanup = Promise.resolve(handler);
    });

    return () => {
      cleanup?.then((handler) => handler?.remove());
    };
  }, [router]);

  return { registerModalClose };
}
