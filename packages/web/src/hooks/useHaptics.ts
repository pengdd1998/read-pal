'use client';

import { isCapacitor } from '@/lib/capacitor';

let Haptics: typeof import('@capacitor/haptics').Haptics | null = null;
let ImpactStyle: typeof import('@capacitor/haptics').ImpactStyle | null = null;
let NotificationType: typeof import('@capacitor/haptics').NotificationType | null = null;

async function loadHaptics() {
  if (!Haptics && isCapacitor()) {
    const mod = await import('@capacitor/haptics');
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
    NotificationType = mod.NotificationType;
  }
  return Haptics;
}

export async function hapticLight() {
  const h = await loadHaptics();
  if (h && ImpactStyle) h.impact({ style: ImpactStyle.Light });
}

export async function hapticMedium() {
  const h = await loadHaptics();
  if (h && ImpactStyle) h.impact({ style: ImpactStyle.Medium });
}

export async function hapticSuccess() {
  const h = await loadHaptics();
  if (h && NotificationType) h.notification({ type: NotificationType.Success });
}
