import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkCode } from "../lib/api";

interface EndingsDrawerProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  // From the book's metadata (may be absent until it loads).
  codePlaceholder?: string;
  secretBlurb?: string;
}

// Right-sliding drawer holding the two "I've finished the book" actions that used to live on the
// book-home page: reveal a (weighted-random) ending, or enter a specific code. Reachable from the
// reader's top bar so the reader is the single home for a book.
export default function EndingsDrawer({
  open,
  onClose,
  bookId,
  codePlaceholder,
  secretBlurb,
}: EndingsDrawerProps) {
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
    <div className={`endings${open ? " endings--open" : ""}`} aria-hidden={!open}>
      <div className="endings-overlay" onClick={onClose} />
      <aside className="endings-panel" aria-label="Endings">
        <div className="endings-head">
          <span className="endings-head-title">Endings</span>
          <button className="endings-close" onClick={onClose} aria-label="Close endings">
            &times;
          </button>
        </div>

        <div className="endings-body">
          <p className="endings-lead">Already finished the book?</p>
          <button
            type="button"
            className="cta-button"
            onClick={() => {
              onClose();
              navigate(`/${bookId}/ending`);
            }}
          >
            Reveal your ending &rarr;
          </button>

          <form onSubmit={handleSubmit} className="endings-code-form">
            <label htmlFor="endings-code-input">Have a code? Enter it here:</label>
            <div className="endings-code-row">
              <input
                id="endings-code-input"
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
            {error && <p className="endings-code-error">{error}</p>}
          </form>

          {secretBlurb && <p className="endings-secret">{secretBlurb}</p>}
        </div>
      </aside>
    </div>
  );
}
