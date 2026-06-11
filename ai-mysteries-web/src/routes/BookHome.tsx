import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchBookMeta, fetchToc, checkCode } from "../lib/api";
import type { BookMeta, TocEntry } from "../lib/types";
import "../styles/landing.css";

type State =
  | { status: "loading" }
  | { status: "ready"; book: BookMeta }
  | { status: "missing" }
  | { status: "error" };

// One book's marketing hero — cover, summary, CTAs, code entry, secret blurb. Every word and
// image comes from the book's metadata; nothing here is specific to any single book.
export default function BookHome() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetchBookMeta(bookId)
      .then((book) => active && setState(book ? { status: "ready", book } : { status: "missing" }))
      .catch(() => active && setState({ status: "error" }));
    fetchToc(bookId)
      .then((t) => active && setToc(t ?? []))
      .catch(() => {
        /* the start-reading link just stays disabled until the TOC loads */
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    document.title =
      state.status === "ready" ? `AI Mysteries — ${state.book.title}` : "AI Mysteries";
  }, [state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setChecking(true);
    try {
      const exists = await checkCode(bookId, code);
      if (!exists) {
        setError("That code didn't match any ending. Check the code and try again.");
        return;
      }
      navigate(`/${bookId}/ending/${code}`);
    } catch {
      setError("Couldn't reach the endings right now. Please try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  if (state.status === "loading") {
    return (
      <main className="landing landing--status">
        <p className="landing-status-text">Loading&hellip;</p>
      </main>
    );
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
          &larr; AI Mysteries
        </Link>
      </main>
    );
  }

  const book = state.book;
  const facts = [book.genre, book.length].filter(Boolean).join(" · ");
  const firstSlug = toc[0]?.slug;

  return (
    <main className="landing">
      <div className="landing-bar">
        <Link to="/" className="landing-back">
          &larr; AI Mysteries
        </Link>
      </div>
      <section className="landing-book">
        {book.coverImage && (
          <div className="landing-cover">
            <img src={book.coverImage} alt={book.coverAlt} className="cover-image" />
          </div>
        )}
        <div className="landing-content">
          <h1 className="landing-title">{book.title}</h1>
          {facts && <p className="landing-facts">{facts}</p>}
          {book.summary.map((para, i) => (
            <p key={i} className="landing-blurb">
              {para}
            </p>
          ))}
          <div className="landing-ctas">
            {firstSlug ? (
              <Link to={`/${book.id}/${firstSlug}`} className="cta-button cta-button--primary">
                Start reading the book &rarr;
              </Link>
            ) : (
              <span className="cta-button cta-button--primary cta-button--disabled" aria-disabled>
                Start reading the book &rarr;
              </span>
            )}
            <Link to={`/${book.id}/ending`} className="cta-button cta-button--ghost">
              Already read the book? Reveal your ending &rarr;
            </Link>
          </div>
          <form onSubmit={handleSubmit} className="code-form">
            <label htmlFor={`code-input-${book.id}`}>Have a code? Enter it here:</label>
            <div className="code-form-row">
              <input
                id={`code-input-${book.id}`}
                type="text"
                maxLength={6}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setError("");
                }}
                placeholder={book.codePlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" disabled={checking}>
                Go
              </button>
            </div>
            {error && <p className="code-error">{error}</p>}
          </form>
          {book.secretBlurb && <p className="landing-secret">{book.secretBlurb}</p>}
        </div>
      </section>
    </main>
  );
}
