import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CluesContext } from "../lib/clues-context";
import "../styles/xref.css";

// Strip light markdown markers so the popover shows clean prose and fragment matching works.
const MARKERS = /[_*`]/g;
const strip = (s: string) => s.replace(MARKERS, "");

const MARGIN = 12; // keep the popover this far from the viewport edge
const GAP = 6; // gap between glyph and popover

// Render a passage with the first matching clue fragment highlighted. Fragments that span
// multiple paragraphs won't be a contiguous substring of any single passage — those just
// render plain (the short dialogue lines are effectively the quote anyway).
function renderPassage(passage: string, fragments: string[]) {
  const text = strip(passage);
  for (const f of fragments) {
    const frag = strip(f);
    if (!frag) continue;
    const i = text.indexOf(frag);
    if (i !== -1) {
      return (
        <>
          {text.slice(0, i)}
          <mark>{text.slice(i, i + frag.length)}</mark>
          {text.slice(i + frag.length)}
        </>
      );
    }
  }
  return <>{text}</>;
}

export default function XrefMarker({ clueId }: { clueId: string }) {
  const clues = useContext(CluesContext);
  const clue = clues[clueId];
  const [open, setOpen] = useState(false);
  // Why it's open: a hover auto-closes on leave; a click pins it open until dismissed.
  const reasonRef = useRef<"hover" | "click" | null>(null);
  const closeTimer = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState(false); // phone: render as a bottom sheet, not anchored
  const panelId = useId();

  // Position the popover in viewport coords (it's portaled to <body>), clamped so it never
  // runs off-screen — preferring below the glyph, flipping above when there isn't room.
  useLayoutEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 34rem)").matches;
    setSheet(mobile);
    if (mobile) {
      setPos(null);
      return;
    }
    function compute() {
      const btn = btnRef.current;
      const pop = popRef.current;
      if (!btn || !pop) return;
      const b = btn.getBoundingClientRect();
      const r = pop.getBoundingClientRect();
      const left = Math.max(MARGIN, Math.min(b.left, window.innerWidth - r.width - MARGIN));
      let top = b.bottom + GAP;
      if (top + r.height > window.innerHeight - MARGIN) {
        const above = b.top - GAP - r.height;
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - r.height - MARGIN);
      }
      setPos({ top, left });
    }
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      doClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") doClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A clue can be missing only if data drifted; render nothing rather than a dead glyph.
  if (!clue) return null;

  function doClose() {
    reasonRef.current = null;
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    btnRef.current?.focus();
  }
  function onClick() {
    if (reasonRef.current === "click") {
      doClose();
    } else {
      reasonRef.current = "click";
      setOpen(true);
    }
  }
  function onEnter() {
    window.clearTimeout(closeTimer.current);
    if (reasonRef.current !== "click") {
      reasonRef.current = reasonRef.current ?? "hover";
      setOpen(true);
    }
  }
  // Hover-bridge: delay closing so moving from the glyph into the (portaled) popover doesn't
  // dismiss it. A click-pinned popover ignores hover-leave entirely.
  function scheduleClose() {
    if (reasonRef.current !== "hover") return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (reasonRef.current === "hover") {
        reasonRef.current = null;
        setOpen(false);
      }
    }, 150);
  }

  const popover = open ? (
    <span
      ref={popRef}
      id={panelId}
      role="dialog"
      aria-label="Foreshadowing"
      className={sheet ? "xref-popover xref-popover--sheet" : "xref-popover"}
      style={
        sheet
          ? undefined
          : { top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }
      }
      onMouseEnter={() => window.clearTimeout(closeTimer.current)}
      onMouseLeave={scheduleClose}
    >
      <span className="xref-popover-head">
        <span className="xref-chapter">{clue.chapterTitle}</span>
        <button type="button" className="xref-close" aria-label="Close" onClick={doClose}>
          &times;
        </button>
      </span>
      <span className="xref-passage">
        {clue.passages.map((p, i) => (
          <span className="xref-para" key={i}>
            {renderPassage(p, clue.fragments)}
          </span>
        ))}
      </span>
      <a
        className="xref-link"
        href={`/read/${clue.chapterSlug}?clue=${clueId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Read this scene in context &rarr;
      </a>
    </span>
  ) : null;

  return (
    <span className="xref">
      <button
        ref={btnRef}
        type="button"
        className="xref-glyph"
        aria-label="Where this was foreshadowed"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onClick}
        onMouseEnter={onEnter}
        onMouseLeave={scheduleClose}
      >
        <BinocularsIcon />
      </button>
      {popover && createPortal(popover, document.body)}
    </span>
  );
}

function BinocularsIcon() {
  return (
    <svg className="xref-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4.5h2.2c.4 0 .8.4.8.8V8M15 4.5h-2.2c-.4 0-.8.4-.8.8V8M8.4 8.2 6.2 14.2M15.6 8.2l2.2 6M6.4 11h11.2"
      />
      <circle cx="6.2" cy="15.8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.8" cy="15.8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
