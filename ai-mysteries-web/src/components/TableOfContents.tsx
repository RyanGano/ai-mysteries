import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { checkCode } from "../lib/api";
import type { TocEntry } from "../lib/types";

interface TableOfContentsProps {
  open: boolean;
  onClose: () => void;
  currentSlug: string;
  bookId: string;
  // The chapter list, fetched by the parent (Read).
  entries: TocEntry[];
  // From the book's metadata (may be absent until it loads): the code-input placeholder and the
  // spoiler-free teaser shown under the endings controls.
  codePlaceholder?: string;
  secretBlurb?: string;
}

// Left-sliding drawer listing every chapter, then the book's ending controls: reveal a
// (weighted-random) ending or enter a specific code. The ending is the natural next stop after the
// last chapter, so it lives at the foot of the contents rather than in a separate drawer.
// Selecting a chapter navigates and closes the drawer (handled by the parent via onClose).
export default function TableOfContents({
  open,
  onClose,
  currentSlug,
  bookId,
  entries,
  codePlaceholder,
  secretBlurb,
}: TableOfContentsProps) {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  return (
    <div className={`toc${open ? " toc--open" : ""}`} aria-hidden={!open}>
      <div className="toc-overlay" onClick={onClose} />
      <nav className="toc-panel" aria-label="Contents">
        <div className="toc-head">
          <span className="toc-head-title">Contents</span>
          <button className="toc-close" onClick={onClose} aria-label="Close contents">
            &times;
          </button>
        </div>
        <Link to={`/${bookId}/all`} className="toc-readall" onClick={onClose}>
          Read the whole book &rarr;
        </Link>
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

        <div className="toc-endings">
          <button
            type="button"
            className="toc-ending-link"
            onClick={() => {
              onClose();
              navigate(`/${bookId}/ending`);
            }}
          >
            Reveal your ending &rarr;
          </button>

          <form onSubmit={handleSubmit} className="toc-code-form">
            <label htmlFor="toc-code-input">Have a code? Enter it here:</label>
            <div className="toc-code-row">
              <input
                id="toc-code-input"
                type="text"
                maxLength={6}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setError("");
                }}
                placeholder={codePlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" disabled={checking}>
                Go
              </button>
            </div>
            {error && <p className="toc-code-error">{error}</p>}
          </form>

          {secretBlurb && <p className="toc-secret">{secretBlurb}</p>}
        </div>
      </nav>
    </div>
  );
}
