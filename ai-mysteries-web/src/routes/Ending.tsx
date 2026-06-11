import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchEnding, fetchRandomCode, fetchBookMeta } from "../lib/api";
import type { Ending as EndingData, BookMeta } from "../lib/types";
import Prose from "../components/Prose";
import "../styles/ending.css";

type Status = "loading" | "ready" | "notfound" | "error";

export default function Ending() {
  const { bookId = "", code = "" } = useParams<{ bookId: string; code: string }>();
  const navigate = useNavigate();
  const [ending, setEnding] = useState<EndingData | null>(null);
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [shareNote, setShareNote] = useState("");
  const [revealDone, setRevealDone] = useState(false);

  // Book metadata (title for the document title, share strings, special-reveal copy). Once per book.
  useEffect(() => {
    let active = true;
    fetchBookMeta(bookId).then((m) => active && setMeta(m));
    return () => {
      active = false;
    };
  }, [bookId]);

  // Fetch the ending for this code. A fresh ending starts from the top, even if the previous
  // one was scrolled down when "Reveal another ending" was tapped. For the special ending we
  // hide the code from the URL so readers can't share it directly; otherwise we normalize the
  // URL to the canonical code the API returned.
  useEffect(() => {
    let active = true;
    setStatus("loading");
    setRevealDone(false);
    setShareNote("");
    window.scrollTo(0, 0);
    fetchEnding(bookId, code)
      .then((e) => {
        if (!active) return;
        if (!e) {
          setEnding(null);
          setStatus("notfound");
          return;
        }
        setEnding(e);
        setStatus("ready");
        if (e.special) {
          window.history.replaceState(null, "", `/${bookId}/ending`);
        } else if (e.code !== code) {
          window.history.replaceState(null, "", `/${bookId}/ending/${e.code}`);
        }
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [bookId, code]);

  // Tab title follows the book title once metadata loads.
  useEffect(() => {
    document.title = meta ? `AI Mysteries — ${meta.title}` : "AI Mysteries";
  }, [meta]);

  if (status === "loading") {
    return (
      <main className="ending ending--status">
        <p className="ending-status-text">Revealing your ending&hellip;</p>
      </main>
    );
  }

  if (status !== "ready" || !ending) {
    const message =
      status === "error"
        ? "The ending couldn't be loaded right now. Maybe try again in a moment."
        : "That code didn't match any ending. Maybe the letters shifted in transit.";
    return (
      <main className="ending ending--notfound">
        <p className="ending-notfound-text">{message}</p>
        <button
          className="cta-button"
          onClick={async () => {
            try {
              const random = await fetchRandomCode(bookId);
              navigate(`/${bookId}/ending/${random}`, { replace: true });
            } catch {
              /* leave the message in place */
            }
          }}
        >
          Reveal a random ending &rarr;
        </button>
        <Link to="/" className="ending-home">
          &larr; AI Mysteries
        </Link>
      </main>
    );
  }

  const canonical = ending.code;

  async function handleNewEnding() {
    try {
      const next = await fetchRandomCode(bookId, ending!.code);
      navigate(`/${bookId}/ending/${next}`);
    } catch {
      /* keep the current ending on a transient failure */
    }
  }

  async function handleShare() {
    const shareTitle = meta?.shareTitle ?? "";

    if (ending!.special) {
      const specialText = meta?.specialShareText ?? "";
      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: specialText });
        } catch {
          // Share sheet dismissed — nothing to do.
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(specialText);
        setShareNote("Copied to clipboard");
      } catch {
        setShareNote(specialText);
      }
      window.setTimeout(() => setShareNote(""), 3000);
      return;
    }

    const url = `${window.location.origin}/${bookId}/ending/${canonical}`;
    const shareData = {
      title: shareTitle,
      text: meta?.shareText ?? "",
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
        <div
          style={{
            background: "#ff0",
            color: "#000",
            padding: "4px 8px",
            fontFamily: "monospace",
            fontSize: "12px",
          }}
        >
          [DEV] {ending.culprits.join(", ")} — {canonical}
        </div>
      )}
      {ending.special && !revealDone && meta && (
        <div
          className="ending-reveal-overlay"
          onClick={() => setRevealDone(true)}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setRevealDone(true);
          }}
        >
          <span className="ending-reveal-symbol" aria-hidden="true">
            ✦
          </span>
          <p className="ending-reveal-headline">{meta.specialReveal.headline}</p>
          <p className="ending-reveal-sub">{meta.specialReveal.sub}</p>
          <button className="ending-reveal-skip">Continue reading &rarr;</button>
        </div>
      )}
      <div className="ending-bar">
        <Link to="/" className="ending-home">
          &larr; AI Mysteries
        </Link>
      </div>
      <header className="ending-header">
        {!ending.special && (
          <p className="ending-code">
            Your ending: <span>{canonical}</span>
          </p>
        )}
        <h1 className="ending-title">{ending.title}</h1>
      </header>
      <article className="ending-body">
        <Prose markers={ending.markers} clues={ending.clues}>
          {ending.body}
        </Prose>
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
