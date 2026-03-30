/**
 * WebSocket client for real-time agent communication
 * Connects to the read-pal API WebSocket endpoint for streaming agent responses
 */

type WebSocketMessage = {
  type: 'agent_start' | 'agent_complete' | 'token_start' | 'token' | 'error' | 'connected' | 'disconnected';
  agentName?: string;
  content?: string;
  done?: boolean;
};

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    this.url = apiUrl.replace('http', 'ws').replace('https', 'wss') + '/ws/agents';
  }

  connect(token: string): void {
    this.token = token;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }

    try {
      const protocol = this.url.startsWith('wss') ? 'wss' : 'ws';
      this.ws = new WebSocket(`${protocol}://${this.url.replace(/^(wss?):\/\//, '')}`, ['Bearer', token]);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notify({ type: 'connected' });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.notify(data);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.notify({ type: 'disconnected' });
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        this.attemptReconnect();
      };
    } catch {
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
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
    }
  }

  private notify(message: WebSocketMessage): void {
    this.handlers.forEach(handler => handler(message));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (this.token) this.connect(this.token);
    }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000));
  }
}

export const wsClient = new WebSocketClient();
