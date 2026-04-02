/**
 * WebSocket client for real-time agent communication
 * Connects to the read-pal API WebSocket endpoint for streaming agent responses
 *
 * Improvements over naive WS client:
 *  - Exponential backoff with jitter for reconnection
 *  - Auth token refresh on reconnect
 *  - Proper cleanup (no leaked timers / stale handlers)
 *  - Offline message queue flushed on reconnect
 */

type WebSocketMessage = {
  type: 'agent_start' | 'agent_complete' | 'token_start' | 'token' | 'error' | 'connected' | 'disconnected';
  agentName?: string;
  content?: string;
  done?: boolean;
};

type MessageHandler = (message: WebSocketMessage) => void;

/** Messages queued while the socket is offline. */
interface QueuedMessage {
  data: Record<string, unknown>;
  queuedAt: number;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: QueuedMessage[] = [];
  private disposed = false;

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    // Use current host for WebSocket if no explicit API URL
    const wsBase = apiUrl
      ? apiUrl.replace('http', 'ws').replace('https', 'wss')
      : `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}`;
    this.url = wsBase + '/ws/agents';
  }

  connect(token: string): void {
    this.token = token;
    this.disposed = false;

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Already connected with a potentially stale token; close gracefully
        this.ws.close(4001, 'reconnect');
      }
      this.ws = null;
    }

    this.clearReconnectTimer();

    try {
      const protocol = this.url.startsWith('wss') ? 'wss' : 'ws';
      const host = this.url.replace(/^(wss?):\/\//, '');
      this.ws = new WebSocket(`${protocol}://${host}?token=${encodeURIComponent(token)}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.flushQueue();
        this.notify({ type: 'connected' });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string);
          this.notify(data);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.notify({ type: 'disconnected' });
        // Code 4001 = intentional reconnect, still attempt reconnect with fresh token
        if (!this.disposed) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect
      };
    } catch {
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    this.messageQueue = [];
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
    this.handlers.clear();
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  offMessage(handler: MessageHandler): void {
    this.handlers.delete(handler);
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      // Queue for later delivery
      this.messageQueue.push({ data, queuedAt: Date.now() });
      // Trim queue to prevent unbounded growth
      if (this.messageQueue.length > 100) {
        this.messageQueue = this.messageQueue.slice(-50);
      }
    }
  }

  private notify(message: WebSocketMessage): void {
    this.handlers.forEach((handler) => handler(message));
  }

  /** Flush queued messages once the socket is open. */
  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift()!;
      // Discard messages older than 5 minutes
      if (Date.now() - item.queuedAt < 5 * 60 * 1000) {
        this.send(item.data);
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Reconnect with exponential backoff + full-jitter.
   * Base delay: 1 s, max: 30 s, capped at maxReconnectAttempts.
   */
  private attemptReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    const baseDelay = 1000;
    const maxDelay = 30000;
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
    // Full jitter: randomise between 0 and exponentialDelay
    const delay = Math.floor(Math.random() * exponentialDelay);

    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) return;

      // Refresh token from storage before reconnecting
      const freshToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (freshToken) {
        this.token = freshToken;
      }

      if (this.token) {
        this.connect(this.token);
      }
    }, delay);
  }
}

export const wsClient = new WebSocketClient();
