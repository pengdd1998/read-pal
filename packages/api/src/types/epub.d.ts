declare module 'epub' {
  import { EventEmitter } from 'events';

  interface EPubChapter {
    title: string;
    id: string;
    href: string;
    order: number;
    content?: string;
  }

  interface EPubImage {
    id: string;
    href: string;
    mediaType: string;
  }

  class EPub extends EventEmitter {
    constructor(epubPath: string);

    metadata: {
      title: string;
      creator: string;
      publisher: string;
      language: string;
      description?: string;
      ISBN?: string;
      subject?: string;
      date?: string;
      rights?: string;
    };

    flow: EPubChapter[];
    toc: EPubChapter[];
    spine: EPubChapter[];
    manifest: Record<string, { href: string; 'media-type': string }>;

    parse(): void;
    getChapter(chapterId: string, callback: (err: Error | null, html: string) => void): void;
    getChapterRaw(chapterId: string, callback: (err: Error | null, html: string) => void): void;
    getImage(id: string, callback: (err: Error | null, data: Buffer, mimeType: string) => void): void;
    hasDRM(): boolean;
  }

  export = EPub;
}
