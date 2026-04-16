/**
 * Rate Limiter Middleware Unit Tests
 *
 * Tests the custom in-memory rate limiter exported from rateLimiter.ts.
 * Does NOT test the express-rate-limit agentRateLimiter (that's a third-party library).
 */

import { rateLimiter } from '../../src/middleware/rateLimiter';
import { type Request, type Response, type NextFunction } from 'express';

function mockReq(ip = '127.0.0.1'): Request {
  return { ip } as unknown as Request;
}

function mockRes(): { res: Response; json: jest.Mock; status: jest.Mock; set: jest.Mock } {
  const json = jest.fn();
  const set = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json, set } as unknown as Response, json, status, set };
}

describe('rateLimiter (custom in-memory)', () => {
  it('should allow first request', () => {
    const req = mockReq();
    const { res } = mockRes();
    const next = jest.fn();

    const middleware = rateLimiter({ windowMs: 60000, max: 5 });
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should allow requests up to the limit', () => {
    const req = mockReq('10.0.0.1');
    const { res } = mockRes();
    const next = jest.fn();

    const middleware = rateLimiter({ windowMs: 60000, max: 3 });

    for (let i = 0; i < 3; i++) {
      middleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it('should block requests exceeding the limit', () => {
    const req = mockReq('10.0.0.2');
    const { res, status, json } = mockRes();
    const next = jest.fn();

    const middleware = rateLimiter({ windowMs: 60000, max: 2 });

    // First 2 should pass
    middleware(req, res, next);
    middleware(req, res, next);

    // Third should be blocked
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
      }),
    );
  });

  it('should use custom key generator', () => {
    const reqA = mockReq('10.0.0.3');
    reqA.headers = { 'x-api-key': 'key-a' };
    const reqB = mockReq('10.0.0.3');
    reqB.headers = { 'x-api-key': 'key-b' };
    const { res } = mockRes();
    const next = jest.fn();

    const middleware = rateLimiter({
      windowMs: 60000,
      max: 1,
      keyGenerator: (req) => (req.headers['x-api-key'] as string) || 'default',
    });

    // key-a: first request passes
    middleware(reqA, res, next);
    // key-b: different key, should also pass
    middleware(reqB, res, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should handle unknown IP gracefully', () => {
    const req = { ip: undefined } as unknown as Request;
    const { res } = mockRes();
    const next = jest.fn();

    const middleware = rateLimiter({ windowMs: 60000, max: 5 });
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
