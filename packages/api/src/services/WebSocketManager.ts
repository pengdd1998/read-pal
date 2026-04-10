/**
 * WebSocket Streaming Service
 *
 * Provides real-time streaming of agent responses to connected clients.
 * Uses the 'ws' library for WebSocket support with heartbeat and reconnection.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import { verifyToken } from '../utils/auth';

// ============================================================================
// Types
// ============================================================================

export interface StreamMessage {
  type: 'token' | 'agent_start' | 'agent_end' | 'complete' | 'error' | 'heartbeat';
  data?: any;
  timestamp: number;
}

export interface StreamClient {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  connectedAt: Date;
  isAlive: boolean;
}

interface StreamChunk {
  agentName: string;
  content: string;
  tokenIndex: number;
}

// ============================================================================
// WebSocket Manager
// ============================================================================

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, StreamClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the WebSocket server on top of an existing HTTP server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/agents',
      // Verify origin for security
      verifyClient: (info: { req: IncomingMessage }, callback: (ok: boolean, code?: number, reason?: string) => void) => {
        try {
          const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
          const token = url.searchParams.get('token');

          if (!token) {
            callback(false, 401, 'Unauthorized: No token provided');
            return;
          }

          const decoded = verifyToken(token);
          if (!decoded) {
            callback(false, 401, 'Unauthorized: Invalid token');
            return;
          }

          // Attach userId to the request for use in the connection handler
          (info.req as { userId?: string }).userId = decoded.userId;
          callback(true);
        } catch {
          callback(false, 401, 'Unauthorized: Token verification failed');
        }
      },
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const userId = (req as { userId?: string }).userId || '';
      const clientId = this.generateClientId();

      const client: StreamClient = {
        ws,
        userId,
        sessionId: clientId,
        connectedAt: new Date(),
        isAlive: true,
      };

      this.clients.set(clientId, client);
      console.log(`[WS] Client connected: ${clientId} (user: ${userId})`);

      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data.toString());
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WS] Client disconnected: ${clientId}`);
      });

      ws.on('error', (error: Error) => {
        console.error(`[WS] Client error (${clientId}):`, error.message);
        this.clients.delete(clientId);
      });

      // Send welcome message
      this.send(clientId, {
        type: 'heartbeat',
        data: { message: 'Connected to read-pal agent streaming' },
        timestamp: Date.now(),
      });
    });

    // Start heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const client = this.findClientByWs(ws);
        if (!client) return;

        if (!client.isAlive) {
          console.log(`[WS] Terminating dead connection: ${client.sessionId}`);
          this.clients.delete(client.sessionId);
          return ws.terminate();
        }

        client.isAlive = false;
        ws.ping();
      });
    }, 30_000); // 30 second heartbeat

    console.log('[WS] WebSocket server initialized on /ws/agents');
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(clientId: string, raw: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(raw);

      switch (message.type) {
        case 'ping':
          this.send(clientId, { type: 'heartbeat', timestamp: Date.now() });
          break;
        default:
          console.warn(`[WS] Unknown message type: ${message.type}`);
      }
    } catch {
      console.warn(`[WS] Invalid message from ${clientId}`);
    }
  }

  /**
   * Stream agent response tokens to a specific client
   */
  streamToClient(clientId: string, chunks: StreamChunk[]): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    for (const chunk of chunks) {
      this.send(clientId, {
        type: 'token',
        data: {
          agentName: chunk.agentName,
          content: chunk.content,
          tokenIndex: chunk.tokenIndex,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Broadcast agent start event
   */
  notifyAgentStart(clientId: string, agentName: string, query: string): void {
    this.send(clientId, {
      type: 'agent_start',
      data: { agentName, query },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast agent completion event
   */
  notifyAgentComplete(
    clientId: string,
    agentName: string,
    duration: number,
    tokenCount?: number,
  ): void {
    this.send(clientId, {
      type: 'agent_end',
      data: { agentName, duration, tokenCount },
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast full completion with final content
   */
  notifyComplete(clientId: string, content: string, metadata?: any): void {
    this.send(clientId, {
      type: 'complete',
      data: { content, metadata },
      timestamp: Date.now(),
    });
  }

  /**
   * Send error to client
   */
  notifyError(clientId: string, error: string, code?: string): void {
    this.send(clientId, {
      type: 'error',
      data: { error, code },
      timestamp: Date.now(),
    });
  }

  /**
   * Send a message to a specific client
   */
  private send(clientId: string, message: StreamMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`[WS] Failed to send to ${clientId}:`, error);
    }
  }

  /**
   * Find a client by their WebSocket instance
   */
  private findClientByWs(ws: WebSocket): StreamClient | undefined {
    for (const client of this.clients.values()) {
      if (client.ws === ws) return client;
    }
    return undefined;
  }

  /**
   * Get a client ID by user ID (most recent connection)
   */
  getClientByUserId(userId: string): StreamClient | undefined {
    for (const client of this.clients.values()) {
      if (client.userId === userId) return client;
    }
    return undefined;
  }

  /**
   * Get connected client count
   */
  getConnectedCount(): number {
    return this.clients.size;
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Clean shutdown
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [clientId, client] of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    console.log('[WS] WebSocket server shut down');
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
