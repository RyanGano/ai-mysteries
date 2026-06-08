// One-off generator for the book reader content.
// Extracts Within_Tolerance_Clean.docx (local-only, gitignored source material)
// into committed per-chapter markdown files under src/content/book/ plus an
// index.ts registry. Run with:
//   node scripts/gen-book.cjs
//
// The committed artifacts are the .md files + index.ts; this script is just how
// they were built and can be re-run if the manuscript changes. The .docx itself
// is never committed (see source_materials/ policy in CLAUDE.md), so this script
// only works locally where the source material is present.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DOCX = path.join(ROOT, "source_materials", "Within_Tolerance_Clean.docx");
const OUT_DIR = path.join(ROOT, "src", "content", "book");

// --- Unzip document.xml from the .docx (a zip archive) -----------------------
function readDocumentXml() {
  const tmp = path.join(ROOT, "source_materials", "_dx");
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`unzip -o -q "${DOCX}" -d "${tmp}"`);
  return fs.readFileSync(path.join(tmp, "word", "document.xml"), "utf8");
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Wrap text in markdown emphasis markers while keeping surrounding whitespace
// outside the markers (so `* foo *` never happens).
function emphasize(t, marker) {
  if (!t.trim()) return t;
  const lead = t.match(/^\s*/)[0];
  const trail = t.match(/\s*$/)[0];
  return `${lead}${marker}${t.trim()}${marker}${trail}`;
}

// Parse the document into paragraphs. Returns { plain, md } per paragraph:
// `plain` is unformatted (used for heading detection); `md` preserves italic
// (*) and bold (**) runs as markdown for body rendering.
function parseParagraphs(xml) {
  const paras = xml.split(/<w:p[ >]/).slice(1);
  return paras.map((p) => {
    const runs = [...p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)];
    let plain = "";
    let md = "";
    for (const [, run] of runs) {
      const t = [...run.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
        .map((m) => decodeEntities(m[1]))
        .join("");
      if (!t) continue;
      plain += t;
      let wrapped = t;
      if (/<w:b\/>/.test(run)) wrapped = emphasize(wrapped, "**");
      if (/<w:i\/>/.test(run)) wrapped = emphasize(wrapped, "_");
      md += wrapped;
    }
    return { plain, md };
  });
}

const HEADING_RE = /^(Prologue|Epilogue|Chapter\s+\d+\s*[—-].*)$/i;

function slugFor(heading) {
  const t = heading.trim();
  if (/^Prologue$/i.test(t)) return "prologue";
  if (/^Epilogue$/i.test(t)) return "epilogue";
  const m = t.match(/^Chapter\s+(\d+)/i);
  return `chapter-${m[1]}`;
}

function main() {
  const xml = readDocumentXml();
  const paras = parseParagraphs(xml);

  // Group paragraphs into chapters. Anything before the first heading (the
  // title block / editorial subtitle) is discarded. Headings are detected on
  // the plain text; body paragraphs keep their markdown formatting.
  const chapters = [];
  let current = null;
  for (const { plain, md } of paras) {
    const heading = plain.trim();
    if (HEADING_RE.test(heading)) {
      current = { title: heading, slug: slugFor(heading), paras: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue; // pre-Prologue title block
    current.paras.push(md.replace(/\s+$/g, ""));
  }

  // Clean each chapter: drop empty leading/trailing paragraphs, and strip the
  // book's final printed line (the URL) from the Epilogue — the reader supplies
  // its own closing call-to-action.
  for (const ch of chapters) {
    let lines = ch.paras;
    if (ch.slug === "epilogue") {
      lines = lines.filter((l) => !/therealending\.com/i.test(l));
    }
    // Trim blank paragraphs from both ends.
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    ch.body = lines.filter((l) => l.trim().length > 0).join("\n\n") + "\n";
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write one markdown file per chapter (body only; the title lives in index.ts).
  for (const ch of chapters) {
    fs.writeFileSync(path.join(OUT_DIR, `${ch.slug}.md`), ch.body);
  }

  // camelCase a slug into a valid JS identifier for the import binding.
  const ident = (slug) => slug.replace(/[-_]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));

  const imports = chapters
    .map((ch) => `import ${ident(ch.slug)} from "./${ch.slug}.md?raw";`)
    .join("\n");

  const entries = chapters
    .map(
      (ch) => `  {
    slug: ${JSON.stringify(ch.slug)},
    title: ${JSON.stringify(ch.title)},
    body: ${ident(ch.slug)},
  },`
    )
    .join("\n");

  const out = `${imports}

export interface Chapter {
  slug: string;
  title: string;
  body: string;
}

// The book, in reading order. Prologue → Chapters 1–15 → Epilogue.
export const chapters: Chapter[] = [
${entries}
];
`;

  fs.writeFileSync(path.join(OUT_DIR, "index.ts"), out);
  console.log(`Wrote ${chapters.length} chapters: ${chapters.map((c) => c.slug).join(", ")}`);
}

main();
