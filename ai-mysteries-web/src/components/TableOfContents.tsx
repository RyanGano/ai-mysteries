import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { TocEntry } from "../lib/types";

interface TableOfContentsProps {
  open: boolean;
  onClose: () => void;
  currentSlug: string;
  bookId: string;
  // The chapter list, fetched by the parent (Read).
  entries: TocEntry[];
}

// Left-sliding drawer listing every chapter. Selecting an entry navigates and
// closes the drawer (handled by the parent via onClose).
export default function TableOfContents({
  open,
  onClose,
  currentSlug,
  bookId,
  entries,
}: TableOfContentsProps) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`toc${open ? " toc--open" : ""}`} aria-hidden={!open}>
      <div className="toc-overlay" onClick={onClose} />
      <nav className="toc-panel" aria-label="Table of contents">
        <div className="toc-head">
          <span className="toc-head-title">Contents</span>
          <button className="toc-close" onClick={onClose} aria-label="Close contents">
            &times;
          </button>
        </div>
        <ul className="toc-list">
          {entries.map((ch) => (
            <li key={ch.slug}>
              <Link
                to={`/${bookId}/${ch.slug}`}
                className={`toc-link${ch.slug === currentSlug ? " toc-link--active" : ""}`}
                aria-current={ch.slug === currentSlug ? "page" : undefined}
                onClick={onClose}
              >
                {ch.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
