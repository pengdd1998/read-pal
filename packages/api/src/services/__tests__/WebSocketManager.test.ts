/**
 * Unit tests for WebSocketManager.ts
 *
 * Tests WebSocket server lifecycle, client management, message handling,
 * streaming, notifications, heartbeat, and shutdown.
 * All external deps (ws, http, auth) are mocked.
 */

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyToken = jest.fn();
jest.mock('../../utils/auth', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// Mock WebSocket class
class MockWebSocket extends EventEmitter {
  public readyState = 1; // WebSocket.OPEN
  public sent: string[] = [];
  public pingCount = 0;
  public closeCode?: number;
  public closeReason?: string;
  public terminated = false;

  send(data: string, cb?: (err?: Error) => void) {
    this.sent.push(data);
    cb?.();
  }

  ping() {
    this.pingCount++;
  }

  close(code?: number, reason?: string) {
    this.readyState = 3; // WebSocket.CLOSED
    this.closeCode = code;
    this.closeReason = reason;
  }

  terminate() {
    this.terminated = true;
    this.readyState = 3;
  }

  // Simulate receiving a message
  receiveMessage(data: string) {
    this.emit('message', Buffer.from(data));
  }

  // Simulate pong response
  pong() {
    this.emit('pong');
  }

  // Simulate close
  doClose() {
    this.readyState = 3;
    this.emit('close');
  }

  // Simulate error
  doError(error: Error) {
    this.emit('error', error);
  }
}

interface VerifyClientInfo {
  req: {
    url: string;
    headers: { host: string };
    userId?: string;
  };
}

interface MockWSS extends EventEmitter {
  clients: Set<MockWebSocket>;
  verifyClientCallback?: (info: VerifyClientInfo, cb: (ok: boolean, code?: number, reason?: string) => void) => void;
  closed: boolean;
  close(): void;
}

const mockWSSInstances: MockWSS[] = [];

jest.mock('ws', () => {
  return {
    WebSocketServer: jest.fn().mockImplementation((options: { verifyClient?: (info: VerifyClientInfo, cb: (ok: boolean, code?: number, reason?: string) => void) => void }) => {
      const wss: MockWSS = new EventEmitter() as MockWSS;
      wss.clients = new Set();
      wss.closed = false;
      wss.verifyClientCallback = options.verifyClient;
      wss.close = jest.fn().mockImplementation(() => { wss.closed = true; });
      mockWSSInstances.push(wss);
      return wss;
    }),
    WebSocket: {
      OPEN: 1,
      CLOSED: 3,
      CONNECTING: 0,
      CLOSING: 2,
    },
  };
});

// Import after mocks
import { WebSocketManager, StreamMessage } from '../WebSocketManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockServer(): { server: EventEmitter } {
  return { server: new EventEmitter() };
}

function parseSentMessage(ws: MockWebSocket, index = 0): StreamMessage {
  return JSON.parse(ws.sent[index]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocketManager', () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWSSInstances.length = 0;
    manager = new WebSocketManager();
  });

  afterEach(() => {
    // Ensure cleanup
    try { manager.shutdown(); } catch { /* already shut down */ }
  });

  // =========================================================================
  // initialize()
  // =========================================================================

  describe('initialize', () => {
    it('should create a WebSocketServer on /ws/agents', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const { WebSocketServer } = require('ws');
      expect(WebSocketServer).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/ws/agents',
          verifyClient: expect.any(Function),
        }),
      );
    });

    it('should accept connection with valid token', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      mockVerifyToken.mockReturnValue({ userId: 'user-123' });

      const wss = mockWSSInstances[0];
      const verifyFn = wss.verifyClientCallback!;

      const info: VerifyClientInfo = {
        req: {
          url: '/ws/agents?token=valid-token',
          headers: { host: 'localhost:3001' },
        },
      };

      const callback = jest.fn();
      verifyFn(info, callback);

      expect(callback).toHaveBeenCalledWith(true);
      expect(info.req.userId).toBe('user-123');
    });

    it('should reject connection without token', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const verifyFn = wss.verifyClientCallback!;

      const info: VerifyClientInfo = {
        req: {
          url: '/ws/agents',
          headers: { host: 'localhost:3001' },
        },
      };

      const callback = jest.fn();
      verifyFn(info, callback);

      expect(callback).toHaveBeenCalledWith(false, 401, 'Unauthorized: No token provided');
    });

    it('should reject connection with invalid token', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      mockVerifyToken.mockReturnValue(null);

      const wss = mockWSSInstances[0];
      const verifyFn = wss.verifyClientCallback!;

      const info: VerifyClientInfo = {
        req: {
          url: '/ws/agents?token=bad-token',
          headers: { host: 'localhost:3001' },
        },
      };

      const callback = jest.fn();
      verifyFn(info, callback);

      expect(callback).toHaveBeenCalledWith(false, 401, 'Unauthorized: Invalid token');
    });

    it('should reject connection when token verification throws', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      mockVerifyToken.mockImplementation(() => { throw new Error('JWT malformed'); });

      const wss = mockWSSInstances[0];
      const verifyFn = wss.verifyClientCallback!;

      const info: VerifyClientInfo = {
        req: {
          url: '/ws/agents?token=malformed',
          headers: { host: 'localhost:3001' },
        },
      };

      const callback = jest.fn();
      verifyFn(info, callback);

      expect(callback).toHaveBeenCalledWith(false, 401, 'Unauthorized: Token verification failed');
    });

    it('should register a new client on connection and send welcome heartbeat', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-456', headers: { host: 'localhost' } };

      // Emit connection event
      wss.emit('connection', ws, req);

      // Client should be tracked
      expect(manager.getConnectedCount()).toBe(1);

      // Welcome message should be sent
      expect(ws.sent.length).toBe(1);
      const welcome = parseSentMessage(ws, 0);
      expect(welcome.type).toBe('heartbeat');
      expect(welcome.data).toEqual({ message: 'Connected to read-pal agent streaming' });
      expect(welcome.timestamp).toBeGreaterThan(0);
    });

    it('should remove client on ws close', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-456', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      expect(manager.getConnectedCount()).toBe(1);

      ws.doClose();
      expect(manager.getConnectedCount()).toBe(0);
    });

    it('should remove client on ws error', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-456', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      expect(manager.getConnectedCount()).toBe(1);

      ws.doError(new Error('Connection reset'));
      expect(manager.getConnectedCount()).toBe(0);
    });
  });

  // =========================================================================
  // handleMessage()
  // =========================================================================

  describe('handleMessage', () => {
    it('should respond to ping with heartbeat', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-789', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);

      // Clear welcome message
      ws.sent.length = 0;

      // Send a ping message
      ws.receiveMessage(JSON.stringify({ type: 'ping' }));

      expect(ws.sent.length).toBe(1);
      const response = parseSentMessage(ws, 0);
      expect(response.type).toBe('heartbeat');
    });

    it('should ignore unknown message types gracefully', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-789', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      ws.sent.length = 0;

      // Unknown type — should not throw, just warn
      ws.receiveMessage(JSON.stringify({ type: 'unknown_type' }));

      expect(ws.sent.length).toBe(0);
    });

    it('should ignore invalid JSON gracefully', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-789', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      ws.sent.length = 0;

      // Invalid JSON — should not throw
      expect(() => {
        ws.receiveMessage('not valid json{{{');
      }).not.toThrow();

      expect(ws.sent.length).toBe(0);
    });
  });

  // =========================================================================
  // streamToClient()
  // =========================================================================

  describe('streamToClient', () => {
    it('should send token messages for each chunk', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-stream', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      ws.sent.length = 0;

      // Find the client ID
      const client = manager.getClientByUserId('user-stream');
      expect(client).toBeDefined();
      const clientId = client!.sessionId;

      manager.streamToClient(clientId, [
        { agentName: 'CompanionAgent', content: 'Hello', tokenIndex: 0 },
        { agentName: 'CompanionAgent', content: ' world', tokenIndex: 1 },
      ]);

      expect(ws.sent.length).toBe(2);

      const msg0 = parseSentMessage(ws, 0);
      expect(msg0.type).toBe('token');
      expect(msg0.data).toEqual({
        agentName: 'CompanionAgent',
        content: 'Hello',
        tokenIndex: 0,
      });

      const msg1 = parseSentMessage(ws, 1);
      expect(msg1.type).toBe('token');
      expect(msg1.data).toEqual({
        agentName: 'CompanionAgent',
        content: ' world',
        tokenIndex: 1,
      });
    });

    it('should do nothing for unknown clientId', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      // Should not throw
      expect(() => {
        manager.streamToClient('nonexistent-client', [
          { agentName: 'Agent', content: 'test', tokenIndex: 0 },
        ]);
      }).not.toThrow();
    });

    it('should do nothing when client ws is not OPEN', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-closed', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      ws.sent.length = 0;

      // Close the WebSocket
      ws.readyState = 3; // CLOSED

      const client = manager.getClientByUserId('user-closed');
      manager.streamToClient(client!.sessionId, [
        { agentName: 'Agent', content: 'test', tokenIndex: 0 },
      ]);

      expect(ws.sent.length).toBe(0);
    });
  });

  // =========================================================================
  // notifyAgentStart / notifyAgentComplete / notifyComplete / notifyError
  // =========================================================================

  describe('notification methods', () => {
    let clientId: string;
    let ws: MockWebSocket;

    beforeEach(() => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      ws = new MockWebSocket();
      const req = { userId: 'user-notif', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);
      ws.sent.length = 0;

      const client = manager.getClientByUserId('user-notif');
      clientId = client!.sessionId;
    });

    it('notifyAgentStart should send agent_start message', () => {
      manager.notifyAgentStart(clientId, 'CompanionAgent', 'What is quantum entanglement?');

      expect(ws.sent.length).toBe(1);
      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('agent_start');
      expect(msg.data).toEqual({
        agentName: 'CompanionAgent',
        query: 'What is quantum entanglement?',
      });
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('notifyAgentComplete should send agent_end message', () => {
      manager.notifyAgentComplete(clientId, 'ResearchAgent', 1500, 42);

      expect(ws.sent.length).toBe(1);
      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('agent_end');
      expect(msg.data).toEqual({
        agentName: 'ResearchAgent',
        duration: 1500,
        tokenCount: 42,
      });
    });

    it('notifyAgentComplete should work without tokenCount', () => {
      manager.notifyAgentComplete(clientId, 'CoachAgent', 3000);

      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('agent_end');
      expect(msg.data).toEqual({
        agentName: 'CoachAgent',
        duration: 3000,
        tokenCount: undefined,
      });
    });

    it('notifyComplete should send complete message with content', () => {
      manager.notifyComplete(clientId, 'Here is the AI response...', { model: 'glm-4' });

      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('complete');
      expect(msg.data).toEqual({
        content: 'Here is the AI response...',
        metadata: { model: 'glm-4' },
      });
    });

    it('notifyComplete should work without metadata', () => {
      manager.notifyComplete(clientId, 'Simple response');

      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('complete');
      expect(msg.data).toEqual({
        content: 'Simple response',
        metadata: undefined,
      });
    });

    it('notifyError should send error message', () => {
      manager.notifyError(clientId, 'API rate limit exceeded', 'RATE_LIMIT');

      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('error');
      expect(msg.data).toEqual({
        error: 'API rate limit exceeded',
        code: 'RATE_LIMIT',
      });
    });

    it('notifyError should work without code', () => {
      manager.notifyError(clientId, 'Something went wrong');

      const msg = parseSentMessage(ws, 0);
      expect(msg.type).toBe('error');
      expect(msg.data).toEqual({
        error: 'Something went wrong',
        code: undefined,
      });
    });

    it('notifications should be no-ops for unknown clientId', () => {
      expect(() => {
        manager.notifyAgentStart('unknown', 'Agent', 'query');
        manager.notifyAgentComplete('unknown', 'Agent', 100);
        manager.notifyComplete('unknown', 'content');
        manager.notifyError('unknown', 'error');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // getClientByUserId()
  // =========================================================================

  describe('getClientByUserId', () => {
    it('should return the client for a known userId', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      const req = { userId: 'user-lookup', headers: { host: 'localhost' } };

      wss.emit('connection', ws, req);

      const client = manager.getClientByUserId('user-lookup');
      expect(client).toBeDefined();
      expect(client!.userId).toBe('user-lookup');
      expect(client!.ws).toBe(ws);
      expect(client!.isAlive).toBe(true);
    });

    it('should return undefined for unknown userId', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const client = manager.getClientByUserId('nonexistent-user');
      expect(client).toBeUndefined();
    });
  });

  // =========================================================================
  // getConnectedCount()
  // =========================================================================

  describe('getConnectedCount', () => {
    it('should return 0 when no clients connected', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      expect(manager.getConnectedCount()).toBe(0);
    });

    it('should return the correct count after connections', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];

      // Connect 3 clients
      for (let i = 0; i < 3; i++) {
        const ws = new MockWebSocket();
        wss.emit('connection', ws, { userId: `user-${i}`, headers: { host: 'localhost' } });
      }

      expect(manager.getConnectedCount()).toBe(3);
    });

    it('should decrease when clients disconnect', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();

      wss.emit('connection', ws, { userId: 'user-1', headers: { host: 'localhost' } });
      expect(manager.getConnectedCount()).toBe(1);

      ws.doClose();
      expect(manager.getConnectedCount()).toBe(0);
    });
  });

  // =========================================================================
  // Heartbeat (pong tracking)
  // =========================================================================

  describe('heartbeat', () => {
    it('should mark client isAlive=true on pong', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws = new MockWebSocket();
      wss.emit('connection', ws, { userId: 'user-hb', headers: { host: 'localhost' } });

      const client = manager.getClientByUserId('user-hb')!;
      expect(client.isAlive).toBe(true);

      // Simulate heartbeat setting isAlive = false (this happens internally)
      client.isAlive = false;

      // Client sends pong
      ws.pong();
      expect(client.isAlive).toBe(true);
    });
  });

  // =========================================================================
  // shutdown()
  // =========================================================================

  describe('shutdown', () => {
    it('should close all client connections with 1001 code', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      wss.emit('connection', ws1, { userId: 'user-1', headers: { host: 'localhost' } });
      wss.emit('connection', ws2, { userId: 'user-2', headers: { host: 'localhost' } });

      expect(manager.getConnectedCount()).toBe(2);

      manager.shutdown();

      expect(ws1.closeCode).toBe(1001);
      expect(ws1.closeReason).toBe('Server shutting down');
      expect(ws2.closeCode).toBe(1001);
      expect(ws2.closeReason).toBe('Server shutting down');
      expect(manager.getConnectedCount()).toBe(0);
    });

    it('should close the WebSocketServer', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      manager.shutdown();

      expect(wss.closed).toBe(true);
    });

    it('should be safe to call shutdown multiple times', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      expect(() => {
        manager.shutdown();
        manager.shutdown();
        manager.shutdown();
      }).not.toThrow();
    });

    it('should work when called without initialize', () => {
      expect(() => {
        manager.shutdown();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // generateClientId()
  // =========================================================================

  describe('client ID generation', () => {
    it('should generate unique IDs for each connection', () => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];

      const clientIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const ws = new MockWebSocket();
        wss.emit('connection', ws, { userId: `user-${i}`, headers: { host: 'localhost' } });
      }

      // All clients should be tracked
      expect(manager.getConnectedCount()).toBe(10);

      // Verify each client has a unique session ID
      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const client = manager.getClientByUserId(`user-${i}`);
        expect(client).toBeDefined();
        expect(seen.has(client!.sessionId)).toBe(false);
        seen.add(client!.sessionId);
        expect(client!.sessionId).toMatch(/^ws_\d+_/);
      }
    });
  });

  // =========================================================================
  // StreamMessage types
  // =========================================================================

  describe('StreamMessage types', () => {
    let clientId: string;
    let ws: MockWebSocket;

    beforeEach(() => {
      const { server } = createMockServer();
      manager.initialize(server as any);

      const wss = mockWSSInstances[0];
      ws = new MockWebSocket();
      wss.emit('connection', ws, { userId: 'user-types', headers: { host: 'localhost' } });
      ws.sent.length = 0;

      const client = manager.getClientByUserId('user-types');
      clientId = client!.sessionId;
    });

    it('should include timestamp in all messages', () => {
      const before = Date.now();

      manager.notifyAgentStart(clientId, 'Agent', 'query');
      manager.notifyError(clientId, 'err');

      const after = Date.now();

      for (const raw of ws.sent) {
        const msg: StreamMessage = JSON.parse(raw);
        expect(msg.timestamp).toBeGreaterThanOrEqual(before);
        expect(msg.timestamp).toBeLessThanOrEqual(after);
      }
    });
  });
});
