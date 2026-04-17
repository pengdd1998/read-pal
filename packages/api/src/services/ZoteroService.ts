/**
 * Zotero API Service
 *
 * Integrates with Zotero's REST API to export reading annotations and
 * bibliography entries from read-pal to a user's Zotero library.
 *
 * API docs: https://www.zotero.org/support/dev/web_api/v3/basics
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ZoteroConfig {
  apiKey: string;
  userId: string;
}

interface ZoteroItemData {
  itemType: string;
  title: string;
  [key: string]: unknown;
}

interface ZoteroNote {
  itemType: 'note';
  title: string;
  note: string;
  tags?: Array<{ tag: string }>;
  parentItem?: string;
}

interface ZoteroExportResult {
  bookItemKey: string;
  noteItemKey?: string;
  itemsCreated: number;
}

// ---------------------------------------------------------------------------
// Zotero API Client
// ---------------------------------------------------------------------------

const ZOTERO_API_BASE = 'https://api.zotero.org';

export class ZoteroService {
  private config: ZoteroConfig;

  constructor(config: ZoteroConfig) {
    this.config = config;
  }

  private headers(): Record<string, string> {
    return {
      'Zotero-API-Key': this.config.apiKey,
      'Zotero-API-Version': '3',
      'Content-Type': 'application/json',
    };
  }

  private url(path: string): string {
    return `${ZOTERO_API_BASE}/users/${this.config.userId}${path}`;
  }

  // -------------------------------------------------------------------------
  // Validate API key
  // -------------------------------------------------------------------------

  async validate(): Promise<{ valid: boolean; username?: string; error?: string }> {
    try {
      const res = await fetch(this.url('/keys/current'), {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { valid: false, error: `API returned ${res.status}` };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const access = data.access as Record<string, unknown> | undefined;
      const userAccess = access?.user as Record<string, unknown> | undefined;

      if (!userAccess || !(userAccess.write as boolean)) {
        return { valid: false, error: 'API key lacks write access to user library' };
      }

      return {
        valid: true,
        username: (data.username as string | undefined) ?? (data.displayName as string | undefined),
      };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  // -------------------------------------------------------------------------
  // Create a book item in Zotero
  // -------------------------------------------------------------------------

  async createBook(params: {
    title: string;
    author: string;
    tags?: string[];
    abstractNote?: string;
  }): Promise<string> {
    const itemData: ZoteroItemData = {
      itemType: 'book',
      title: params.title,
      creators: [{ creatorType: 'author', name: params.author }],
      tags: (params.tags || []).map((t) => ({ tag: t })),
      ...(params.abstractNote && { abstractNote: params.abstractNote }),
    };

    const res = await fetch(this.url('/items'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify([itemData]),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Zotero create book failed (${res.status}): ${body}`);
    }

    const results = (await res.json()) as { successful: Record<string, { key: string }> };
    const firstKey = Object.values(results.successful)[0];
    if (!firstKey) {
      throw new Error('Zotero did not return item key');
    }
    return firstKey.key;
  }

  // -------------------------------------------------------------------------
  // Find existing book by title
  // -------------------------------------------------------------------------

  async findBookByTitle(title: string): Promise<string | null> {
    const params = new URLSearchParams({
      q: title,
      itemType: 'book',
      limit: '5',
    });

    const res = await fetch(this.url(`/items?${params}`), {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const items = await res.json() as Array<{ data: { title: string; key: string } }>;
    const match = items.find(
      (item) => item.data.title.toLowerCase() === title.toLowerCase()
    );
    return match?.data.key ?? null;
  }

  // -------------------------------------------------------------------------
  // Create a note attached to a parent item
  // -------------------------------------------------------------------------

  async createNote(note: ZoteroNote): Promise<string> {
    const res = await fetch(this.url('/items'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify([note]),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Zotero create note failed (${res.status}): ${body}`);
    }

    const results = (await res.json()) as { successful: Record<string, { key: string }> };
    const firstKey = Object.values(results.successful)[0];
    if (!firstKey) {
      throw new Error('Zotero did not return note key');
    }
    return firstKey.key;
  }

  // -------------------------------------------------------------------------
  // Export book with annotations to Zotero
  // -------------------------------------------------------------------------

  async exportBookWithAnnotations(params: {
    title: string;
    author: string;
    tags?: string[];
    highlights: Array<{ content: string; chapterIndex?: number; createdAt?: string }>;
    notes: Array<{ content: string; note?: string; chapterIndex?: number; createdAt?: string }>;
  }): Promise<ZoteroExportResult> {
    // Find or create book
    let bookKey = await this.findBookByTitle(params.title);
    if (!bookKey) {
      bookKey = await this.createBook({
        title: params.title,
        author: params.author,
        tags: params.tags,
        abstractNote: `Exported from read-pal reading companion`,
      });
    }

    let noteItemKey: string | undefined;
    const itemsCreated = bookKey ? 1 : 0;

    // Build combined annotation note
    const parts: string[] = [];
    parts.push(`<h1>Reading Notes: ${escapeHtml(params.title)}</h1>`);
    parts.push(`<p><em>Exported from read-pal on ${new Date().toLocaleDateString()}</em></p>`);

    if (params.highlights.length > 0) {
      parts.push('<h2>Highlights</h2>');
      for (const h of params.highlights) {
        const loc = h.chapterIndex != null ? ` (Ch. ${h.chapterIndex + 1})` : '';
        parts.push(`<blockquote>${escapeHtml(h.content)}${loc}</blockquote>`);
      }
    }

    if (params.notes.length > 0) {
      parts.push('<h2>Notes</h2>');
      for (const n of params.notes) {
        const loc = n.chapterIndex != null ? ` (Ch. ${n.chapterIndex + 1})` : '';
        parts.push(`<p><strong>${escapeHtml(n.content)}</strong>${loc}</p>`);
        if (n.note) {
          parts.push(`<p>${escapeHtml(n.note)}</p>`);
        }
      }
    }

    if (params.highlights.length > 0 || params.notes.length > 0) {
      noteItemKey = await this.createNote({
        itemType: 'note',
        title: `Reading Notes: ${params.title}`,
        note: parts.join('\n'),
        tags: [{ tag: 'read-pal' }, { tag: 'reading-notes' }],
        parentItem: bookKey,
      });
    }

    return {
      bookItemKey: bookKey,
      noteItemKey,
      itemsCreated: itemsCreated + (noteItemKey ? 1 : 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export function getZoteroConfig(settings: Record<string, unknown>): ZoteroConfig | null {
  const apiKey = settings.zoteroApiKey as string | undefined;
  const userId = settings.zoteroUserId as string | undefined;
  if (!apiKey || !userId) return null;
  return { apiKey, userId };
}
