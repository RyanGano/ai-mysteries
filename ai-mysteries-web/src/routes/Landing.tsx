import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchBooks, checkCode } from "../lib/api";
import type { BookMeta } from "../lib/types";
import "../styles/landing.css";

type State = { status: "loading" } | { status: "ready"; books: BookMeta[] } | { status: "error" };

export default function Landing() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    document.title = "AI Mysteries";
  }, []);

  useEffect(() => {
    let active = true;
    fetchBooks()
      .then((books) => active && setState({ status: "ready", books }))
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main className="landing landing--status">
        <p className="landing-status-text">Loading&hellip;</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="landing landing--status">
        <p className="landing-status-text">
          The library couldn&rsquo;t be loaded right now. Please try again in a moment.
        </p>
      </main>
    );
  }

  return (
    <main className="landing">
      {state.books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </main>
  );
}

// One book's marketing hero — cover, summary, CTAs, code entry, secret blurb. Every word and
// image comes from the book's metadata; nothing here is specific to any single book.
function BookCard({ book }: { book: BookMeta }) {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setChecking(true);
    try {
      const exists = await checkCode(book.id, code);
      if (!exists) {
        setError("That code didn't match any ending. Check the code and try again.");
        return;
      }
      navigate(`/${book.id}/ending/${code}`);
    } catch {
      setError("Couldn't reach the endings right now. Please try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="landing-book">
      {book.coverImage && (
        <div className="landing-cover">
          <img src={book.coverImage} alt={book.coverAlt} className="cover-image" />
        </div>
      )}
      <div className="landing-content">
        <h1 className="landing-title">{book.title}</h1>
        {book.summary.map((para, i) => (
          <p key={i} className="landing-blurb">
            {para}
          </p>
        ))}
        <div className="landing-ctas">
          <Link to={`/${book.id}`} className="cta-button cta-button--primary">
            Start reading the book &rarr;
          </Link>
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
  );
}
