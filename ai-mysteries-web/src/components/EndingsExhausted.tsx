import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchRandomEnding } from "../lib/api";
import { clearSeen } from "../lib/seen-endings";

// Shown when a reader has revealed every ordinary ending this session. Generic, book-agnostic site
// chrome describing the ending mechanic (like the loading captions and button verbs) — it holds no
// book data. "Start over" forgets this session's history so every ending is fresh to find again.
// The rare special ending is deliberately not handed out here; the hint nudges readers that one
// still hides, keeping its 1-in-1000 payoff intact.
export default function EndingsExhausted({ bookId }: { bookId: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function startOver() {
    if (busy) return;
    setBusy(true);
    clearSeen(bookId);
    try {
      const next = await fetchRandomEnding(bookId, []);
      if ("code" in next) {
        navigate(`/${bookId}/ending/${next.code}`);
        return;
      }
    } catch {
      /* fall through — leave the panel up on a transient failure */
    }
    setBusy(false);
  }

  return (
    <main className="ending ending--notfound">
      <p className="ending-notfound-text">
        You&rsquo;ve found every ending &mdash; each one you&rsquo;ve seen was different. Well
        played.
      </p>
      <p className="ending-notfound-text">
        There is one more: a single rare ending that turns up only once in a long while. It&rsquo;s
        still out there, waiting to be found another time.
      </p>
      <button className="cta-button" onClick={startOver} disabled={busy}>
        Start over &rarr;
      </button>
      <Link to="/" className="ending-home">
        &larr; Home
      </Link>
    </main>
  );
}
