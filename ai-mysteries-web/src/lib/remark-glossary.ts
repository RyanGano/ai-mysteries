// remark plugin: underlines glossary terms in prose. For each entry it finds the FIRST
// occurrence of the term (or an alias) in the rendered body — case-insensitive, on word
// boundaries — and wraps just that occurrence in a custom mdast `gloss` node. remark-rehype
// renders it as <gloss data-term="…"> via data.hName / hProperties, and Prose maps that element
// to the <GlossaryTerm> component (a quiet dotted underline with a definition popover).
//
// First-occurrence-only keeps the page calm: a period book can use a word forty times without
// looking like a reference article. The matched word stays a real text child of the node, so
// the paragraph's textContent is unchanged and the read-along highlighter is unaffected.
// Runs after remark-xref in the plugin list; it only touches `text` nodes, so injected xref
// nodes and inlineCode (which has no children) are naturally skipped.

import type { GlossaryEntry } from "./types";

interface Pattern {
  term: string; // the canonical term — the key GlossaryTerm uses to look up the definition
  regex: RegExp;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One regex per entry, alternating the term with its aliases (longest first so "blue domino"
// wins over "domino" at the same position). Unicode-aware word boundaries: a match can't butt
// up against a letter or digit, so "art" never matches inside "party", and accented terms
// (fête) work where \b would not.
function buildPatterns(entries: GlossaryEntry[]): Pattern[] {
  return entries
    .filter((e) => e.term && e.definition)
    .map((e) => {
      const forms = [e.term, ...e.aliases]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map(escape)
        .join("|");
      return {
        term: e.term,
        regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms})(?![\\p{L}\\p{N}])`, "iu"),
      };
    });
}

export default function remarkGlossary(options: { entries: GlossaryEntry[] }) {
  const patterns = buildPatterns(options?.entries ?? []);
  return (tree: unknown) => {
    if (patterns.length === 0) return;
    // Entries already wrapped in this body — reset per run so every chapter/ending gets its own
    // first occurrence.
    const found = new Set<string>();
    walk(tree, patterns, found);
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, patterns: Pattern[], found: Set<string>) {
  if (!node || !Array.isArray(node.children)) return;
  const next: unknown[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitText(child.value, patterns, found));
    } else {
      walk(child, patterns, found);
      next.push(child);
    }
  }
  node.children = next;
}

// Split one text node around the earliest not-yet-found term match, recursing on the remainder
// so several different terms can first-occur inside the same node.
function splitText(value: string, patterns: Pattern[], found: Set<string>): unknown[] {
  let best: { term: string; index: number; length: number } | null = null;
  for (const p of patterns) {
    if (found.has(p.term)) continue;
    const m = p.regex.exec(value);
    if (m && (best === null || m.index < best.index)) {
      best = { term: p.term, index: m.index, length: m[0].length };
    }
  }
  if (!best) return [{ type: "text", value }];

  found.add(best.term);
  const out: unknown[] = [];
  if (best.index > 0) out.push({ type: "text", value: value.slice(0, best.index) });
  out.push({
    type: "gloss",
    data: { hName: "gloss", hProperties: { dataTerm: best.term } },
    children: [{ type: "text", value: value.slice(best.index, best.index + best.length) }],
  });
  const rest = value.slice(best.index + best.length);
  if (rest) out.push(...splitText(rest, patterns, found));
  return out;
}
