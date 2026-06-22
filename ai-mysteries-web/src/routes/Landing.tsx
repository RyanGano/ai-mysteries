import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBooks } from "../lib/api";
import type { BookMeta } from "../lib/types";
import Loading from "../components/Loading";
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
    return <Loading variant="catalog" />;
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

  // Reading-time range filter. Bounds are derived from the catalog itself (no hard-coded times),
  // snapped out to clean 5-minute stops. `range` stays null ("full range") until the user moves a
  // handle, so lo/hi fall back to the bounds. Only rendered when the catalog spans >1 bucket.
  const bounds = useMemo(() => {
    const mins = sorted.map((b) => displayMinutes(b.wordCount)).filter((m) => m > 0);
    if (mins.length === 0) return null;
    const lo = Math.floor(Math.min(...mins) / STEP) * STEP;
    const hi = Math.ceil(Math.max(...mins) / STEP) * STEP;
    return lo < hi ? { min: lo, max: hi } : null;
  }, [sorted]);

  const [range, setRange] = useState<[number, number] | null>(null);
  const lo = range ? range[0] : (bounds?.min ?? null);
  const hi = range ? range[1] : (bounds?.max ?? null);

  // A book shows only if it carries every selected tag (AND) and its reading time is within the
  // selected range. Both filters compose here so the tag counts below reflect the active range too.
  const visible = useMemo(
    () =>
      sorted.filter((book) => {
        if (!selectedTags.every((tag) => book.tags.includes(tag))) return false;
        if (lo !== null && hi !== null) {
          const m = displayMinutes(book.wordCount);
          if (m > 0 && (m < lo || m > hi)) return false;
        }
        return true;
      }),
    [sorted, selectedTags, lo, hi]
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
      <div className="catalog-filters">
        <FilterBar
          selectedTags={selectedTags}
          availableTags={availableTags}
          onAddTag={addTag}
          onRemoveTag={removeTag}
        />
        {bounds && lo !== null && hi !== null && (
          <ReadingTimeFilter
            bounds={bounds}
            value={[lo, hi]}
            onChange={(next) =>
              setRange(next[0] <= bounds.min && next[1] >= bounds.max ? null : next)
            }
          />
        )}
      </div>
      {visible.length === 0 ? (
        <p className="catalog-empty">No stories match these filters.</p>
      ) : (
        <ul className="catalog-list">
          {visible.map((book) => (
            <li key={book.id}>
              <CatalogCard book={book} />
            </li>
          ))}
        </ul>
      )}
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

// The reading-time range filter: a dual-thumb slider (a min handle and a max handle, like a price
// range picker) over a track whose coloured fill spans the chosen span. Two native range inputs are
// stacked on the same track so each is keyboard-accessible and screen-reader-labelled; CSS lets
// only the thumbs take pointer events so either handle stays grabbable where they overlap. The min
// handle can't cross above the max and vice-versa.
function ReadingTimeFilter({
  bounds,
  value,
  onChange,
}: {
  bounds: { min: number; max: number };
  value: [number, number];
  onChange: (next: [number, number]) => void;
}) {
  const { min, max } = bounds;
  const [lo, hi] = value;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const narrowed = lo > min || hi < max;
  const label = lo === hi ? `${lo} min` : `${lo}–${hi} min`;

  return (
    <div className="catalog-readtime">
      <div className="catalog-readtime-head">
        <span className="catalog-readtime-label">Reading time</span>
        <span className="catalog-readtime-value">{label}</span>
        {narrowed && (
          <button
            type="button"
            className="catalog-readtime-reset"
            onClick={() => onChange([min, max])}
          >
            Reset
          </button>
        )}
      </div>
      <div className="catalog-readtime-slider">
        <div className="catalog-readtime-track" />
        <div
          className="catalog-readtime-fill"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={STEP}
          value={lo}
          aria-label="Minimum reading time, minutes"
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={STEP}
          value={hi}
          aria-label="Maximum reading time, minutes"
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
    </div>
  );
}

// One row in the catalog: cover, title, tags, reading time + published date, and a short teaser.
// The whole card links into the book (stretched link off the title) — it deep-links straight into
// the first chapter (the per-book landing page at /:bookId is the share target, reached by sharing
// or by the book title in the reader, not by the catalog). Falls back to /:bookId if a book has no
// chapters. Every word comes from the book's metadata — nothing book-specific here.
function CatalogCard({ book }: { book: BookMeta }) {
  const facts = [book.readingTime, formatPublished(book.published)].filter(Boolean).join(" · ");
  const to = book.firstChapterSlug ? `/${book.id}/${book.firstChapterSlug}` : `/${book.id}`;
  return (
    <article className="catalog-card">
      {book.coverImage && (
        <img src={book.coverImage} alt={book.coverAlt} className="catalog-cover" />
      )}
      <div className="catalog-card-text">
        <h2 className="catalog-book-title">
          <Link to={to} className="catalog-card-link">
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

// Reading-time range filter granularity (minutes per slider step).
const STEP = 5;

// Average adult prose reading speed — must match the API's ReadingTime constant.
const WORDS_PER_MINUTE = 250;

// A book's reading time in whole minutes for the range filter, derived from its raw word count.
// This deliberately mirrors the rounding in the API's ReadingTime.Estimate (exact under 10 min,
// nearest 5 above) so the number we filter on matches the "~N min read" the card shows — otherwise
// a book labelled "~15 min read" could be hidden by a "≤ 15 min" filter. Keep the two in lockstep.
function displayMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  const raw = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  return raw < 10 ? raw : Math.round(raw / STEP) * STEP;
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
