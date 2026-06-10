// remark plugin: turns `{{xref:CLUE-ID}}` tokens (injected into an ending body by Prose) into
// custom mdast `xref` nodes. remark-rehype renders them as <xref data-clue="…"> via the
// data.hName / hProperties below, and Prose maps that element to the <XrefMarker> component.
//
// Tokens are inserted programmatically (Prose injects them from the API's per-ending markers),
// not authored by hand, so the syntax only has to survive markdown parsing — curly braces are not
// markdown-special, so the token stays in a single text node.

const TOKEN = /\{\{xref:([A-Z0-9-]+)\}\}/g;

export default function remarkXref() {
  return (tree: unknown) => walk(tree);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any) {
  if (!node || !Array.isArray(node.children)) return;
  const next: unknown[] = [];
  for (const child of node.children) {
    if (
      child.type === "text" &&
      typeof child.value === "string" &&
      child.value.includes("{{xref:")
    ) {
      const value: string = child.value;
      let last = 0;
      TOKEN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TOKEN.exec(value)) !== null) {
        if (m.index > last) next.push({ type: "text", value: value.slice(last, m.index) });
        next.push({
          type: "xref",
          data: { hName: "xref", hProperties: { dataClue: m[1] } },
          children: [],
        });
        last = m.index + m[0].length;
      }
      if (last < value.length) next.push({ type: "text", value: value.slice(last) });
    } else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}
