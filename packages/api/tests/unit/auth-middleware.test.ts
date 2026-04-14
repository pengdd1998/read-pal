/**
 * Auth Middleware Unit Tests
 */

import { authenticate, optionalAuthenticate, requirePermission, type AuthRequest } from '../../src/middleware/auth';
import { User } from '../../src/models';
import { generateToken } from '../../src/utils/auth';
import { type Response, type NextFunction } from 'express';

function mockReq(token?: string): AuthRequest {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as AuthRequest;
  return req;
}

function mockRes(): { res: Response; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, json, status };
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject request with no auth header', async () => {
    const req = mockReq();
    const { res, status } = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('should reject request with invalid header format', async () => {
    const req = { headers: { authorization: 'Basic abc123' } } as AuthRequest;
    const { res, status } = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('should reject request with empty Bearer token', async () => {
    const req = { headers: { authorization: 'Bearer ' } } as AuthRequest;
    const { res, status } = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('should reject request with invalid JWT token', async () => {
    const req = mockReq('invalid.jwt.token');
    const { res, status, json } = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INVALID_TOKEN' }),
      }),
    );
  });

  it('should reject request when user not found in DB', async () => {
    const token = generateToken('deleted-user-id');
    const req = mockReq(token);
    const { res, status, json } = mockRes();
    const next = jest.fn();

    // Default mock returns null for findByPk
    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      }),
    );
  });

  it('should authenticate valid token and attach user', async () => {
    const userId = 'valid-user-id';
    const token = generateToken(userId);
    const req = mockReq(token);
    const { res } = mockRes();
    const next = jest.fn();

    // Mock User.findByPk to return a user
    (User.findByPk as jest.Mock).mockResolvedValueOnce({
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(userId);
    expect(req.user).toEqual({
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
    });
  });
});

describe('optionalAuthenticate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call next() without user when no auth header', () => {
    const req = mockReq();
    const { res } = mockRes();
    const next = jest.fn();

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
  });

  it('should attach user when valid token is present', () => {
    const userId = 'opt-user-id';
    const token = generateToken(userId);
    const req = mockReq(token);
    const { res } = mockRes();
    const next = jest.fn();

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(userId);
  });

  it('should call next() even with invalid token', () => {
    const req = mockReq('invalid-token');
    const { res } = mockRes();
    const next = jest.fn();

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requirePermission middleware', () => {
  it('should reject when no user is set', () => {
    const req = {} as AuthRequest;
    const { res, status } = mockRes();
    const next = jest.fn();

    requirePermission('admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('should call next() when user is set', () => {
    const req = { user: { id: 'u1', email: 'e@e.com', name: 'n' } } as AuthRequest;
    const { res } = mockRes();
    const next = jest.fn();

    requirePermission('read')(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
