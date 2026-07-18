import { useState } from "react";
import { submitRating } from "../lib/api";
import { getMyRating, setMyRating } from "../lib/ratings";
import type { MyRating, Ratings } from "../lib/types";
import "../styles/ratings.css";

// The interactive story-rating widget on the ending page (the only place a reader can rate). Two
// thumb buttons reflect the reader's own choice, remembered in their browser: tapping a thumb sets
// it, tapping the active thumb again retracts it, tapping the other switches. The change is applied
// optimistically, then reconciled with the server's authoritative totals; on failure it rolls back.
// Initial totals come from the book's metadata, so the counts are live the moment it renders.
export default function RatingControl({
  bookId,
  initial,
}: {
  bookId: string;
  initial: Ratings | undefined;
}) {
  const [counts, setCounts] = useState<Ratings>({
    up: initial?.up ?? 0,
    down: initial?.down ?? 0,
  });
  const [mine, setMine] = useState<MyRating>(() => getMyRating(bookId));
  const [busy, setBusy] = useState(false);

  async function choose(thumb: "up" | "down") {
    if (busy) return;
    const from = mine;
    const to: MyRating = mine === thumb ? null : thumb;
    if (from === to) return;

    // Optimistic: reflect the change immediately, remember it locally, then confirm with the server.
    const prevCounts = counts;
    setCounts(applyDelta(counts, from, to));
    setMine(to);
    setMyRating(bookId, to);
    setBusy(true);
    try {
      const totals = await submitRating(bookId, from, to);
      setCounts(totals);
    } catch {
      // Roll back the optimistic change on a transient failure.
      setCounts(prevCounts);
      setMine(from);
      setMyRating(bookId, from);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rating-control" aria-label="Rate this story">
      <p className="rating-control-prompt">Did you enjoy this story?</p>
      <div className="rating-control-buttons">
        <button
          type="button"
          className={`rating-control-button${mine === "up" ? " rating-control-button--active" : ""}`}
          aria-pressed={mine === "up"}
          aria-label="Thumbs up"
          disabled={busy}
          onClick={() => choose("up")}
        >
          <span aria-hidden="true">👍</span>
          <span className="rating-control-count">{counts.up}</span>
        </button>
        <button
          type="button"
          className={`rating-control-button${mine === "down" ? " rating-control-button--active" : ""}`}
          aria-pressed={mine === "down"}
          aria-label="Thumbs down"
          disabled={busy}
          onClick={() => choose("down")}
        >
          <span aria-hidden="true">👎</span>
          <span className="rating-control-count">{counts.down}</span>
        </button>
      </div>
    </section>
  );
}

// Adjust local totals for a from -> to transition, clamped at zero (mirrors the server).
function applyDelta(counts: Ratings, from: MyRating, to: MyRating): Ratings {
  const bump = (bucket: "up" | "down") => (to === bucket ? 1 : 0) - (from === bucket ? 1 : 0);
  return {
    up: Math.max(0, counts.up + bump("up")),
    down: Math.max(0, counts.down + bump("down")),
  };
}
