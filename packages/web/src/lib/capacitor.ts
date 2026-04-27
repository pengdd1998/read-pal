'use client';

/** Returns true when running inside a Capacitor native shell. */
export const isCapacitor = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();

/** Returns true when running as an installed PWA. */
export const isPWA = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(display-mode: standalone)').matches;

/** Returns true on either Capacitor or PWA. */
export const isMobileApp = (): boolean => isCapacitor() || isPWA();
