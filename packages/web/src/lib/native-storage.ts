'use client';

import { isCapacitor } from './capacitor';

let Preferences: typeof import('@capacitor/preferences').Preferences | null = null;

async function getPreferences() {
  if (!Preferences && isCapacitor()) {
    const mod = await import('@capacitor/preferences');
    Preferences = mod.Preferences;
  }
  return Preferences;
}

export async function getItem(key: string): Promise<string | null> {
  if (isCapacitor()) {
    const pref = await getPreferences();
    if (pref) {
      const { value } = await pref.get({ key });
      return value;
    }
  }
  return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isCapacitor()) {
    const pref = await getPreferences();
    if (pref) {
      await pref.set({ key, value });
      return;
    }
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

export async function removeItem(key: string): Promise<void> {
  if (isCapacitor()) {
    const pref = await getPreferences();
    if (pref) {
      await pref.remove({ key });
      return;
    }
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
}
