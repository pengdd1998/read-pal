/**
 * Validate Middleware Unit Tests
 */

import { validate } from '../../src/middleware/validate';
import { body, query } from 'express-validator';
import { type Request, type Response, type NextFunction } from 'express';

function mockReq(body: Record<string, unknown> = {}, query: Record<string, unknown> = {}): Request {
  return { body, query } as unknown as Request;
}

function mockRes(): Response {
  const res = { statusCode: 200, json: jest.fn(), status: jest.fn() } as unknown as Response;
  (res as unknown as { status: jest.Mock }).status.mockReturnValue(res);
  return res;
}

describe('validate middleware', () => {
  it('should call next() when validation passes', async () => {
    const req = mockReq({ email: 'test@example.com' });
    const res = mockRes();
    const next = jest.fn();

    const middleware = validate([body('email').isEmail()]);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should return 400 with errors when validation fails', async () => {
    const req = mockReq({ email: 'not-an-email' });
    const res = mockRes();
    const next = jest.fn();

    const middleware = validate([body('email').isEmail()]);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
        }),
      }),
    );
  });

  it('should include validation details in error response', async () => {
    const req = mockReq({ email: 'bad' });
    const res = mockRes();
    const next = jest.fn();

    const middleware = validate([body('email').isEmail()]);
    await middleware(req, res, next);

    const call = (res.json as jest.Mock).mock.calls[0][0];
    expect(call.error.details).toBeDefined();
    expect(call.error.details.length).toBeGreaterThan(0);
  });

  it('should handle multiple validation rules', async () => {
    const req = mockReq({ name: '', email: 'bad' });
    const res = mockRes();
    const next = jest.fn();

    const middleware = validate([
      body('name').trim().isLength({ min: 1 }),
      body('email').isEmail(),
    ]);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const call = (res.json as jest.Mock).mock.calls[0][0];
    // Both fields should have errors
    expect(call.error.details.length).toBeGreaterThanOrEqual(2);
  });

  it('should pass with query validation', async () => {
    const req = mockReq({}, { page: '5' });
    const res = mockRes();
    const next = jest.fn();

    const middleware = validate([query('page').isInt()]);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should handle empty validation chain', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    const middleware = validate([]);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
