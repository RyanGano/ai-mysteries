// Typed client for the book API. All book data (chapters, endings, clues) and the
// weighted-random selection live behind this service; the web app only renders what it returns.
import type { TocEntry, ChapterNav, Ending, Clue, BookMeta } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5180";

function base(bookId: string) {
  return `${API_BASE}/api/books/${encodeURIComponent(bookId)}`;
}

// GET helper: 404 → null (an expected "not found"); other non-2xx → throw.
async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// The catalog — every book's metadata. Drives the landing page.
export async function fetchBooks(): Promise<BookMeta[]> {
  return (await getJson<BookMeta[]>(`${API_BASE}/api/books`)) ?? [];
}

// One book's metadata (title, summary, cover, payoff, share + special-reveal copy).
export function fetchBookMeta(bookId: string): Promise<BookMeta | null> {
  return getJson<BookMeta>(base(bookId));
}

export function fetchToc(bookId: string): Promise<TocEntry[] | null> {
  return getJson<TocEntry[]>(`${base(bookId)}/chapters`);
}

export function fetchChapterNav(bookId: string, slug: string): Promise<ChapterNav | null> {
  return getJson<ChapterNav>(`${base(bookId)}/chapters/${encodeURIComponent(slug)}`);
}

export function fetchEnding(bookId: string, code: string): Promise<Ending | null> {
  return getJson<Ending>(`${base(bookId)}/endings/${encodeURIComponent(code)}`);
}

export async function fetchRandomCode(bookId: string, excludeCode?: string): Promise<string> {
  const q = excludeCode ? `?excludeCode=${encodeURIComponent(excludeCode)}` : "";
  const res = await getJson<{ code: string }>(`${base(bookId)}/endings/random${q}`);
  if (!res) throw new Error("Random ending unavailable");
  return res.code;
}

export async function checkCode(bookId: string, code: string): Promise<boolean> {
  const res = await getJson<{ exists: boolean }>(
    `${base(bookId)}/endings/${encodeURIComponent(code)}/exists`
  );
  return res?.exists ?? false;
}

export function fetchClue(bookId: string, id: string): Promise<Clue | null> {
  return getJson<Clue>(`${base(bookId)}/clues/${encodeURIComponent(id)}`);
}
