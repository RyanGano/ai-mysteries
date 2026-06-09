// Build-time guard for the cross-reference data. Runs from `npm run build`. Validates the
// committed generated artifacts against the committed content WITHOUT needing the gitignored
// docs/EndingClueMap.md (so it works in CI where that file is absent).
//
// Checks:
//   1. Every marker's clueId exists in clues.ts.
//   2. Every marker's snippet still matches the ending body at its offset (no prose drift).
//   3. Every clue passage is still a verbatim substring of its chapter (no manuscript drift).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENDINGS_DIR = path.join(ROOT, "ai-mysteries-web", "src", "content", "endings");
const BOOK_DIR = path.join(ROOT, "ai-mysteries-web", "src", "content", "book");

// The generated files end with a single `export const <name> = <JSON>;`, so the JSON is
// everything between that `=` and the trailing `;`.
function loadExport(file, name) {
  const text = fs.readFileSync(file, "utf8");
  const decl = `export const ${name}`;
  const start = text.indexOf(decl);
  if (start === -1) throw new Error(`${path.basename(file)}: no "${decl}"`);
  const eq = text.indexOf("=", start);
  const json = text
    .slice(eq + 1)
    .trim()
    .replace(/;\s*$/, "");
  return JSON.parse(json);
}

function readBody(dir, slug) {
  const p = path.join(dir, `${slug}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function main() {
  const clues = loadExport(path.join(ENDINGS_DIR, "clues.ts"), "clues");
  const xrefMarkers = loadExport(path.join(ENDINGS_DIR, "xref-markers.ts"), "xrefMarkers");
  const errors = [];

  for (const [code, entry] of Object.entries(xrefMarkers)) {
    const body = readBody(ENDINGS_DIR, entry.slug);
    if (body == null) {
      errors.push(`${code}: ending file ${entry.slug}.md is missing`);
      continue;
    }
    for (const m of entry.markers) {
      if (!clues[m.clueId]) {
        errors.push(`${code}: marker references unknown clue "${m.clueId}"`);
      }
      const actual = body.slice(m.index - m.snippet.length, m.index);
      if (actual !== m.snippet) {
        errors.push(
          `${code}: marker ${m.clueId} drifted at index ${m.index}\n    expected: ${JSON.stringify(m.snippet)}\n    found:    ${JSON.stringify(actual)}`
        );
      }
    }
  }

  for (const [id, clue] of Object.entries(clues)) {
    const body = readBody(BOOK_DIR, clue.chapterSlug);
    if (body == null) {
      errors.push(`Clue ${id}: chapter file ${clue.chapterSlug}.md is missing`);
      continue;
    }
    for (const passage of clue.passages) {
      if (!body.includes(passage)) {
        errors.push(`Clue ${id}: passage no longer in ${clue.chapterSlug}.md:\n    ${JSON.stringify(passage)}`);
      }
    }
  }

  if (errors.length) {
    console.error(`check-xrefs: ${errors.length} problem(s) — regenerate with: node scripts/gen-xrefs.cjs\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const markerCount = Object.values(xrefMarkers).reduce((n, e) => n + e.markers.length, 0);
  console.log(
    `check-xrefs: OK (${Object.keys(clues).length} clues, ${Object.keys(xrefMarkers).length} endings, ${markerCount} markers).`
  );
}

main();
