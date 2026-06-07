import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { lookupEnding } from "../lib/endings";
import { normalizeCode } from "../lib/code";
import "../styles/landing.css";

export default function Landing() {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeCode(codeInput);
    if (!lookupEnding(normalized)) {
      setError("That code didn't match any ending. Check the code and try again.");
      return;
    }
    navigate(`/therealending/${normalized}`);
  }

  return (
    <main className="landing">
      <div className="landing-cover">
        <img src="/cover.webp" alt="Within Tolerance book cover" className="cover-image" />
      </div>
      <div className="landing-content">
        <h1 className="landing-title">Within Tolerance</h1>
        <p className="landing-blurb">
          Michael Holloway, founder, is found dead inside the Charge Cage at his company&rsquo;s
          battery-storage facility. Detective Mara Ellery investigates. Five suspects. One system.
          No shortage of reasons.
        </p>
        <p className="landing-blurb">
          The book ends where it ends. But the truth has more than one shape.
        </p>
        <Link to="/therealending" className="cta-button">
          Already read the book? Reveal your ending &rarr;
        </Link>
        <form onSubmit={handleSubmit} className="code-form">
          <label htmlFor="code-input">Have a code? Enter it here:</label>
          <div className="code-form-row">
            <input
              id="code-input"
              type="text"
              maxLength={6}
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value);
                setError("");
              }}
              placeholder="e.g. 7BXK"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">Go</button>
          </div>
          {error && <p className="code-error">{error}</p>}
        </form>
        <p className="landing-secret">
          Most readers find an ending. They say there is a rarer one still &mdash; hidden so well
          that only the most relentless detectives ever turn it up.
        </p>
      </div>
    </main>
  );
}
