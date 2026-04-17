/**
 * API Key Routes — Manage personal access tokens
 */

import { Router, type Request, type Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { ApiKey, generateApiKey } from '../models/ApiKey';

const router: Router = Router();

// List user's API keys (masked)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const keys = await ApiKey.findAll({
      where: { userId: req.userId },
      attributes: ['id', 'name', 'keyPrefix', 'lastUsedAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: keys });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch API keys' } });
  }
});

// Create a new API key
router.post('/', authenticate, rateLimiter({ windowMs: 60000, max: 10 }), async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Name is required' } });
      return;
    }

    // Limit to 5 active keys per user
    const count = await ApiKey.count({ where: { userId: req.userId } });
    if (count >= 5) {
      res.status(400).json({ success: false, error: { code: 'LIMIT', message: 'Maximum 5 API keys allowed' } });
      return;
    }

    const { plainKey, keyHash, keyPrefix } = generateApiKey();

    const apiKey = await ApiKey.create({
      userId: req.userId!,
      name: name.trim(),
      keyHash,
      keyPrefix,
    });

    // Return the plain key only on creation — never stored and can't be retrieved again
    res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: plainKey,
        keyPrefix,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: 'Failed to create API key' } });
  }
});

// Revoke (delete) an API key
router.delete('/:id', authenticate, rateLimiter({ windowMs: 60000, max: 20 }), async (req: AuthRequest, res) => {
  try {
    const deleted = await ApiKey.destroy({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
      return;
    }

    res.json({ success: true, data: { revoked: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: 'Failed to revoke API key' } });
  }
});

export default router;
