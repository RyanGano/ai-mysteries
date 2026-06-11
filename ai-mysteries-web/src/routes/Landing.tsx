import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBooks } from "../lib/api";
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
      <main className="catalog catalog--status">
        <p className="catalog-status-text">Loading&hellip;</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="catalog catalog--status">
        <p className="catalog-status-text">
          The library couldn&rsquo;t be loaded right now. Please try again in a moment.
        </p>
      </main>
    );
  }

  return (
    <main className="catalog">
      <header className="catalog-header">
        <h1 className="catalog-title">AI Mysteries</h1>
        <p className="catalog-tagline">
          Every story here is written by AI &mdash; and every one has more than one ending.
        </p>
      </header>
      <ul className="catalog-list">
        {state.books.map((book) => (
          <li key={book.id}>
            <CatalogCard book={book} />
          </li>
        ))}
      </ul>
    </main>
  );
}

// One row in the catalog: cover, title, tags, reading time + published date, and a short teaser.
// The whole card links into the book (stretched link off the title) — /:bookId drops straight into
// the first chapter. Every word comes from the book's metadata — nothing book-specific here.
function CatalogCard({ book }: { book: BookMeta }) {
  const facts = [book.readingTime, formatPublished(book.published)].filter(Boolean).join(" · ");
  return (
    <article className="catalog-card">
      {book.coverImage && (
        <img src={book.coverImage} alt={book.coverAlt} className="catalog-cover" />
      )}
      <div className="catalog-card-text">
        <h2 className="catalog-book-title">
          <Link to={`/${book.id}`} className="catalog-card-link">
            {book.title}
          </Link>
        </h2>
        {book.tags.length > 0 && (
          <ul className="catalog-tags">
            {book.tags.map((tag) => (
              <li key={tag} className="catalog-tag">
                {tag}
              </li>
            ))}
          </ul>
        )}
        {facts && <p className="catalog-book-facts">{facts}</p>}
        {book.summary[0] && <Teaser text={book.summary[0]} />}
      </div>
    </article>
  );
}

// "2026-06-08" → "June 8, 2026". Parses the date parts by hand so the displayed day never shifts
// with the viewer's timezone. Returns "" for an empty/malformed value so the facts line skips it.
function formatPublished(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// The book's first summary paragraph, clamped to a few lines. Shows a More/Less toggle only when
// the text actually overflows the clamp, so short teasers stay clean. Expanding happens in place;
// the toggle sits above the card's stretched link so it doesn't navigate.
function Teaser({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only meaningful while clamped — in that state a taller scrollHeight means text is hidden.
    const measure = () => {
      if (!expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  return (
    <>
      <p
        ref={ref}
        className={`catalog-book-teaser${expanded ? " catalog-book-teaser--expanded" : ""}`}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          className="catalog-more"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </>
  );
}
