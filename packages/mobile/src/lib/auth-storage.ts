import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const SECURE_STORE_TIMEOUT = 3000;

const mmkv = new MMKV({ id: 'auth-storage' });
let secureStoreAvailable = true;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SecureStore timeout')), ms)
  );
  return Promise.race([promise, timer]);
}

async function secureGet(key: string): Promise<string | null> {
  if (!secureStoreAvailable) return null;
  try {
    return await withTimeout(SecureStore.getItemAsync(key), SECURE_STORE_TIMEOUT);
  } catch {
    secureStoreAvailable = false;
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (!secureStoreAvailable) return;
  try {
    await withTimeout(SecureStore.setItemAsync(key, value), SECURE_STORE_TIMEOUT);
  } catch {
    secureStoreAvailable = false;
  }
}

async function secureDelete(key: string): Promise<void> {
  if (!secureStoreAvailable) return;
  try {
    await withTimeout(SecureStore.deleteItemAsync(key), SECURE_STORE_TIMEOUT);
  } catch {
    secureStoreAvailable = false;
  }
}

export async function saveToken(token: string): Promise<void> {
  mmkv.set(TOKEN_KEY, token);
  await secureSet(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  const mmkvValue = mmkv.getString(TOKEN_KEY);
  if (mmkvValue) return mmkvValue;
  const secureValue = await secureGet(TOKEN_KEY);
  if (secureValue) {
    mmkv.set(TOKEN_KEY, secureValue);
  }
  return secureValue;
}

export async function deleteToken(): Promise<void> {
  mmkv.delete(TOKEN_KEY);
  await secureDelete(TOKEN_KEY);
}

export async function saveUser(user: string): Promise<void> {
  mmkv.set(USER_KEY, user);
  await secureSet(USER_KEY, user);
}

export async function getUser(): Promise<string | null> {
  const mmkvValue = mmkv.getString(USER_KEY);
  if (mmkvValue) return mmkvValue;
  const secureValue = await secureGet(USER_KEY);
  if (secureValue) {
    mmkv.set(USER_KEY, secureValue);
  }
  return secureValue;
}

export async function deleteUser(): Promise<void> {
  mmkv.delete(USER_KEY);
  await secureDelete(USER_KEY);
}
