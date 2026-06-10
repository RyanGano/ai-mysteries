// Wire types returned by the book API. Field names match the JSON the API serves (camelCase).

export interface TocEntry {
  slug: string;
  title: string;
}

export interface Chapter {
  slug: string;
  title: string;
  body: string;
}

export interface ChapterRef {
  slug: string;
  title: string;
}

export interface ChapterNav {
  chapter: Chapter;
  prev: ChapterRef | null;
  next: ChapterRef | null;
  isFirst: boolean;
  isLast: boolean;
}

// One foreshadowing glyph placement inside an ending body.
export interface XrefMarker {
  clueId: string;
  index: number;
  snippet: string;
}

// A manuscript passage shown in the binoculars popover.
export interface Clue {
  chapterSlug: string;
  chapterTitle: string;
  passages: string[];
  fragments: string[];
}

// The single ending currently being displayed, with its own markers and only the clues those
// markers reference.
export interface Ending {
  code: string;
  title: string;
  culprits: string[];
  special: boolean;
  body: string;
  markers: XrefMarker[];
  clues: Record<string, Clue>;
}
