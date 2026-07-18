// Typed client for the book API. All book data (chapters, endings, clues) and the
// weighted-random selection live behind this service; the web app only renders what it returns.
import type {
  TocEntry,
  ChapterNav,
  Ending,
  Clue,
  BookMeta,
  RandomEnding,
  GlossaryEntry,
  AudioTrack,
} from "./types";

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

// Weighted-random reveal. `seen` (every ending the reader has viewed this session) and the current
// `excludeCode` travel in the POST body so their codes never land in access logs. Returns the next
// code, or { exhausted: true } once the reader has seen every ordinary ending.
export async function fetchRandomEnding(
  bookId: string,
  seen: string[],
  excludeCode?: string
): Promise<RandomEnding> {
  const res = await fetch(`${base(bookId)}/endings/random`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excludeCode, seen }),
  });
  if (!res.ok) throw new Error(`API ${res.status} for random ending`);
  const data = (await res.json()) as { code: string | null; exhausted: boolean };
  if (data.exhausted || !data.code) return { exhausted: true };
  return { code: data.code };
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

// Read-aloud audio manifests. 404 (→ null) when server-side audio isn't available for the
// book — the read-aloud player then uses the browser voice instead.
export function fetchChapterAudio(bookId: string, slug: string): Promise<AudioTrack | null> {
  return getJson<AudioTrack>(`${base(bookId)}/audio/chapter/${encodeURIComponent(slug)}`);
}

export function fetchEndingAudio(bookId: string, code: string): Promise<AudioTrack | null> {
  return getJson<AudioTrack>(`${base(bookId)}/audio/ending/${encodeURIComponent(code)}`);
}

// URL of one synthesized chunk. Fetched by an <audio> element, not fetch(), so no CORS is
// involved; the API redirects to the cached public blob (or streams fresh bytes the first time).
export function audioChunkUrl(bookId: string, hash: string, index: number): string {
  return `${base(bookId)}/audio/chunks/${encodeURIComponent(hash)}/${index}`;
}

// The book's whole glossary (unfamiliar-word definitions), cached per book for the session so
// chapter-to-chapter navigation doesn't refetch it. A failed fetch resolves to [] (the reader
// just renders no underlines) and isn't cached, so a transient error can retry later.
const glossaryCache = new Map<string, GlossaryEntry[]>();

export async function fetchGlossary(bookId: string): Promise<GlossaryEntry[]> {
  const cached = glossaryCache.get(bookId);
  if (cached) return cached;
  try {
    const entries = (await getJson<GlossaryEntry[]>(`${base(bookId)}/glossary`)) ?? [];
    glossaryCache.set(bookId, entries);
    return entries;
  } catch {
    return [];
  }
}
