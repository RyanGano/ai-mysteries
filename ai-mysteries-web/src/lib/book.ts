import { chapters, type Chapter } from "../content/book/index";

export { chapters };
export type { Chapter };

const indexBySlug = new Map<string, number>(chapters.map((c, i) => [c.slug, i]));

export const firstChapterSlug = chapters[0].slug;

export function getChapter(slug: string): Chapter | undefined {
  const i = indexBySlug.get(slug);
  return i === undefined ? undefined : chapters[i];
}

export interface ChapterNav {
  chapter: Chapter;
  prev?: Chapter;
  next?: Chapter;
  isFirst: boolean;
  isLast: boolean;
}

// Resolve a chapter and its neighbours for the reader's Prev/Next controls.
export function getChapterNav(slug: string): ChapterNav | undefined {
  const i = indexBySlug.get(slug);
  if (i === undefined) return undefined;
  return {
    chapter: chapters[i],
    prev: chapters[i - 1],
    next: chapters[i + 1],
    isFirst: i === 0,
    isLast: i === chapters.length - 1,
  };
}
