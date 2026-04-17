/**
 * Webhook Delivery Service
 *
 * Handles delivery of webhook events with HMAC signing and retry logic.
 */

import crypto from 'node:crypto';
import { Webhook, WebhookEvent } from '../models/Webhook';

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Sign a payload with HMAC-SHA256.
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver a single webhook event.
 * Returns HTTP status code or -1 on network error.
 */
async function deliverOne(
  webhook: Webhook,
  payload: WebhookPayload,
): Promise<{ status: number; durationMs: number }> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, webhook.secret);

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
        'User-Agent': 'read-pal-webhook/1.0',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - start;

    // Update webhook delivery status
    await webhook.update({
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: response.status,
      failureCount: response.ok ? 0 : webhook.failureCount + 1,
    });

    return { status: response.status, durationMs };
  } catch {
    const durationMs = Date.now() - start;
    await webhook.update({
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: -1,
      failureCount: webhook.failureCount + 1,
    });
    return { status: -1, durationMs };
  }
}

/**
 * Dispatch an event to all matching active webhooks for a user.
 * Called from business logic after relevant actions.
 */
export async function dispatchWebhook(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const webhooks = await Webhook.findAll({
      where: {
        userId,
        isActive: true,
      },
    });

    const matching = webhooks.filter((w) => {
      const events = w.events as WebhookEvent[];
      return events.includes(event);
    });

    if (matching.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Deliver in parallel — fire and forget
    await Promise.allSettled(
      matching.map((webhook) => deliverOne(webhook, payload)),
    );
  } catch (err) {
    console.error('[WebhookDelivery] dispatch failed:', err);
  }
}

/**
 * Test a webhook by sending a ping event.
 */
export async function testWebhook(webhook: Webhook): Promise<{ success: boolean; status: number; durationMs: number }> {
  const result = await deliverOne(webhook, {
    event: 'book.started' as WebhookEvent,
    timestamp: new Date().toISOString(),
    data: { test: true, message: 'ping from read-pal' },
  });

  return {
    success: result.status >= 200 && result.status < 300,
    ...result,
  };
}

/**
 * Disable webhooks that have failed too many times (>= 10).
 * Call periodically to clean up broken endpoints.
 */
export async function disableFailingWebhooks(): Promise<number> {
  const [count] = await Webhook.update(
    { isActive: false },
    { where: { failureCount: { gte: 10 }, isActive: true } },
  );
  return count;
}
