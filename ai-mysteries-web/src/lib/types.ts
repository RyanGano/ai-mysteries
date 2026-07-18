// Wire types returned by the book API. Field names match the JSON the API serves (camelCase).

// The special-ending reveal overlay copy.
export interface SpecialReveal {
  headline: string;
  sub: string;
}

// All book-identifying content the front end renders. The web app holds none of this itself —
// it fetches it per book so a new book is a data-only change. No codes/culprits/ending list.
export interface BookMeta {
  id: string;
  title: string;
  // Free-form filtering/topic tags (e.g. "Murder", "AI", "Kid Friendly"). Replaces genre.
  tags: string[];
  // ISO date (YYYY-MM-DD) the book was published to the site.
  published: string;
  // Raw word count (for future sorting/filtering) and the server-computed display estimate.
  wordCount: number;
  readingTime: string;
  summary: string[];
  coverImage: string;
  coverAlt: string;
  secretBlurb: string;
  payoff: string[];
  codePlaceholder: string;
  shareTitle: string;
  shareText: string;
  specialShareText: string;
  specialReveal: SpecialReveal;
  // Slug of the first chapter — the catalog deep-links straight into the reading, bypassing the
  // per-book landing page. Empty when the book has no chapters.
  firstChapterSlug: string;
  // Protagonist gender ("male"/"female", or "" when unknown) — the read-aloud feature uses it to
  // pick a matching text-to-speech voice. Empty falls back to the browser's default voice.
  narrationGender: string;
  // Curated "from the story" Amazon items for the landing-page shelf. Empty for books without one.
  shopItems: ShopItem[];
  // Aggregate reader rating (thumbs up/down totals). Runtime, API-owned. { up: 0, down: 0 } for a
  // book nobody has rated yet; the UI shows a badge only when up + down > 0.
  ratings: Ratings;
}

// Aggregate story rating totals. Also the shape returned by POST .../rating.
export interface Ratings {
  up: number;
  down: number;
}

// A reader's own rating of a story: thumbs up, thumbs down, or none. Held only in their browser.
export type MyRating = "up" | "down" | null;

// One "from the story" shop item. The client builds the Amazon URL itself (see lib/shop.ts):
// a product page when `asin` is set, otherwise a search for `search`.
export interface ShopItem {
  label: string;
  note: string;
  search: string;
  asin: string;
}

// One unfamiliar-word definition. The reader underlines the first occurrence of `term` (or any
// alias) per chapter/ending and shows `definition` in a popover.
export interface GlossaryEntry {
  term: string;
  definition: string;
  aliases: string[];
}

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

// Result of a weighted-random reveal: the next code to show, or exhausted once the reader has
// seen every ordinary ending this session.
export type RandomEnding = { code: string } | { exhausted: true };

// Read-aloud audio manifest for one chapter or ending: the spoken chunk texts (shown by the
// follow-along highlight) and the content hash that addresses their synthesized audio at
// GET .../audio/chunks/{hash}/{index}. Absent (404) when server audio isn't configured — the
// player then falls back to the browser's built-in voice.
export interface AudioTrack {
  hash: string;
  chunks: string[];
}
