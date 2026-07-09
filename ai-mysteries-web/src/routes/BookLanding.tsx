import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchBookMeta } from "../lib/api";
import { shareOrCopy } from "../lib/share";
import type { BookMeta } from "../lib/types";
import Loading from "../components/Loading";
import ShopShelf from "../components/ShopShelf";
import "../styles/landing.css";

type State =
  | { status: "loading" }
  | { status: "ready"; meta: BookMeta }
  | { status: "missing" }
  | { status: "error" };

// The per-book landing page (/:bookId): the share target for a story. It shows the cover, blurb,
// and reading time so someone arriving from a shared link sees what the book is before deciding to
// start — we deliberately don't drop them into chapter 1. The catalog card skips this page and
// deep-links straight into the first chapter; this page is reached by sharing or by clicking the
// book title while reading. Every word still comes from the book's metadata (no book-specific copy
// in code).
export default function BookLanding() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetchBookMeta(bookId)
      .then((meta) => {
        if (!active) return;
        setState(meta ? { status: "ready", meta } : { status: "missing" });
      })
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    document.title =
      state.status === "ready" ? `AI Mysteries — ${state.meta.title}` : "AI Mysteries";
  }, [state]);

  if (state.status === "loading") {
    return <Loading variant="book" />;
  }

  if (state.status !== "ready") {
    const message =
      state.status === "missing"
        ? "We couldn't find that book."
        : "The book couldn't be loaded right now. Please try again in a moment.";
    return (
      <main className="landing landing--status">
        <p className="landing-status-text">{message}</p>
        <Link to="/" className="landing-back">
          &larr; Home
        </Link>
      </main>
    );
  }

  const meta = state.meta;
  const startTo = meta.firstChapterSlug ? `/${bookId}/${meta.firstChapterSlug}` : `/${bookId}`;

  async function handleShare() {
    const note = await shareOrCopy({
      title: meta.shareTitle,
      text: meta.shareText,
      url: `${window.location.origin}/${bookId}`,
    });
    if (!note) return;
    setShareNote(note);
    window.setTimeout(() => setShareNote(""), 3000);
  }

  return (
    <main className="book-landing">
      <div className="book-landing-bar">
        <Link to="/" className="landing-back">
          &larr; Home
        </Link>
      </div>

      {meta.coverImage && (
        <img src={meta.coverImage} alt={meta.coverAlt} className="book-landing-cover" />
      )}

      <h1 className="book-landing-title">{meta.title}</h1>

      {meta.tags.length > 0 && (
        <ul className="book-landing-tags">
          {meta.tags.map((tag) => (
            <li key={tag} className="book-landing-tag">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {(meta.readingTime || meta.published) && (
        <p className="book-landing-facts">
          {[meta.readingTime, formatPublished(meta.published)].filter(Boolean).join(" · ")}
        </p>
      )}

      {meta.summary.length > 0 && (
        <div className="book-landing-summary">
          {meta.summary.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      <div className="book-landing-actions">
        <Link to={startTo} className="cta-button">
          Start reading &rarr;
        </Link>
        <Link to={`/${bookId}/all`} className="book-landing-secondary">
          Read the whole book on one page &rarr;
        </Link>
        <button type="button" className="book-landing-secondary" onClick={handleShare}>
          Share this story
        </button>
        {shareNote && (
          <span className="book-landing-share-note" role="status">
            {shareNote}
          </span>
        )}
      </div>

      <button
        type="button"
        className="book-landing-ending-link"
        onClick={() => navigate(`/${bookId}/ending`)}
      >
        Already finished the book? Reveal your ending &rarr;
      </button>

      <ShopShelf items={meta.shopItems} />

      {meta.secretBlurb && <p className="book-landing-secret">{meta.secretBlurb}</p>}
    </main>
  );
}

// "2026-06-08" → "June 8, 2026". Parses the parts by hand so the displayed day never shifts with
// the viewer's timezone. Returns "" for an empty/malformed value. (Mirrors the catalog's helper.)
function formatPublished(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
