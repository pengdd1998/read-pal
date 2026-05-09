import * as SQLite from 'expo-sqlite';

const DB_NAME = 'readpal_offline.db';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS book_content (
        bookId TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        chapters TEXT NOT NULL,
        cachedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mutations_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        method TEXT NOT NULL,
        body TEXT,
        headers TEXT,
        createdAt INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export async function cacheBookContent(
  bookId: string,
  title: string,
  chapters: unknown[],
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO book_content (bookId, title, chapters, cachedAt) VALUES (?, ?, ?, ?)`,
    [bookId, title, JSON.stringify(chapters), Date.now()],
  );
}

export async function getCachedBookContent(bookId: string): Promise<{
  title: string;
  chapters: unknown[];
} | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ title: string; chapters: string }>(
    'SELECT title, chapters FROM book_content WHERE bookId = ?',
    [bookId],
  );
  if (!row) return null;
  return { title: row.title, chapters: JSON.parse(row.chapters) };
}

export async function queueOfflineMutation(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT INTO mutations_queue (url, method, body, headers, createdAt) VALUES (?, ?, ?, ?, ?)',
    [url, method, body ? JSON.stringify(body) : null, headers ? JSON.stringify(headers) : null, Date.now()],
  );
}

export async function flushMutationQueue(
  executeRequest: (url: string, method: string, body?: unknown, headers?: Record<string, string>) => Promise<void>,
): Promise<number> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    id: number; url: string; method: string; body: string | null; headers: string | null;
  }>('SELECT * FROM mutations_queue ORDER BY createdAt ASC');

  let flushed = 0;
  for (const row of rows) {
    try {
      await executeRequest(
        row.url,
        row.method,
        row.body ? JSON.parse(row.body) : undefined,
        row.headers ? JSON.parse(row.headers) : undefined,
      );
      await database.runAsync('DELETE FROM mutations_queue WHERE id = ?', [row.id]);
      flushed++;
    } catch {
      break; // Stop on first failure, retry later
    }
  }
  return flushed;
}

export async function getMutationQueueSize(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM mutations_queue');
  return row?.count || 0;
}
