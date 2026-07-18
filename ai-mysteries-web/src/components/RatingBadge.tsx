import type { Ratings } from "../lib/types";
import "../styles/ratings.css";

// Read-only aggregate rating shown on the catalog card and the book landing page: thumbs up/down
// with their totals. Renders nothing until a story has at least one rating, so an unrated book
// stays clean. Display only — the reader can rate a story solely from the ending page.
export default function RatingBadge({ ratings }: { ratings: Ratings | undefined }) {
  const up = ratings?.up ?? 0;
  const down = ratings?.down ?? 0;
  if (up + down === 0) return null;
  return (
    <p className="rating-badge" aria-label={`${up} liked, ${down} disliked`}>
      <span className="rating-badge-stat">
        <span aria-hidden="true">👍</span> {up}
      </span>
      <span className="rating-badge-stat">
        <span aria-hidden="true">👎</span> {down}
      </span>
    </p>
  );
}
