'use client';

/** Returns true when running inside a Capacitor native shell. */
export const isCapacitor = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
