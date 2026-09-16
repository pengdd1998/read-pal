/**
 * API client barrel — re-exports for backward compatibility.
 *
 * All existing imports from '@/lib/api/client' continue to work:
 *   import { api, API_BASE_URL } from '@/lib/api/client';
 */

export { api, API_BASE_URL } from './client';
export { ApiClient } from './client';
