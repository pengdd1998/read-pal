/**
 * API client barrel — re-exports for backward compatibility.
 *
 * All existing imports from '@/lib/api' continue to work:
 *   import { api, API_BASE_URL } from '@/lib/api';
 */

export { api, API_BASE_URL } from './client';
export { ApiClient } from './client';
