import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { fetchToc, fetchChapterNav, fetchClue } from "../lib/api";
import type { TocEntry, ChapterNav } from "../lib/types";
import Prose from "../components/Prose";
import TableOfContents from "../components/TableOfContents";
import "../styles/read.css";

const normalize = (s: string) => s.replace(/[_*`]/g, "").replace(/\s+/g, " ").trim();

type NavState =
  | { status: "loading" }
  | { status: "ready"; nav: ChapterNav }
  | { status: "missing" };

export default function Read() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clueId = searchParams.get("clue");
  const articleRef = useRef<HTMLElement>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [navState, setNavState] = useState<NavState>({ status: "loading" });
  const [error, setError] = useState(false);

  // The table of contents (drawer + first-chapter fallback). Fetched once.
  useEffect(() => {
    let active = true;
    fetchToc()
      .then((t) => active && setToc(t ?? []))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  // No slug (/read) → redirect to the first chapter once the TOC is known.
  useEffect(() => {
    if (!slug && toc && toc.length) navigate(`/read/${toc[0].slug}`, { replace: true });
  }, [slug, toc, navigate]);

  // Fetch the current chapter and its prev/next neighbours.
  useEffect(() => {
    if (!slug) return;
    let active = true;
    setNavState({ status: "loading" });
    fetchChapterNav(slug)
      .then((n) => active && setNavState(n ? { status: "ready", nav: n } : { status: "missing" }))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [slug]);

  // Unknown slug → fall back to the first chapter.
  useEffect(() => {
    if (navState.status === "missing" && toc && toc.length) {
      navigate(`/read/${toc[0].slug}`, { replace: true });
    }
  }, [navState, toc, navigate]);

  // Start each chapter from the top and close the drawer when the slug changes — unless we
  // arrived via a ?clue= deep link, in which case the highlight effect scrolls instead.
  useEffect(() => {
    if (!clueId) window.scrollTo(0, 0);
    setTocOpen(false);
  }, [slug, clueId]);

  // Deep link from an ending's cross-reference: fetch the clue, scroll to the foreshadowing
  // paragraph and highlight it briefly. Matches on whitespace/markdown-normalized text so it
  // survives the manuscript's curly quotes and italics.
  useEffect(() => {
    if (!clueId || navState.status !== "ready") return;
    let active = true;
    let timer = 0;
    fetchClue(clueId).then((clue) => {
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
  }, [clueId, navState]);

  if (error) {
    return (
      <main className="read read--status">
        <p className="read-status-text">
          The book couldn&rsquo;t be loaded right now. Please try again in a moment.
        </p>
        <Link to="/" className="read-home">
          Within Tolerance
        </Link>
      </main>
    );
  }

  if (navState.status !== "ready") {
    return (
      <main className="read read--status">
        <p className="read-status-text">Loading&hellip;</p>
      </main>
    );
  }

  const { chapter, prev, next, isLast } = navState.nav;

  return (
    <main className="read">
      <div className="read-bar">
        <button className="read-toc-button" onClick={() => setTocOpen(true)}>
          Contents
        </button>
        <Link to="/" className="read-home">
          Within Tolerance
        </Link>
      </div>

      <TableOfContents
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        currentSlug={slug}
        entries={toc ?? []}
      />

      <header className="read-header">
        <h1 className="read-title">{chapter.title}</h1>
      </header>

      <article className="read-body" ref={articleRef}>
        <Prose>{chapter.body}</Prose>
      </article>

      {isLast && (
        <section className="read-payoff">
          <p className="read-payoff-text">
            The book ends here &mdash; but the truth has more than one shape. Five suspects. One
            system. No shortage of reasons.
          </p>
          <p className="read-payoff-text">
            Find out what <em>really</em> happened that morning in the Charge Cage.
          </p>
          <button className="cta-button" onClick={() => navigate("/therealending")}>
            Reveal the real ending &rarr;
          </button>
        </section>
      )}

      <nav className="read-nav" aria-label="Chapter navigation">
        {prev ? (
          <Link to={`/read/${prev.slug}`} className="read-nav-link read-nav-prev">
            &larr; {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/read/${next.slug}`} className="read-nav-link read-nav-next">
            {next.title} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
