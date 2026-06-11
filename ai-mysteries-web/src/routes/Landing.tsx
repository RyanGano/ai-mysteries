import { useEffect, useState } from "react";
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

// One row in the catalog: cover, title, genre + length, and a short teaser. The whole card links
// to the book's home page. Every word comes from the book's metadata — nothing book-specific here.
function CatalogCard({ book }: { book: BookMeta }) {
  const facts = [book.genre, book.readingTime].filter(Boolean).join(" · ");
  return (
    <Link to={`/${book.id}`} className="catalog-card">
      {book.coverImage && (
        <img src={book.coverImage} alt={book.coverAlt} className="catalog-cover" />
      )}
      <div className="catalog-card-text">
        <h2 className="catalog-book-title">{book.title}</h2>
        {facts && <p className="catalog-book-facts">{facts}</p>}
        {book.summary[0] && <p className="catalog-book-teaser">{book.summary[0]}</p>}
      </div>
    </Link>
  );
}
