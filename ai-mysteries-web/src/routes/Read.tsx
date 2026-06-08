import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, Navigate } from "react-router-dom";
import { getChapterNav, firstChapterSlug } from "../lib/book";
import Prose from "../components/Prose";
import TableOfContents from "../components/TableOfContents";
import "../styles/read.css";

export default function Read() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tocOpen, setTocOpen] = useState(false);
  const nav = getChapterNav(slug);

  // Start each chapter from the top and close the drawer when the slug changes.
  useEffect(() => {
    window.scrollTo(0, 0);
    setTocOpen(false);
  }, [slug]);

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

      <article className="read-body">
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
