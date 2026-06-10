// Typed client for the book API. All book data (chapters, endings, clues) and the
// weighted-random selection live behind this service; the web app only renders what it returns.
import type { TocEntry, ChapterNav, Ending, Clue } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5180";
const BOOK_ID = "within-tolerance";
const base = `${API_BASE}/api/books/${BOOK_ID}`;

// GET helper: 404 → null (an expected "not found"); other non-2xx → throw.
async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export function fetchToc(): Promise<TocEntry[] | null> {
  return getJson<TocEntry[]>(`${base}/chapters`);
}

export function fetchChapterNav(slug: string): Promise<ChapterNav | null> {
  return getJson<ChapterNav>(`${base}/chapters/${encodeURIComponent(slug)}`);
}

export function fetchEnding(code: string): Promise<Ending | null> {
  return getJson<Ending>(`${base}/endings/${encodeURIComponent(code)}`);
}

export async function fetchRandomCode(excludeCode?: string): Promise<string> {
  const q = excludeCode ? `?excludeCode=${encodeURIComponent(excludeCode)}` : "";
  const res = await getJson<{ code: string }>(`${base}/endings/random${q}`);
  if (!res) throw new Error("Random ending unavailable");
  return res.code;
}

export async function checkCode(code: string): Promise<boolean> {
  const res = await getJson<{ exists: boolean }>(
    `${base}/endings/${encodeURIComponent(code)}/exists`
  );
  return res?.exists ?? false;
}

export function fetchClue(id: string): Promise<Clue | null> {
  return getJson<Clue>(`${base}/clues/${encodeURIComponent(id)}`);
}
