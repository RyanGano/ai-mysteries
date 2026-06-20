import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { fetchToc, fetchChapterNav, fetchClue, fetchBookMeta } from "../lib/api";
import { shareOrCopy } from "../lib/share";
import type { TocEntry, ChapterNav, BookMeta } from "../lib/types";
import Prose from "../components/Prose";
import TableOfContents from "../components/TableOfContents";
import Loading from "../components/Loading";
import ReadAloudControls from "../components/ReadAloudControls";
import { useReadAloud } from "../lib/read-aloud-context";
import { useReadAlong } from "../lib/use-read-along";
import "../styles/read.css";

const normalize = (s: string) => s.replace(/[_*`]/g, "").replace(/\s+/g, " ").trim();

type NavState =
  | { status: "loading" }
  | { status: "ready"; nav: ChapterNav }
  | { status: "missing" };

export default function Read() {
  const { bookId = "", slug = "" } = useParams<{ bookId: string; slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clueId = searchParams.get("clue");
  const articleRef = useRef<HTMLElement>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [navState, setNavState] = useState<NavState>({ status: "loading" });
  const [error, setError] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const { playChapter } = useReadAloud();
  useReadAlong(articleRef);

  // The table of contents (drawer + first-chapter fallback) and the book metadata (title for the
  // document title, end-of-book payoff copy). Fetched once per book.
  useEffect(() => {
    let active = true;
    fetchToc(bookId)
      .then((t) => active && setToc(t ?? []))
      .catch(() => active && setError(true));
    fetchBookMeta(bookId)
      .then((m) => active && setMeta(m))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [bookId]);

  // Fetch the current chapter and its prev/next neighbours.
  useEffect(() => {
    if (!slug) return;
    let active = true;
    setNavState({ status: "loading" });
    fetchChapterNav(bookId, slug)
      .then((n) => active && setNavState(n ? { status: "ready", nav: n } : { status: "missing" }))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [bookId, slug]);

  // Unknown slug → fall back to the first chapter.
  useEffect(() => {
    if (navState.status === "missing" && toc && toc.length) {
      navigate(`/${bookId}/${toc[0].slug}`, { replace: true });
    }
  }, [navState, toc, navigate, bookId]);

  // Start each chapter from the top and close the drawer when the slug changes — unless we
  // arrived via a ?clue= deep link, in which case the highlight effect scrolls instead.
  useEffect(() => {
    if (!clueId) window.scrollTo(0, 0);
    setTocOpen(false);
  }, [slug, clueId]);

  useEffect(() => {
    if (navState.status === "ready" && meta) {
      document.title = `AI Mysteries — ${meta.title} (${navState.nav.chapter.title})`;
    } else {
      document.title = "AI Mysteries";
    }
  }, [navState, meta]);

  // Deep link from an ending's cross-reference: fetch the clue, scroll to the foreshadowing
  // paragraph and highlight it briefly. Matches on whitespace/markdown-normalized text so it
  // survives the manuscript's curly quotes and italics.
  useEffect(() => {
    if (!clueId || navState.status !== "ready") return;
    let active = true;
    let timer = 0;
    fetchClue(bookId, clueId).then((clue) => {
      if (!active || !clue || !articleRef.current) return;
      const targets = clue.fragments.map(normalize).filter(Boolean);
      const paras = Array.from(articleRef.current.querySelectorAll("p"));
      const hit = paras.find((p) => {
        const text = normalize(p.textContent || "");
        return targets.some((f) => text.includes(f));
      });
      if (!hit) return;
      hit.scrollIntoView({ block: "center" });
      hit.classList.add("clue-highlight");
      timer = window.setTimeout(() => hit.classList.remove("clue-highlight"), 2600);
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [bookId, clueId, navState]);

  // Share a link to the book's landing page (the cover + blurb) — never a chapter deep link, so
  // the recipient meets the story before reading.
  async function handleShare() {
    const note = await shareOrCopy({
      title: meta?.shareTitle ?? "",
      text: meta?.shareText ?? "",
      url: `${window.location.origin}/${bookId}`,
    });
    if (!note) return;
    setShareNote(note);
    window.setTimeout(() => setShareNote(""), 3000);
  }

  if (error) {
    return (
      <main className="read read--status">
        <p className="read-status-text">
          The book couldn&rsquo;t be loaded right now. Please try again in a moment.
        </p>
        <Link to="/" className="read-home">
          AI Mysteries
        </Link>
      </main>
    );
  }

  if (navState.status !== "ready") {
    return <Loading variant="read" />;
  }

  const { chapter, prev, next, isLast } = navState.nav;

  return (
    <main className="read">
      <div className="read-bar">
        <div className="read-bar-actions">
          <button className="read-toc-button" onClick={() => setTocOpen(true)}>
            Contents
          </button>
          <button className="read-toc-button" onClick={handleShare}>
            Share
          </button>
          <ReadAloudControls onPlay={() => playChapter(bookId, slug)} />
          {shareNote && (
            <span className="read-share-note" role="status">
              {shareNote}
            </span>
          )}
        </div>
        <Link to="/" className="read-home">
          AI Mysteries
        </Link>
      </div>

      <TableOfContents
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        currentSlug={slug}
        entries={toc ?? []}
        bookId={bookId}
        codePlaceholder={meta?.codePlaceholder}
        secretBlurb={meta?.secretBlurb}
      />

      <header className="read-header">
        {meta && (
          <Link to={`/${bookId}`} className="read-book-title">
            {meta.title}
          </Link>
        )}
        <h1 className="read-title">{chapter.title}</h1>
      </header>

      <article className="read-body" ref={articleRef}>
        <Prose>{chapter.body}</Prose>
      </article>

      {isLast && meta && meta.payoff.length > 0 && (
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
      )}

      <nav className="read-nav" aria-label="Chapter navigation">
        {prev ? (
          <Link to={`/${bookId}/${prev.slug}`} className="read-nav-link read-nav-prev">
            &larr; {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/${bookId}/${next.slug}`} className="read-nav-link read-nav-next">
            {next.title} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
