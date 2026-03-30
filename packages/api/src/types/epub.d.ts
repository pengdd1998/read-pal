declare module 'epub' {
  interface TocItem {
    level: number;
    order: number;
    title: string;
    href: string;
    id?: string;
  }

  interface Chapter {
    title: string;
    content: string;
  }

  class EPub {
    constructor(filePath: string, imagePath?: string, webPath?: string);

    metadata: {
      title: string;
      creator: string;
      subject: string;
      description: string;
      publisher: string;
      contributor: string;
      date: string;
      type: string;
      format: string;
      identifier: string;
      source: string;
      language: string;
      rights: string;
    };

    flow: TocItem[];
    toc: TocItem[];
    spine: TocItem[];

    on(event: 'end', callback: () => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    on(event: string, callback: (...args: any[]) => void): this;

    parse(): void;
    getChapter(id: string, callback: (err: Error | null, text: string) => void): void;
    getChapterRaw(id: string, callback: (err: Error | null, text: string) => void): void;
    getImage(id: string, callback: (err: Error | null, data: Buffer, mimeType: string) => void): void;
    hasDRM(): boolean;
  }

  export = EPub;
}
