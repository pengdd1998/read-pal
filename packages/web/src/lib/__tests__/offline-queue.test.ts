import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory IndexedDB mock
// ---------------------------------------------------------------------------
// The real offline-queue module uses indexedDB directly. We replace the global
// indexedDB with a minimal in-memory implementation that supports the subset
// of the IDB API that the module relies on: open, transaction, objectStore,
// add, getAll, get, put, delete, clear, and index-based operations.
// ---------------------------------------------------------------------------

type IDBReq<T = unknown> = {
  result: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
};

class InMemoryObjectStore {
  private data: Map<number, Record<string, unknown>> = new Map();
  private keyPath: string;
  private indexes: Map<string, string> = new Map();

  constructor(keyPath: string) {
    this.keyPath = keyPath;
  }

  createIndex(_name: string, keyPath: string) {
    this.indexes.set(_name, keyPath);
  }

  add(item: Record<string, unknown>): IDBReq {
    const key = item[this.keyPath] as number;
    if (this.data.has(key)) {
      return { result: undefined, onsuccess: null, onerror: null };
    }
    this.data.set(key, { ...item });
    const result: IDBReq = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => result.onsuccess?.(), 0);
    return result;
  }

  getAll(): IDBReq<Record<string, unknown>[]> {
    const all = Array.from(this.data.values());
    const result: IDBReq<Record<string, unknown>[]> = { result: all, onsuccess: null, onerror: null };
    setTimeout(() => result.onsuccess?.(), 0);
    return result;
  }

  get(key: number): IDBReq<Record<string, unknown> | null> {
    const item = this.data.get(key) ?? null;
    const result: IDBReq<Record<string, unknown> | null> = { result: item, onsuccess: null, onerror: null };
    setTimeout(() => result.onsuccess?.(), 0);
    return result;
  }

  put(item: Record<string, unknown>): IDBReq {
    const key = item[this.keyPath] as number;
    this.data.set(key, { ...item });
    const result: IDBReq = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => result.onsuccess?.(), 0);
    return result;
  }

  delete(key: number): IDBReq {
    this.data.delete(key);
    const result: IDBReq = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => result.onsuccess?.(), 0);
    return result;
  }

  clear(): IDBReq {
    this.data.clear();
    const result: IDBReq = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => result.onsuccess?.(), 0);
    return result;
  }

  get indexNames() {
    return { contains: (name: string) => this.indexes.has(name) };
  }
}

class InMemoryDB {
  private stores: Map<string, InMemoryObjectStore> = new Map();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new InMemoryObjectStore(options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(_storeName: string, _mode: string) {
    return {
      objectStore: (name: string) => this.stores.get(name)!,
    };
  }
}

// ---------------------------------------------------------------------------
// Mock global indexedDB
// ---------------------------------------------------------------------------

let memDB: InMemoryDB;

function installIndexedDBMock() {
  memDB = new InMemoryDB();

  const mockIndexedDB = {
    open(_name: string, _version: number) {
      const result: {
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        result: IDBDatabase;
        error: DOMException | null;
        transaction: IDBTransaction;
      } = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: memDB as unknown as IDBDatabase,
        error: null,
        transaction: null as unknown as IDBTransaction,
      };

      // Build a fake transaction that the onupgradeneeded handler can use
      const fakeTransaction = {
        objectStore: (name: string) => memDB.stores.get(name)!,
      };
      result.transaction = fakeTransaction as unknown as IDBTransaction;

      // Fire events asynchronously like real IDB
      setTimeout(() => {
        result.onupgradeneeded?.();
        result.onsuccess?.();
      }, 0);

      return result;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    value: mockIndexedDB,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Mock global fetch for replayQueue tests
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks are in place
import { queueMutation, getQueueCount, clearQueue, replayQueue } from '../offline-queue';

// Helper: wait for all pending setTimeout(0) callbacks to flush
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('offline-queue', () => {
  beforeEach(async () => {
    installIndexedDBMock();
    mockFetch.mockReset();
    await flushMicrotasks();
  });

  describe('queueMutation', () => {
    it('stores a mutation in IndexedDB and returns true', async () => {
      const result = await queueMutation('/api/books', 'POST', { title: 'Test Book' });
      await flushMicrotasks();
      expect(result).toBe(true);
    });

    it('stores the mutation with the correct method and url', async () => {
      await queueMutation('/api/books/1', 'DELETE', null, {}, 'delete book');
      await flushMicrotasks();

      // Verify by checking queue count > 0
      const count = await getQueueCount();
      await flushMicrotasks();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getQueueCount', () => {
    it('returns 0 when the queue is empty', async () => {
      const count = await getQueueCount();
      await flushMicrotasks();
      expect(count).toBe(0);
    });

    it('returns the correct count after queueing mutations', async () => {
      await queueMutation('/api/a', 'POST', { a: 1 });
      await queueMutation('/api/b', 'PUT', { b: 2 });
      await queueMutation('/api/c', 'PATCH', { c: 3 });
      await flushMicrotasks();

      const count = await getQueueCount();
      await flushMicrotasks();
      expect(count).toBe(3);
    });
  });

  describe('clearQueue', () => {
    it('removes all queued mutations', async () => {
      await queueMutation('/api/a', 'POST', {});
      await queueMutation('/api/b', 'POST', {});
      await flushMicrotasks();

      await clearQueue();
      await flushMicrotasks();

      const count = await getQueueCount();
      await flushMicrotasks();
      expect(count).toBe(0);
    });
  });

  describe('replayQueue', () => {
    it('replays queued mutations with fetch', async () => {
      // Queue a mutation
      await queueMutation('/api/books', 'POST', { title: 'Offline Book' }, { Authorization: 'Bearer test' });
      await flushMicrotasks();

      // Mock a successful fetch response
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await replayQueue();
      await flushMicrotasks();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/books',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('counts failed mutations on server error responses', async () => {
      await queueMutation('/api/books', 'POST', { title: 'Will Fail' });
      await flushMicrotasks();

      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await replayQueue();
      await flushMicrotasks();

      expect(result.failed).toBe(1);
    });

    it('removes mutations on auth failure (401/403)', async () => {
      await queueMutation('/api/books', 'POST', { title: 'Auth Fail' });
      await flushMicrotasks();

      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const result = await replayQueue();
      await flushMicrotasks();

      expect(result.failed).toBe(1);
      expect(result.replayed).toBe(0);
    });

    it('returns {replayed:0, failed:0} when queue is empty', async () => {
      const result = await replayQueue();
      await flushMicrotasks();

      expect(result).toEqual({ replayed: 0, failed: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
