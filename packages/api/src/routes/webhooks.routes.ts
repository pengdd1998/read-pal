/**
 * Webhook Routes — CRUD + test endpoint for webhook management
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { Webhook, isValidWebhookEvent, getValidWebhookEvents, WebhookEvent } from '../models/Webhook';
import { WebhookDeliveryLog } from '../models/WebhookDeliveryLog';
import { AuthRequest, authenticate } from '../middleware/auth';
import { parsePagination } from '../utils/pagination';

const router: Router = Router();

/**
 * GET /api/webhooks — List user's webhooks
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const webhooks = await Webhook.findAll({
      where: { userId: req.userId! },
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['secret'] },
    });

    res.json({ success: true, data: { webhooks } });
  } catch (error) {
    console.error('List webhooks error:', error);
    res.status(500).json({ success: false, error: { code: 'LIST_ERROR', message: 'Failed to list webhooks' } });
  }
});

/**
 * POST /api/webhooks — Create webhook
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { url, events } = req.body as { url: string; events: string[] };

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'url and events[] are required' },
      });
      return;
    }

    // Validate events
    for (const ev of events) {
      if (!isValidWebhookEvent(ev)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_EVENT', message: `Invalid event type: ${ev}. Valid: ${getValidWebhookEvents().join(', ')}` },
        });
        return;
      }
    }

    // Limit webhooks per user
    const count = await Webhook.count({ where: { userId: req.userId! } });
    if (count >= 10) {
      res.status(400).json({
        success: false,
        error: { code: 'LIMIT', message: 'Maximum 10 webhooks per user' },
      });
      return;
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await Webhook.create({
      userId: req.userId!,
      url,
      events: events as WebhookEvent[],
      secret,
    });

    // Return secret only on creation
    res.status(201).json({
      success: true,
      data: {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret, // shown once
          isActive: webhook.isActive,
          createdAt: webhook.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Create webhook error:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: 'Failed to create webhook' } });
  }
});

/**
 * PATCH /api/webhooks/:id — Update webhook
 */
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const webhook = await Webhook.findOne({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!webhook) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body.url) updates.url = req.body.url;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    if (Array.isArray(req.body.events)) {
      for (const ev of req.body.events) {
        if (!isValidWebhookEvent(ev)) {
          res.status(400).json({ success: false, error: { code: 'INVALID_EVENT', message: `Invalid event: ${ev}` } });
          return;
        }
      }
      updates.events = req.body.events;
    }

    await webhook.update(updates);

    res.json({
      success: true,
      data: {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          isActive: webhook.isActive,
          lastDeliveryAt: webhook.lastDeliveryAt,
          lastDeliveryStatus: webhook.lastDeliveryStatus,
          failureCount: webhook.failureCount,
          updatedAt: webhook.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Update webhook error:', error);
    res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: 'Failed to update webhook' } });
  }
});

/**
 * DELETE /api/webhooks/:id — Delete webhook
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Webhook.destroy({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: 'Failed to delete webhook' } });
  }
});

/**
 * POST /api/webhooks/:id/test — Send test ping
 */
router.post('/:id/test', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { testWebhook } = await import('../services/WebhookDelivery');
    const webhook = await Webhook.findOne({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!webhook) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    const result = await testWebhook(webhook);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({ success: false, error: { code: 'TEST_ERROR', message: 'Failed to test webhook' } });
  }
});

/**
 * GET /api/webhooks/events — List available event types
 */
router.get('/events', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: { events: getValidWebhookEvents() } });
});

/**
 * GET /api/webhooks/:id/deliveries — Get delivery logs for a webhook
 */
router.get('/:id/deliveries', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const webhook = await Webhook.findOne({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!webhook) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    const { limit, offset } = parsePagination(req, 20);

    const { rows: deliveries, count: total } = await WebhookDeliveryLog.findAndCountAll({
      where: { webhookId: webhook.id },
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 50),
      offset,
    });

    res.json({
      success: true,
      data: {
        deliveries,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({ success: false, error: { code: 'DELIVERIES_ERROR', message: 'Failed to fetch delivery logs' } });
  }
});

export default router;
