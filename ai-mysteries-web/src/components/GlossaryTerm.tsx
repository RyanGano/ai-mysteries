import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { GlossaryContext } from "../lib/glossary-context";
import "../styles/glossary.css";

const MARGIN = 12; // keep the popover this far from the viewport edge
const GAP = 6; // gap between the word and the popover

// A glossary term in prose: the word itself, quietly dotted-underlined, with its definition in
// a popover on hover (click to pin). Same interaction contract as XrefMarker — portaled and
// viewport-clamped on desktop, a bottom sheet on phones — but the trigger is the word, not a
// glyph, so nothing extra enters the paragraph's text flow (which keeps read-along matching
// intact).
export default function GlossaryTerm({ term, children }: { term: string; children: ReactNode }) {
  const glossary = useContext(GlossaryContext);
  const entry = glossary[term];
  const [open, setOpen] = useState(false);
  // Why it's open: a hover auto-closes on leave; a click pins it open until dismissed.
  const reasonRef = useRef<"hover" | "click" | null>(null);
  const closeTimer = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState(false); // phone: render as a bottom sheet, not anchored
  const panelId = useId();

  // Position the popover in viewport coords (it's portaled to <body>), clamped so it never runs
  // off-screen — preferring below the word, flipping above when there isn't room.
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

  // An entry can be missing only if data drifted; render the plain word rather than a dead
  // underline.
  if (!entry) return <>{children}</>;

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
  // Hover-bridge: delay closing so moving from the word into the (portaled) popover doesn't
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
      aria-label="Definition"
      className={sheet ? "gloss-popover gloss-popover--sheet" : "gloss-popover"}
      style={
        sheet
          ? undefined
          : { top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }
      }
      onMouseEnter={() => window.clearTimeout(closeTimer.current)}
      onMouseLeave={scheduleClose}
    >
      <span className="gloss-popover-head">
        <span className="gloss-term">{entry.term}</span>
        <button type="button" className="gloss-close" aria-label="Close" onClick={doClose}>
          &times;
        </button>
      </span>
      <span className="gloss-definition">{entry.definition}</span>
    </span>
  ) : null;

  return (
    <span className="gloss">
      <button
        ref={btnRef}
        type="button"
        className="gloss-word"
        aria-label={`Definition of ${entry.term}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onClick}
        onMouseEnter={onEnter}
        onMouseLeave={scheduleClose}
      >
        {children}
      </button>
      {popover && createPortal(popover, document.body)}
    </span>
  );
}
