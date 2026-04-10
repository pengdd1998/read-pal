declare module 'epub' {
  interface EpubChapter {
    id: string;
    title: string | undefined;
    src: string | undefined;
  }

  class EPub {
    constructor(filePath: string);
    title: string;
    creator: string;
    chapters: EpubChapter[];

    on(event: 'end', callback: () => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    on(event: 'chapter', callback: (data: { id: string; title?: string; content: string }) => void): this;

    parse(): void;
    getChapter(id: string, callback: (err: Error | null, text: string | null) => void): void;
  }

  export = EPub;
}
