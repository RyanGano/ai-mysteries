import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchToc, fetchChapterNav, fetchBookMeta, fetchRandomCode, fetchEnding } from "../lib/api";
import { shareOrCopy } from "../lib/share";
import { markdownToSpeech } from "../lib/tts";
import type { Chapter, Ending, BookMeta } from "../lib/types";
import Prose from "../components/Prose";
import Loading from "../components/Loading";
import ReadAloudControls from "../components/ReadAloudControls";
import { useReadAloud, SPECIAL_ANNOUNCE } from "../lib/read-aloud-context";
import { useReadAlong } from "../lib/use-read-along";
import "../styles/read.css";

type State =
  | { status: "loading" }
  | { status: "ready"; meta: BookMeta; chapters: Chapter[] }
  | { status: "missing" }
  | { status: "error" };

// The whole-book reader (/:bookId/all): every chapter laid out on one scroll, with the ending
// appended once the reader presses Listen. Its reason to exist is uninterrupted listening — the
// per-chapter reader auto-advances by fetching + navigating at each boundary, work the browser
// suspends when the screen locks, so playback stalls there. Here the page holds the whole book up
// front and read-aloud speaks one continuous chunk list with nothing on the speech critical path,
// so it plays through with the phone off. The random ending is fetched only on Listen (not on load),
// so a mere visit never burns the book's read counter.
export default function ReadAll() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const articleRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [ending, setEnding] = useState<Ending | null>(null);
  const [shareNote, setShareNote] = useState("");
  const { playList } = useReadAloud();
  useReadAlong(articleRef);

  // Fetch the book metadata, the table of contents, then every chapter body in parallel — all up
  // front so listening never needs the network mid-read.
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    setEnding(null);
    (async () => {
      try {
        const [meta, toc] = await Promise.all([fetchBookMeta(bookId), fetchToc(bookId)]);
        if (!active) return;
        if (!meta || !toc) {
          setState({ status: "missing" });
          return;
        }
        const navs = await Promise.all(toc.map((t) => fetchChapterNav(bookId, t.slug)));
        if (!active) return;
        const chapters = navs.flatMap((n) => (n ? [n.chapter] : []));
        setState({ status: "ready", meta, chapters });
      } catch {
        if (active) setState({ status: "error" });
      }
    })();
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    document.title =
      state.status === "ready" ? `AI Mysteries — ${state.meta.title}` : "AI Mysteries";
  }, [state]);

  // Start reading aloud: pick + fetch the weighted-random ending once (so it's in hand before the
  // screen can lock), render it inline, then speak the whole book as one continuous chunk list.
  async function handleListen() {
    if (state.status !== "ready") return;
    let theEnding = ending;
    if (!theEnding) {
      try {
        const code = await fetchRandomCode(bookId);
        theEnding = await fetchEnding(bookId, code);
      } catch {
        /* speak the chapters even if the ending can't be reached */
      }
      if (theEnding) setEnding(theEnding);
    }
    const chunks = state.chapters.flatMap((ch) => markdownToSpeech(`${ch.title}. ${ch.body}`));
    if (theEnding) {
      const endingChunks = markdownToSpeech(`${theEnding.title}. ${theEnding.body}`);
      if (theEnding.special) endingChunks.unshift(SPECIAL_ANNOUNCE);
      chunks.push(...endingChunks);
    }
    playList(bookId, chunks);
  }

  async function handleShare() {
    if (state.status !== "ready") return;
    const note = await shareOrCopy({
      title: state.meta.shareTitle,
      text: state.meta.shareText,
      url: `${window.location.origin}/${bookId}`,
    });
    if (!note) return;
    setShareNote(note);
    window.setTimeout(() => setShareNote(""), 3000);
  }

  if (state.status === "loading") {
    return <Loading variant="read" />;
  }

  if (state.status !== "ready") {
    const message =
      state.status === "missing"
        ? "We couldn't find that book."
        : "The book couldn't be loaded right now. Please try again in a moment.";
    return (
      <main className="read read--status">
        <p className="read-status-text">{message}</p>
        <Link to="/" className="read-home">
          Home
        </Link>
      </main>
    );
  }

  const { meta, chapters } = state;

  return (
    <main className="read read-all">
      <div className="read-bar">
        <Link to={`/${bookId}`} className="read-toc-button">
          Book home
        </Link>
        <button className="read-toc-button" onClick={handleShare}>
          Share
        </button>
        <Link to="/" className="read-home">
          Home
        </Link>
        <ReadAloudControls onPlay={handleListen} />
        {shareNote && (
          <span className="read-share-note" role="status">
            {shareNote}
          </span>
        )}
      </div>

      <header className="read-header">
        <Link to={`/${bookId}`} className="read-book-title">
          {meta.title}
        </Link>
        <h1 className="read-title">Read the whole book</h1>
        <p className="read-all-hint">
          The whole book on one page — press Listen to hear it read straight through, even with your
          screen off.
        </p>
      </header>

      <article className="read-body" ref={articleRef}>
        {chapters.map((ch) => (
          <section key={ch.slug} className="read-all-chapter">
            <h2 className="read-all-chapter-title">{ch.title}</h2>
            <Prose>{ch.body}</Prose>
          </section>
        ))}

        {ending ? (
          <section className="read-all-chapter read-all-ending">
            <h2 className="read-all-chapter-title">{ending.title}</h2>
            <Prose markers={ending.markers} clues={ending.clues}>
              {ending.body}
            </Prose>
          </section>
        ) : (
          meta.payoff.length > 0 && (
            <section className="read-payoff">
              {meta.payoff.map((para, i) => (
                <p key={i} className="read-payoff-text">
                  {para}
                </p>
              ))}
              <button className="cta-button" onClick={() => navigate(`/${bookId}/ending`)}>
                Reveal your ending &rarr;
              </button>
            </section>
          )
        )}
      </article>
    </main>
  );
}
