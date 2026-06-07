import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { lookupEnding, pickWeightedRandomCode, comboKey } from "../lib/endings";
import { normalizeCode } from "../lib/code";
import Prose from "../components/Prose";
import "../styles/ending.css";

export default function Ending() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const ending = lookupEnding(code);
  const [shareNote, setShareNote] = useState("");
  const [revealDone, setRevealDone] = useState(false);

  // A fresh ending should start from the top, even if the previous one was
  // scrolled down when "Reveal another ending" was tapped.
  // For the special ending, hide the code from the URL so readers can't share
  // it directly — we stay at /therealending instead of /therealending/CODE.
  useEffect(() => {
    if (ending?.special) {
      window.history.replaceState(null, "", "/therealending");
    }
    setRevealDone(false);
    window.scrollTo(0, 0);
    setShareNote("");
  }, [code]);

  if (!ending) {
    return (
      <main className="ending ending--notfound">
        <p className="ending-notfound-text">
          That code didn&rsquo;t match any ending. Maybe the letters shifted in transit.
        </p>
        <button
          className="cta-button"
          onClick={() => {
            const random = pickWeightedRandomCode();
            navigate(`/therealending/${random}`, { replace: true });
          }}
        >
          Reveal a random ending &rarr;
        </button>
      </main>
    );
  }

  const canonical = normalizeCode(ending.code);

  function handleNewEnding() {
    const next = pickWeightedRandomCode(comboKey(ending!));
    navigate(`/therealending/${next}`);
  }

  const SPECIAL_SHARE_TEXT =
    "I found the one-in-a-thousand ending in Within Tolerance. therealending.com";

  async function handleShare() {
    if (ending!.special) {
      if (navigator.share) {
        try {
          await navigator.share({ title: "Within Tolerance", text: SPECIAL_SHARE_TEXT });
        } catch {
          // Share sheet dismissed — nothing to do.
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(SPECIAL_SHARE_TEXT);
        setShareNote("Copied to clipboard");
      } catch {
        setShareNote(SPECIAL_SHARE_TEXT);
      }
      window.setTimeout(() => setShareNote(""), 3000);
      return;
    }

    const url = `${window.location.origin}/therealending/${canonical}`;
    const shareData = {
      title: "Within Tolerance — The Real Ending",
      text: "My ending to Within Tolerance.",
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Share sheet dismissed — nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied to clipboard");
    } catch {
      setShareNote(url);
    }
    window.setTimeout(() => setShareNote(""), 3000);
  }

  return (
    <main className={`ending${ending.special ? " ending--special" : ""}`}>
      {import.meta.env.DEV && (
        <div style={{ background: "#ff0", color: "#000", padding: "4px 8px", fontFamily: "monospace", fontSize: "12px" }}>
          [DEV] {ending.culprits.join(", ")} — {canonical}
        </div>
      )}
      {ending.special && !revealDone && (
        <div
          className="ending-reveal-overlay"
          onClick={() => setRevealDone(true)}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setRevealDone(true);
          }}
        >
          <span className="ending-reveal-symbol" aria-hidden="true">✦</span>
          <p className="ending-reveal-headline">One in a thousand.</p>
          <p className="ending-reveal-sub">You found it.</p>
          <button className="ending-reveal-skip">Continue reading &rarr;</button>
        </div>
      )}
      <header className="ending-header">
        {!ending.special && (
          <p className="ending-code">
            Your ending: <span>{canonical}</span>
          </p>
        )}
        <h1 className="ending-title">{ending.title}</h1>
      </header>
      <article className="ending-body">
        <Prose>{ending.body}</Prose>
      </article>
      <div className="ending-actions">
        <button className="cta-button" onClick={handleNewEnding}>
          Reveal another ending &rarr;
        </button>
        <button className="ending-action-secondary" onClick={handleShare}>
          Share
        </button>
        {shareNote && (
          <span className="ending-share-note" role="status">
            {shareNote}
          </span>
        )}
      </div>
    </main>
  );
}
