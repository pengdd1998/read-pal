'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@read-pal/shared';

/**
 * Centralized data-fetching hook.
 *
 * Replaces the scattered pattern of:
 *   useEffect(() => { api.get(...).then(...).catch(() => {}) }, [])
 *
 * - Handles loading / error states automatically
 * - Silences errors unless `logErrors: true` (prevents console noise from expected 401s etc.)
 * - Supports manual refetch via returned callback
 * - Cancels in-flight requests on unmount
 */

type Status = 'idle' | 'loading' | 'success' | 'error';

export interface UseApiOptions<T> {
  /** Don't auto-fetch on mount — call refetch() manually */
  manual?: boolean;
  /** Log errors to console (default: false for non-critical fetches) */
  logErrors?: boolean;
  /** Transform the API response data before storing */
  transform?: (data: T) => T;
  /** Default value while loading */
  defaultValue?: T;
}

export interface UseApiResult<T> {
  data: T | undefined;
  status: Status;
  loading: boolean;
  error: string | undefined;
  refetch: () => Promise<T | undefined>;
}

export function useApi<T>(
  url: string | null,
  options: UseApiOptions<T> = {},
): UseApiResult<T> {
  const { manual = false, logErrors = false, transform, defaultValue } = options;

  const [data, setData] = useState<T | undefined>(defaultValue);
  const [status, setStatus] = useState<Status>(manual ? 'idle' : 'loading');
  const [error, setError] = useState<string | undefined>();
  const cancelledRef = useRef(false);

  const loading = status === 'loading';

  const fetch = useCallback(async (): Promise<T | undefined> => {
    if (!url) return undefined;

    cancelledRef.current = false;
    setStatus('loading');
    setError(undefined);

    try {
      const res: ApiResponse<T> = await api.get<T>(url);
      if (cancelledRef.current) return undefined;

      if (res.success && res.data !== undefined) {
        const result = transform ? transform(res.data) : res.data;
        setData(result);
        setStatus('success');
        return result;
      }

      // API returned { success: false }
      const msg = res.error?.message || 'Request failed';
      setError(msg);
      setStatus('error');
      if (logErrors) {
        console.warn(`[useApi] ${url}: ${msg}`);
      }
      return undefined;
    } catch (err) {
      if (cancelledRef.current) return undefined;

      const msg = err instanceof Error ? err.message : 'Network error';
      setError(msg);
      setStatus('error');
      if (logErrors) {
        console.warn(`[useApi] ${url}: ${msg}`);
      }
      return undefined;
    }
  }, [url, logErrors, transform]);

  useEffect(() => {
    if (manual || !url) return;

    fetch();

    return () => {
      cancelledRef.current = true;
    };
  }, [fetch, manual, url]);

  return { data, status, loading, error, refetch: fetch };
}

/**
 * Fire-and-forget API call for secondary/non-critical data.
 * Silently handles errors (no console noise).
 * The generic is on the fetch method, not the hook, so you can call
 * fetch<DifferentType> for each background request.
 */
export function useBackgroundApi() {
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const fetch = useCallback(
    <T>(url: string, setter: (data: T) => void): void => {
      api.get<T>(url)
        .then((res) => {
          if (!cancelledRef.current && res.success && res.data !== undefined) {
            setter(res.data);
          }
        });
    },
    [],
  );

  return { fetch };
}
