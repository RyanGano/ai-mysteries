import { useEffect, useState } from "react";
import "../styles/loading.css";

// The API runs on a free tier that can take several seconds to cold-start. Rather than a bare
// "Loading…", every route shows a skeleton that mirrors its eventual layout (so content swaps in
// without a jolt) plus a caption that fades through a few lines — turning the wait into a moment of
// onboarding to the site's hook. The copy here is generic, spoiler-free site chrome (the same
// category as the catalog tagline): it must never mention a specific book, ending, or culprit.

type Variant = "catalog" | "book" | "read" | "ending";

// Shown on the content routes — explains what the site is and how the ending mechanic works.
const SITE_CAPTIONS = [
  "Every story here was written by AI.",
  "And every one has more than one ending.",
  "Each one stops just short of the end — until you reveal it.",
  "Read to the last page, then find the ending that's yours.",
];

// Shown while an ending is being drawn — frames the wait as the draw itself, not an explainer.
const ENDING_CAPTIONS = [
  "Shuffling the possibilities…",
  "No two readers land on quite the same ending.",
  "Settling on yours…",
];

const ROTATE_MS = 3200;

export default function Loading({ variant }: { variant: Variant }) {
  const captions = variant === "ending" ? ENDING_CAPTIONS : SITE_CAPTIONS;
  return (
    <main className={`loading loading--${variant}`} aria-busy="true">
      {/* One static, polite announcement for assistive tech; the rotating caption below is
          decorative (aria-hidden) so screen readers aren't spammed with each fade. */}
      <p className="loading-sr-only" role="status">
        Loading, please wait.
      </p>
      {variant === "ending" ? <EndingSkeleton /> : <PageSkeleton variant={variant} />}
      <Caption lines={captions} />
    </main>
  );
}

// Cross-fades through the lines. The key on the <p> remounts it each step so the fade-in animation
// replays; reduced-motion users get a plain swap (see loading.css).
function Caption({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length <= 1) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % lines.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [lines]);
  return (
    <p className="loading-caption" aria-hidden="true">
      <span key={i} className="loading-caption-line">
        {lines[i]}
      </span>
    </p>
  );
}

function Bar({ w }: { w: string }) {
  return <span className="loading-bar" style={{ width: w }} />;
}

// A faithful-enough skeleton of each page so the real content lands in roughly the same place.
function PageSkeleton({ variant }: { variant: Exclude<Variant, "ending"> }) {
  if (variant === "catalog") {
    return (
      <div className="loading-catalog" aria-hidden="true">
        <div className="loading-catalog-head">
          <Bar w="14ch" />
          <Bar w="40ch" />
        </div>
        <div className="loading-cards">
          {[0, 1, 2].map((n) => (
            <div className="loading-card" key={n}>
              <span className="loading-cover" />
              <div className="loading-card-text">
                <Bar w="60%" />
                <span className="loading-pills">
                  <span className="loading-pill" />
                  <span className="loading-pill" />
                </span>
                <Bar w="35%" />
                <Bar w="100%" />
                <Bar w="85%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "book") {
    return (
      <div className="loading-book" aria-hidden="true">
        <span className="loading-book-cover" />
        <Bar w="16ch" />
        <span className="loading-pills loading-pills--center">
          <span className="loading-pill" />
          <span className="loading-pill" />
        </span>
        <div className="loading-lines">
          <Bar w="100%" />
          <Bar w="96%" />
          <Bar w="90%" />
        </div>
        <span className="loading-button" />
      </div>
    );
  }

  // read
  return (
    <div className="loading-read" aria-hidden="true">
      <div className="loading-read-bar">
        <span className="loading-chip" />
        <span className="loading-chip" />
      </div>
      <Bar w="50%" />
      <div className="loading-lines loading-lines--prose">
        {["100%", "97%", "92%", "98%", "88%", "100%", "70%"].map((w, n) => (
          <Bar w={w} key={n} />
        ))}
      </div>
    </div>
  );
}

// The ending reveal is the payoff moment — a structural skeleton would spoil the page's shape, so
// this stays a centered draw with a pulsing glyph.
function EndingSkeleton() {
  return (
    <div className="loading-ending" aria-hidden="true">
      <span className="loading-ending-glyph">&#10022;</span>
    </div>
  );
}
