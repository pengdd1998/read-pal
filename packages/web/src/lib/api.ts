/**
 * API client — thin re-export barrel for backward compatibility.
 *
 * All imports from '@/lib/api' are forwarded to the decomposed modules:
 *   lib/api/client.ts    — ApiClient class, singleton `api`, API_BASE_URL
 *   lib/api/cache.ts     — per-endpoint TTL cache with stale-while-revalidate
 *   lib/api/interceptors.ts — auth token injection and 401/refresh handling
 *   lib/api/retry.ts     — exponential backoff utilities
 *
 * New code can import from '@/lib/api' (unchanged) or '@/lib/api/client' directly.
 */

export { api, API_BASE_URL, ApiClient } from './api/client';
