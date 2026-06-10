import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkXref from "../lib/remark-xref";
import XrefMarker from "./XrefMarker";
import { CluesContext } from "../lib/clues-context";
import type { XrefMarker as XrefMarkerData, Clue } from "../lib/types";
import "../styles/prose.css";

interface ProseProps {
  children: string;
  // Cross-reference markers for an ending body; injected as tokens before rendering. Omitted
  // for chapters (the reader) and the special ending.
  markers?: XrefMarkerData[];
  // The clues those markers reference, so each glyph can resolve its popover content.
  clues?: Record<string, Clue>;
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
} as Components;

export default function Prose({ children, markers, clues }: ProseProps) {
  const body = markers && markers.length ? injectMarkers(children, markers) : children;
  return (
    <CluesContext.Provider value={clues ?? {}}>
      <div className="prose">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkXref]} components={components}>
          {body}
        </ReactMarkdown>
      </div>
    </CluesContext.Provider>
  );
}
