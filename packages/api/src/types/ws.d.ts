declare module 'ws' {
  import type { Server } from 'http';

  export class WebSocket {
    static OPEN: number;
    static CLOSED: number;
    static CLOSING: number;
    static CONNECTING: number;

    readyState: number;

    on(event: 'pong', listener: () => void): this;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: (code: number, reason: string) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;

    ping(): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
  }

  export interface WebSocketServerOptions {
    server?: Server;
    path?: string;
    verifyClient?: (
      info: { origin: string; secure: boolean; req: any },
      callback: (verified: boolean, code?: number, message?: string) => void
    ) => void;
  }

  export class WebSocketServer {
    clients: Set<WebSocket>;
    constructor(options: WebSocketServerOptions);
    on(event: 'connection', listener: (ws: WebSocket, req: any) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    close(): void;
  }
}
