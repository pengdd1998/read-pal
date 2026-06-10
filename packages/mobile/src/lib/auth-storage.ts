import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';
const SECURE_STORE_TIMEOUT = 3000;

// Use AsyncStorage as primary storage - more reliable than MMKV
// SecureStore is used as encrypted backup but can hang on some devices

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Storage timeout')), ms)
  );
  return Promise.race([promise, timer]);
}

async function secureGet(key: string): Promise<string | null> {
  try {
    return await withTimeout(SecureStore.getItemAsync(key), SECURE_STORE_TIMEOUT);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(key, value), SECURE_STORE_TIMEOUT);
  } catch {
    // Silently fail - data is still in AsyncStorage
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await withTimeout(SecureStore.deleteItemAsync(key), SECURE_STORE_TIMEOUT);
  } catch {
    // Silently fail
  }
}

export async function saveToken(token: string): Promise<void> {
  // Save to AsyncStorage (primary) and SecureStore (encrypted backup)
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await secureSet(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  // Try SecureStore first (encrypted, more secure)
  const secureValue = await secureGet(TOKEN_KEY);
  if (secureValue) return secureValue;

  // Fallback to AsyncStorage
  const asyncValue = await AsyncStorage.getItem(TOKEN_KEY);
  if (asyncValue) {
    // Migrate to SecureStore for future reads
    secureSet(TOKEN_KEY, asyncValue).catch(() => {});
  }
  return asyncValue;
}

export async function deleteToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await secureDelete(TOKEN_KEY);
}

export async function saveUser(user: string): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, user);
  await secureSet(USER_KEY, user);
}

export async function getUser(): Promise<string | null> {
  // Try SecureStore first (encrypted, more secure)
  const secureValue = await secureGet(USER_KEY);
  if (secureValue) return secureValue;

  // Fallback to AsyncStorage
  const asyncValue = await AsyncStorage.getItem(USER_KEY);
  if (asyncValue) {
    // Migrate to SecureStore
    secureSet(USER_KEY, asyncValue).catch(() => {});
  }
  return asyncValue;
}

export async function deleteUser(): Promise<void> {
  await AsyncStorage.removeItem(USER_KEY);
  await secureDelete(USER_KEY);
}

export async function saveRefreshToken(token: string): Promise<void> {
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
  await secureSet(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  // Try SecureStore first (encrypted, more secure)
  const secureValue = await secureGet(REFRESH_TOKEN_KEY);
  if (secureValue) return secureValue;

  // Fallback to AsyncStorage
  const asyncValue = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (asyncValue) {
    // Migrate to SecureStore
    secureSet(REFRESH_TOKEN_KEY, asyncValue).catch(() => {});
  }
  return asyncValue;
}

export async function deleteRefreshToken(): Promise<void> {
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  await secureDelete(REFRESH_TOKEN_KEY);
}
