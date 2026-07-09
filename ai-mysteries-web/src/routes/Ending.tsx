import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchEnding, fetchRandomEnding, fetchBookMeta, fetchGlossary } from "../lib/api";
import { shareOrCopy } from "../lib/share";
import { getSeen, addSeen } from "../lib/seen-endings";
import type { Ending as EndingData, BookMeta, GlossaryEntry } from "../lib/types";
import Prose from "../components/Prose";
import Loading from "../components/Loading";
import EndingsExhausted from "../components/EndingsExhausted";
import ReadAloudControls from "../components/ReadAloudControls";
import { useReadAloud } from "../lib/read-aloud-context";
import { useReadAlong } from "../lib/use-read-along";
import "../styles/ending.css";

type Status = "loading" | "ready" | "notfound" | "error";

export default function Ending() {
  const { bookId = "", code = "" } = useParams<{ bookId: string; code: string }>();
  const navigate = useNavigate();
  const [ending, setEnding] = useState<EndingData | null>(null);
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [shareNote, setShareNote] = useState("");
  const [revealDone, setRevealDone] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const { playEnding } = useReadAloud();
  const bodyRef = useRef<HTMLElement>(null);
  useReadAlong(bodyRef);

  // Book metadata (title for the document title, share strings, special-reveal copy). Once per book.
  useEffect(() => {
    let active = true;
    fetchBookMeta(bookId).then((m) => active && setMeta(m));
    // Unfamiliar-word definitions (cached per book). Non-critical — a failure just renders no
    // underlines.
    fetchGlossary(bookId).then((g) => active && setGlossary(g));
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
    setExhausted(false);
    // Instant jump (not the global smooth scroll): the smooth animation would start on the old
    // ending and be canceled by the DOM swap, leaving the reader stranded partway down.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
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
        // Remember every ending the reader is actually shown (ordinary, special, or a shared link)
        // so this session never reveals the same one twice.
        addSeen(bookId, e.code);
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

  if (exhausted) {
    return <EndingsExhausted bookId={bookId} />;
  }

  if (status === "loading") {
    return <Loading variant="ending" />;
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
              const random = await fetchRandomEnding(bookId, getSeen(bookId));
              if ("exhausted" in random) {
                setExhausted(true);
                return;
              }
              navigate(`/${bookId}/ending/${random.code}`, { replace: true });
            } catch {
              /* leave the message in place */
            }
          }}
        >
          Reveal a random ending &rarr;
        </button>
        <Link to="/" className="ending-home">
          &larr; Home
        </Link>
      </main>
    );
  }

  const canonical = ending.code;

  async function handleNewEnding() {
    try {
      const next = await fetchRandomEnding(bookId, getSeen(bookId), ending!.code);
      if ("exhausted" in next) {
        setExhausted(true);
        return;
      }
      navigate(`/${bookId}/ending/${next.code}`);
    } catch {
      /* keep the current ending on a transient failure */
    }
  }

  function flashNote(note: string) {
    if (!note) return;
    setShareNote(note);
    window.setTimeout(() => setShareNote(""), 3000);
  }

  // Share this exact ending. The special ending shares only teaser text with no link, so it can't
  // be handed out directly; every other ending shares its permanent code URL.
  async function handleShareEnding() {
    const shareTitle = meta?.shareTitle ?? "";
    if (ending!.special) {
      flashNote(await shareOrCopy({ title: shareTitle, text: meta?.specialShareText ?? "" }));
      return;
    }
    flashNote(
      await shareOrCopy({
        title: shareTitle,
        text: meta?.shareText ?? "",
        url: `${window.location.origin}/${bookId}/ending/${canonical}`,
      })
    );
  }

  // Share the story itself — a link to the book's landing page, never this ending — so the
  // recipient meets the book without having an ending spoiled.
  async function handleShareStory() {
    flashNote(
      await shareOrCopy({
        title: meta?.shareTitle ?? "",
        text: meta?.shareText ?? "",
        url: `${window.location.origin}/${bookId}`,
      })
    );
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
          &larr; Home
        </Link>
        <ReadAloudControls onPlay={() => playEnding(bookId, canonical)} />
      </div>
      <header className="ending-header">
        {meta && (
          <Link to={`/${bookId}`} className="ending-book-title">
            {meta.title}
          </Link>
        )}
        {!ending.special && (
          <p className="ending-code">
            Your ending: <span>{canonical}</span>
          </p>
        )}
        <h1 className="ending-title">{ending.title}</h1>
      </header>
      <article className="ending-body" ref={bodyRef}>
        <Prose markers={ending.markers} clues={ending.clues} glossary={glossary}>
          {ending.body}
        </Prose>
      </article>
      <div className="ending-actions">
        <button className="cta-button" onClick={handleNewEnding}>
          Reveal another ending &rarr;
        </button>
        <button className="ending-action-secondary" onClick={handleShareEnding}>
          Share this ending
        </button>
        <button className="ending-action-secondary" onClick={handleShareStory}>
          Share this story
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
