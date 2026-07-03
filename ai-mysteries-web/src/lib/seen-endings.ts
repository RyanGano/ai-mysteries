// Per-book, per-tab memory of which endings the reader has already been shown, so the
// "Reveal another ending" flow never repeats an ending within a session. Backed by
// sessionStorage, so it clears when the tab closes (the memory is deliberately session-scoped).
// The reader only ever holds codes they've legitimately been shown, so this never exposes an
// unseen ending. Every access is wrapped so disabled/private-mode storage degrades to "no
// memory" rather than throwing.

const key = (bookId: string) => `seen:${bookId}`;

export function getSeen(bookId: string): string[] {
  try {
    const raw = sessionStorage.getItem(key(bookId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export function addSeen(bookId: string, code: string): void {
  if (!code) return;
  try {
    const seen = getSeen(bookId);
    if (seen.includes(code)) return;
    seen.push(code);
    sessionStorage.setItem(key(bookId), JSON.stringify(seen));
  } catch {
    /* storage unavailable — just skip remembering this one */
  }
}

export function clearSeen(bookId: string): void {
  try {
    sessionStorage.removeItem(key(bookId));
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}
