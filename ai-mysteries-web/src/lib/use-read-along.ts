// Keeps the page in step with the read-aloud voice: as each sentence is spoken it scrolls the
// paragraph that contains it into view and highlights the sentence. Subscribes imperatively (no
// per-sentence React re-render) and works the same on the chapter reader and the ending page.
import { useEffect } from "react";
import { useReadAloud } from "./read-aloud-context";

const HIGHLIGHT_NAME = "read-aloud";

// Match the normalization the engine applies to the spoken text: drop the markdown emphasis markers
// the rendered DOM no longer carries, and collapse whitespace.
const normalize = (s: string) => s.replace(/[_*`]/g, "").replace(/\s+/g, " ").trim();

// The CSS Custom Highlight API, when the browser supports it (Chrome/Edge 105+, Safari 17.2+,
// Firefox 140+). Used to tint the exact sentence without mutating React's DOM; absent → paragraph
// highlight + scroll still work.
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}
interface HighlightCtor {
  new (range: Range): unknown;
}
function highlightApi(): { registry: HighlightRegistryLike; Ctor: HighlightCtor } | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistryLike } }).CSS;
  const Ctor = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  return css?.highlights && Ctor ? { registry: css.highlights, Ctor } : null;
}

// Find the paragraph whose text contains the spoken sentence. Searches forward from the last hit
// (then wraps) so a sentence repeated elsewhere doesn't drag the view backwards.
function findParagraph(
  container: HTMLElement,
  target: string,
  from: number
): { el: HTMLElement; index: number } | null {
  const paras = Array.from(container.querySelectorAll("p"));
  for (let k = 0; k < paras.length; k++) {
    const index = (from + k) % paras.length;
    if (normalize(paras[index].textContent || "").includes(target)) {
      return { el: paras[index] as HTMLElement, index };
    }
  }
  return null;
}

// Build a DOM Range over `target` inside `el`, mapping each kept (normalized) character back to its
// source text node + offset so the range survives nested inline markup (italics, cross-ref glyphs).
function rangeFor(el: HTMLElement, target: string): Range | null {
  const map: { node: Text; offset: number }[] = [];
  let norm = "";
  let prevSpace = false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.nodeValue || "";
    for (let o = 0; o < text.length; o++) {
      const ch = text[o];
      if (ch === "_" || ch === "*" || ch === "`") continue; // stripped by normalize
      if (/\s/.test(ch)) {
        if (norm.length === 0 || prevSpace) continue; // trim/collapse whitespace
        norm += " ";
        map.push({ node, offset: o });
        prevSpace = true;
      } else {
        norm += ch;
        map.push({ node, offset: o });
        prevSpace = false;
      }
    }
    node = walker.nextNode() as Text | null;
  }
  const trimmed = norm.replace(/\s+$/, "");
  const start = trimmed.indexOf(target);
  if (start < 0) return null;
  const end = start + target.length - 1;
  if (end >= map.length) return null;
  const range = document.createRange();
  range.setStart(map[start].node, map[start].offset);
  range.setEnd(map[end].node, map[end].offset + 1);
  return range;
}

function inView(rect: DOMRect): boolean {
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.height > 0 && rect.top >= 0 && rect.bottom <= vh;
}

export function useReadAlong(containerRef: { current: HTMLElement | null }) {
  const { subscribeReading } = useReadAloud();

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const hl = highlightApi();
    let lastEl: HTMLElement | null = null;
    let lastIndex = 0;

    const clear = () => {
      lastEl?.classList.remove("ra-current");
      lastEl = null;
      hl?.registry.delete(HIGHLIGHT_NAME);
    };

    const unsubscribe = subscribeReading((text) => {
      const container = containerRef.current;
      if (!text || !container) {
        clear();
        return;
      }
      const target = normalize(text);
      if (!target) return;

      const hit = findParagraph(container, target, lastIndex);
      if (!hit) return; // e.g. the chapter title (an <h1>, not a <p>) — leave the view as-is

      if (lastEl && lastEl !== hit.el) lastEl.classList.remove("ra-current");
      hit.el.classList.add("ra-current");
      lastEl = hit.el;
      lastIndex = hit.index;

      const range = hl ? rangeFor(hit.el, target) : null;
      if (hl) {
        if (range) hl.registry.set(HIGHLIGHT_NAME, new hl.Ctor(range));
        else hl.registry.delete(HIGHLIGHT_NAME);
      }

      const rect = (range ?? hit.el).getBoundingClientRect();
      if (!inView(rect)) {
        hit.el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      }
    });

    return () => {
      unsubscribe();
      clear();
    };
  }, [subscribeReading, containerRef]);
}
