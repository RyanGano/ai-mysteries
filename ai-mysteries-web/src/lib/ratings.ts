// Per-book memory of the reader's own story rating, kept in their browser. Unlike the
// session-scoped seen-endings list, this is persistent (localStorage) so a reader's thumbs-up
// survives closing the tab — and so re-visiting shows their choice and lets them change or retract
// it. The server only ever stores aggregate totals; who rated what lives here, in the reader's
// browser, and is never sent. Every access is wrapped so disabled/private-mode storage degrades to
// "no memory" rather than throwing.

import type { MyRating } from "./types";

const key = (bookId: string) => `rated:${bookId}`;

export function getMyRating(bookId: string): MyRating {
  try {
    const raw = localStorage.getItem(key(bookId));
    return raw === "up" || raw === "down" ? raw : null;
  } catch {
    return null;
  }
}

export function setMyRating(bookId: string, rating: MyRating): void {
  try {
    if (rating === null) localStorage.removeItem(key(bookId));
    else localStorage.setItem(key(bookId), rating);
  } catch {
    /* storage unavailable — the choice just isn't remembered across visits */
  }
}
