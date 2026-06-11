// Guard for the cross-reference data. Run from the repo root:
//   node scripts/check-xrefs.cjs [bookId]
// With no argument it validates every book under ai-mysteries-api/Content/ that has
// cross-reference files; with a bookId it validates just that book (and fails if the
// files are missing). It needs only the generated artifacts + the book content, not
// the gitignored EndingClueMap.md — so it works wherever the Content/ folder exists.
//
// Checks, per book:
//   1. Every marker's clueId exists in clues.json.
//   2. Every marker's snippet still matches the ending body at its offset (no prose drift).
//   3. Every clue passage is still a verbatim substring of its chapter (no manuscript drift).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTENT_ROOT = path.join(ROOT, "ai-mysteries-api", "Content");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readBody(dir, slug) {
  const p = path.join(dir, `${slug}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function hasXrefData(bookId) {
  return (
    fs.existsSync(path.join(CONTENT_ROOT, bookId, "clues.json")) &&
    fs.existsSync(path.join(CONTENT_ROOT, bookId, "xref-markers.json"))
  );
}

function checkBook(bookId, errors) {
  const content = path.join(CONTENT_ROOT, bookId);
  const endingsDir = path.join(content, "endings");
  const bookDir = path.join(content, "book");
  const clues = loadJson(path.join(content, "clues.json"));
  const xrefMarkers = loadJson(path.join(content, "xref-markers.json"));

  for (const [code, entry] of Object.entries(xrefMarkers)) {
    const body = readBody(endingsDir, entry.slug);
    if (body == null) {
      errors.push(`${bookId}/${code}: ending file ${entry.slug}.md is missing`);
      continue;
    }
    for (const m of entry.markers) {
      if (!clues[m.clueId]) {
        errors.push(`${bookId}/${code}: marker references unknown clue "${m.clueId}"`);
      }
      const actual = body.slice(m.index - m.snippet.length, m.index);
      if (actual !== m.snippet) {
        errors.push(
          `${bookId}/${code}: marker ${m.clueId} drifted at index ${m.index}\n    expected: ${JSON.stringify(m.snippet)}\n    found:    ${JSON.stringify(actual)}`
        );
      }
    }
  }

  for (const [id, clue] of Object.entries(clues)) {
    const body = readBody(bookDir, clue.chapterSlug);
    if (body == null) {
      errors.push(`${bookId}: clue ${id}: chapter file ${clue.chapterSlug}.md is missing`);
      continue;
    }
    for (const passage of clue.passages) {
      if (!body.includes(passage)) {
        errors.push(`${bookId}: clue ${id}: passage no longer in ${clue.chapterSlug}.md:\n    ${JSON.stringify(passage)}`);
      }
    }
  }

  const markerCount = Object.values(xrefMarkers).reduce((n, e) => n + e.markers.length, 0);
  return { clues: Object.keys(clues).length, endings: Object.keys(xrefMarkers).length, markers: markerCount };
}

function main() {
  const named = process.argv[2];
  let bookIds;
  if (named) {
    if (!hasXrefData(named)) {
      console.error(`check-xrefs: no clues.json/xref-markers.json under Content/${named}/`);
      process.exit(1);
    }
    bookIds = [named];
  } else {
    bookIds = fs.existsSync(CONTENT_ROOT)
      ? fs
          .readdirSync(CONTENT_ROOT)
          .filter((d) => fs.statSync(path.join(CONTENT_ROOT, d)).isDirectory() && hasXrefData(d))
      : [];
    if (!bookIds.length) {
      console.log("check-xrefs: no books with cross-reference data found — nothing to check.");
      return;
    }
  }

  const errors = [];
  const summaries = [];
  for (const bookId of bookIds) {
    const s = checkBook(bookId, errors);
    summaries.push(`${bookId}: ${s.clues} clues, ${s.endings} endings, ${s.markers} markers`);
  }

  if (errors.length) {
    console.error(`check-xrefs: ${errors.length} problem(s) — regenerate with: node scripts/gen-xrefs.cjs <bookId>\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`check-xrefs: OK (${summaries.join("; ")}).`);
}

main();
