import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { getChapterNav, firstChapterSlug } from "../lib/book";
import { clues } from "../content/endings/clues";
import Prose from "../components/Prose";
import TableOfContents from "../components/TableOfContents";
import "../styles/read.css";

const normalize = (s: string) => s.replace(/[_*`]/g, "").replace(/\s+/g, " ").trim();

export default function Read() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clueId = searchParams.get("clue");
  const articleRef = useRef<HTMLElement>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const nav = getChapterNav(slug);

  // Start each chapter from the top and close the drawer when the slug changes — unless we
  // arrived via a ?clue= deep link, in which case the highlight effect scrolls instead.
  useEffect(() => {
    if (!clueId) window.scrollTo(0, 0);
    setTocOpen(false);
  }, [slug, clueId]);

  // Deep link from an ending's cross-reference: scroll to the foreshadowing paragraph and
  // highlight it briefly. Matches on whitespace/markdown-normalized text so it survives the
  // manuscript's curly quotes and italics.
  useEffect(() => {
    const clue = clueId ? clues[clueId] : undefined;
    if (!clue || !articleRef.current) return;
    const targets = clue.fragments.map(normalize).filter(Boolean);
    const paras = Array.from(articleRef.current.querySelectorAll("p"));
    const hit = paras.find((p) => {
      const text = normalize(p.textContent || "");
      return targets.some((f) => text.includes(f));
    });
    if (!hit) return;
    hit.scrollIntoView({ block: "center" });
    hit.classList.add("clue-highlight");
    const timer = window.setTimeout(() => hit.classList.remove("clue-highlight"), 2600);
    return () => window.clearTimeout(timer);
  }, [slug, clueId]);

  // Unknown slug — fall back to the first chapter.
  if (!nav) return <Navigate to={`/read/${firstChapterSlug}`} replace />;

  const { chapter, prev, next, isLast } = nav;

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

      <TableOfContents open={tocOpen} onClose={() => setTocOpen(false)} currentSlug={slug} />

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
