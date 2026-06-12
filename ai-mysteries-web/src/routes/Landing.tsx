import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

  return <Catalog books={state.books} />;
}

// The catalog body, given the loaded books. Sorting/filtering are view concerns over the
// already-fetched list, so they live here client-side; the backend just returns the full set.
// Default order is newest-first by published date. Tag filtering is AND: a book shows only if it
// carries every selected tag.
function Catalog({ books }: { books: BookMeta[] }) {
  const sorted = useMemo(() => [...books].sort(byPublishedDesc), [books]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const visible = useMemo(
    () => sorted.filter((book) => selectedTags.every((tag) => book.tags.includes(tag))),
    [sorted, selectedTags]
  );

  // Tags still worth offering: those on the currently-visible books that aren't already selected,
  // each with how many visible books carry it. Narrowing further can only ever shrink the list, so
  // we never offer a tag that would empty the catalog. Sorted by count (desc) then name.
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of visible) {
      for (const tag of book.tags) {
        if (selectedTags.includes(tag)) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [visible, selectedTags]);

  const addTag = (tag: string) => setSelectedTags((tags) => [...tags, tag]);
  const removeTag = (tag: string) => setSelectedTags((tags) => tags.filter((t) => t !== tag));

  return (
    <main className="catalog">
      <header className="catalog-header">
        <h1 className="catalog-title">AI Mysteries</h1>
        <p className="catalog-tagline">
          Every story here is written by AI &mdash; and every one has more than one ending.
        </p>
      </header>
      <FilterBar
        selectedTags={selectedTags}
        availableTags={availableTags}
        onAddTag={addTag}
        onRemoveTag={removeTag}
      />
      <ul className="catalog-list">
        {visible.map((book) => (
          <li key={book.id}>
            <CatalogCard book={book} />
          </li>
        ))}
      </ul>
    </main>
  );
}

// The filter control: a "Filter" button that opens a popup of the still-applicable tags (with the
// count of matching books), plus a breadcrumb row of the chosen tags, each removable. Selecting a
// tag narrows the catalog and the popup; removing one widens both back out.
function FilterBar({
  selectedTags,
  availableTags,
  onAddTag,
  onRemoveTag,
}: {
  selectedTags: string[];
  availableTags: { tag: string; count: number }[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the popup on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="catalog-filter">
      <div className="catalog-filter-controls" ref={ref}>
        <button
          type="button"
          className="catalog-filter-button"
          aria-haspopup="true"
          aria-expanded={open}
          disabled={availableTags.length === 0}
          onClick={() => setOpen((v) => !v)}
        >
          Filter{selectedTags.length > 0 ? ` (${selectedTags.length})` : ""}
        </button>
        {open && availableTags.length > 0 && (
          <div className="catalog-filter-popup" role="menu">
            {availableTags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className="catalog-filter-option"
                role="menuitem"
                onClick={() => {
                  onAddTag(tag);
                  setOpen(false);
                }}
              >
                <span className="catalog-filter-option-tag">{tag}</span>
                <span className="catalog-filter-option-count">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedTags.length > 0 && (
        <ul className="catalog-filter-crumbs">
          {selectedTags.map((tag) => (
            <li key={tag} className="catalog-filter-crumb">
              {tag}
              <button
                type="button"
                className="catalog-filter-crumb-remove"
                aria-label={`Remove ${tag} filter`}
                onClick={() => onRemoveTag(tag)}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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

// Newest-first by published date. ISO "YYYY-MM-DD" strings sort lexicographically the same as by
// date, so a plain string compare is safe; titles break ties so the order is stable.
function byPublishedDesc(a: BookMeta, b: BookMeta): number {
  if (a.published !== b.published) return a.published < b.published ? 1 : -1;
  return a.title.localeCompare(b.title);
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
