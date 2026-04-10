declare module 'epub' {
  interface EpubChapter {
    id: string;
    title: string | undefined;
    src: string | undefined;
  }

  interface EpubMetadata {
    title?: string;
    creator?: string;
    [key: string]: unknown;
  }

  class EPub {
    constructor(filePath: string);
    title: string;
    creator: string;
    chapters: EpubChapter[];
    metadata: EpubMetadata;
    spine: { id?: string; title?: string; href?: string; order?: number }[];
    flow: { id?: string; href?: string; title?: string }[];

    on(event: 'end', callback: () => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    on(event: 'chapter', callback: (data: { id: string; title?: string; content: string }) => void): this;

    parse(): void;
    getChapter(id: string, callback: (err: Error | null, text: string | null) => void): void;
  }

  export = EPub;
}

declare module 'ws' {
  export class WebSocketServer extends EventEmitter {
    constructor(options: { server?: Server; path?: string; verifyClient?: (info: { req: IncomingMessage }, callback: (ok: boolean, code?: number, reason?: string) => void) => void });
    on(event: 'connection', callback: (ws: WebSocket, req: IncomingMessage) => void): this;
    on(event: 'headers', callback: (headers: string[], req: IncomingMessage) => void): this;
    on(event: 'close', callback: () => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    clients: Set<WebSocket>;
    close(callback?: (err?: Error) => void): void;
  }

  export class WebSocket extends EventEmitter {
    static CONNECTING: 0;
    static OPEN: 1;
    static CLOSING: 2;
    static CLOSED: 3;
    readyState: number;
    send(data: Buffer | string, callback?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    ping(data?: Buffer, mask?: boolean, callback?: (err: Error) => void): void;
    pong(data?: Buffer, mask?: boolean, callback?: (err: Error) => void): void;
    on(event: 'message', callback: (data: Buffer) => void): this;
    on(event: 'close', callback: (code: number, reason: string) => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    on(event: 'pong', callback: () => void): this;
    on(event: 'ping', callback: (data: Buffer) => void): this;
  }

  import { EventEmitter } from 'events';
  import { Server, IncomingMessage } from 'http';
}
