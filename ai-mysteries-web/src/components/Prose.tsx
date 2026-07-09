import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import remarkXref from "../lib/remark-xref";
import remarkGlossary from "../lib/remark-glossary";
import XrefMarker from "./XrefMarker";
import GlossaryTerm from "./GlossaryTerm";
import { CluesContext } from "../lib/clues-context";
import { GlossaryContext } from "../lib/glossary-context";
import type { XrefMarker as XrefMarkerData, Clue, GlossaryEntry } from "../lib/types";
import "../styles/prose.css";

interface ProseProps {
  children: string;
  // Cross-reference markers for an ending body; injected as tokens before rendering. Omitted
  // for chapters (the reader) and the special ending.
  markers?: XrefMarkerData[];
  // The clues those markers reference, so each glyph can resolve its popover content.
  clues?: Record<string, Clue>;
  // Unfamiliar-word definitions for this book; the first occurrence of each term in this body
  // gets a dotted underline with a definition popover. Omitted → no underlines.
  glossary?: GlossaryEntry[];
}

// Splice `{{xref:ID}}` tokens into the body at each marker's resolved offset. A marker whose
// snippet no longer matches the body (prose edited without regenerating) is skipped rather
// than misplaced. Insert back-to-front so earlier offsets stay valid.
function injectMarkers(body: string, markers: XrefMarkerData[]): string {
  const valid = markers
    .filter((m) => body.slice(m.index - m.snippet.length, m.index) === m.snippet)
    .sort((a, b) => b.index - a.index);
  let out = body;
  for (const m of valid) {
    out = out.slice(0, m.index) + `{{xref:${m.clueId}}}` + out.slice(m.index);
  }
  return out;
}

const components = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xref: ({ node }: any) => <XrefMarker clueId={node?.properties?.dataClue} />,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gloss: ({ node, children }: any) => (
    <GlossaryTerm term={node?.properties?.dataTerm}>{children}</GlossaryTerm>
  ),
} as Components;

export default function Prose({ children, markers, clues, glossary }: ProseProps) {
  const body = markers && markers.length ? injectMarkers(children, markers) : children;
  // remark-glossary runs after remark-xref so injected xref nodes are already out of the text.
  const plugins = useMemo<PluggableList>(
    () =>
      glossary && glossary.length
        ? [remarkGfm, remarkXref, [remarkGlossary, { entries: glossary }]]
        : [remarkGfm, remarkXref],
    [glossary]
  );
  const glossaryByTerm = useMemo(() => {
    const map: Record<string, GlossaryEntry> = {};
    for (const e of glossary ?? []) map[e.term] = e;
    return map;
  }, [glossary]);
  return (
    <CluesContext.Provider value={clues ?? {}}>
      <GlossaryContext.Provider value={glossaryByTerm}>
        <div className="prose">
          <ReactMarkdown remarkPlugins={plugins} components={components}>
            {body}
          </ReactMarkdown>
        </div>
      </GlossaryContext.Provider>
    </CluesContext.Provider>
  );
}
