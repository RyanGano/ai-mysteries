import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchToc } from "../lib/api";
import "../styles/landing.css";

type State = { status: "loading" } | { status: "missing" } | { status: "error" };

// The book's entry point. There is no per-book marketing page any more: landing on /:bookId
// sends the reader straight into the first chapter. The cover/summary live on the catalog card;
// the code-entry and reveal-ending controls live in the reader's Endings drawer.
export default function BookEntry() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetchToc(bookId)
      .then((toc) => {
        if (!active) return;
        if (toc && toc.length) navigate(`/${bookId}/${toc[0].slug}`, { replace: true });
        else setState({ status: "missing" });
      })
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, [bookId, navigate]);

  if (state.status === "loading") {
    return (
      <main className="landing landing--status">
        <p className="landing-status-text">Loading&hellip;</p>
      </main>
    );
  }

  const message =
    state.status === "missing"
      ? "We couldn't find that book."
      : "The book couldn't be loaded right now. Please try again in a moment.";
  return (
    <main className="landing landing--status">
      <p className="landing-status-text">{message}</p>
      <Link to="/" className="landing-back">
        &larr; AI Mysteries
      </Link>
    </main>
  );
}
