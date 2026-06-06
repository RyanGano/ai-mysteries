import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { allCodes, lookupEnding } from "../lib/endings";
import { normalizeCode, pickRandomCode } from "../lib/code";
import "../styles/find-ending.css";

export default function FindEnding() {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = pickRandomCode(allCodes());
    navigate(`/therealending/${code}`, { replace: true });
  }, [navigate]);

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
    <main className="find-ending">
      <p className="find-ending-message">Finding your ending&hellip;</p>
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
            placeholder="e.g. VRG7"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit">Go</button>
        </div>
        {error && <p className="code-error">{error}</p>}
      </form>
    </main>
  );
}
