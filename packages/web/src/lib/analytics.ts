/**
 * Lightweight PostHog-compatible analytics client.
 *
 * Uses fetch directly — no external SDK. All calls are no-ops when
 * NEXT_PUBLIC_POSTHOG_KEY is not set (dev / self-hosted without analytics).
 */

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

interface AnalyticsClient {
  identify: (userId: string, traits?: AnalyticsProperties) => void;
  track: (event: string, properties?: AnalyticsProperties) => void;
  page: (name?: string, properties?: AnalyticsProperties) => void;
}

const POSTHOG_KEY = typeof window !== 'undefined'
  ? process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
  : '';

const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Generate a transient distinct_id (persists in sessionStorage for the session). */
function getDistinctId(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'rp_anon_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

let _identifiedId: string | null = null;

/** Internal: send a batch to PostHog /capture. */
function capture(payload: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;

  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      ...payload,
    }),
    keepalive: true,
  }).catch(() => {
    // Swallow — analytics must never break the app.
  });
}

/**
 * Identify a user. Call once after registration / login.
 * Subsequent track() calls will be associated with this userId.
 */
function identify(userId: string, traits?: AnalyticsProperties): void {
  if (!POSTHOG_KEY) return;
  _identifiedId = userId;

  capture({
    event: '$identify',
    properties: {
      distinct_id: userId,
      $set: traits || {},
      $device_id: getDistinctId(),
    },
  });
}

/**
 * Track a custom event.
 *
 * @param event       - Event name (e.g. 'book_opened')
 * @param properties  - Optional metadata
 */
function track(event: string, properties?: AnalyticsProperties): void {
  if (!POSTHOG_KEY) return;

  capture({
    event,
    properties: {
      distinct_id: _identifiedId || getDistinctId(),
      ...properties,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Track a page view. Call from route-change-aware code.
 */
function page(name?: string, properties?: AnalyticsProperties): void {
  if (!POSTHOG_KEY) return;

  capture({
    event: '$pageview',
    properties: {
      distinct_id: _identifiedId || getDistinctId(),
      $current_url: typeof window !== 'undefined' ? window.location.href : '',
      $pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      $title: name || (typeof document !== 'undefined' ? document.title : ''),
      ...properties,
      timestamp: new Date().toISOString(),
    },
  });
}

export const analytics: AnalyticsClient = { identify, track, page };
