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

// Typography that looks identical in a terminal but isn't the same bytes. Clue passages are
// verbatim substrings, so a smart quote pasted where the manuscript has a straight one (or vice
// versa) fails the match with no visible difference — historically the point where authoring gave
// up and started reading gen-xrefs.cjs to work out what the format wanted.
const TYPOGRAPHY = [
  [/[‘’‚‛]/g, "'", "curly single quotes"],
  [/[“”„‟]/g, '"', "curly double quotes"],
  [/[–—―]/g, "-", "en/em dashes"],
  [/[…]/g, "...", "ellipsis character"],
  [/[   ]/g, " ", "non-breaking spaces"],
  [/\s+/g, " ", "whitespace runs"],
];

const normalize = (s) => TYPOGRAPHY.reduce((acc, [re, to]) => acc.replace(re, to), s);

// Explain WHY a verbatim passage no longer matches, and which single class of difference to fix.
// Returns extra indented lines to append to the error.
function diagnosePassage(body, passage) {
  const lines = [];

  if (normalize(body).includes(normalize(passage))) {
    const culprits = TYPOGRAPHY.filter(([re, to, label]) => {
      if (!label) return false;
      const fixP = passage.replace(re, to);
      const fixB = body.replace(re, to);
      return (fixP !== passage || fixB !== body) && fixB.includes(fixP);
    }).map(([, , label]) => label);
    lines.push(
      "    DIAGNOSIS: the text is present but the characters differ" +
        (culprits.length ? ` — ${culprits.join(", ")}` : " — invisible typography"),
    );
    lines.push("    FIX: copy the passage out of the chapter file again so the bytes match exactly.");
    return lines;
  }

  // Find how far the passage still matches, so the report points at the exact divergence rather
  // than dumping the whole quote and leaving the reader to diff it by eye.
  let len = 0;
  for (let n = Math.min(passage.length, 400); n >= 12; n--) {
    if (body.includes(passage.slice(0, n))) {
      len = n;
      break;
    }
  }
  if (len) {
    const at = body.indexOf(passage.slice(0, len));
    lines.push(`    DIAGNOSIS: matches for the first ${len} char(s), then diverges.`);
    lines.push(`      clue map has: ...${JSON.stringify(passage.slice(Math.max(0, len - 20), len + 40))}`);
    lines.push(`      chapter has:  ...${JSON.stringify(body.slice(Math.max(0, at + len - 20), at + len + 40))}`);
  } else {
    lines.push("    DIAGNOSIS: no part of this passage appears in the chapter — the prose was rewritten or the wrong chapter is recorded.");
  }
  lines.push("    FIX: update the quote in docs/<bookId>/EndingClueMap.md to match the chapter, then re-run gen-xrefs.cjs.");
  lines.push("         Never edit the manuscript to match a clue quote — the prose is the source of truth.");
  return lines;
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
      errors.push({ kind: "missing-file", text: `${bookId}/${code}: ending file ${entry.slug}.md is missing` });
      continue;
    }
    for (const m of entry.markers) {
      if (!clues[m.clueId]) {
        errors.push({
          kind: "unknown-clue",
          text: `${bookId}/${code}: marker references unknown clue "${m.clueId}" (not in the Clue Library)`,
        });
      }
      const actual = body.slice(m.index - m.snippet.length, m.index);
      if (actual !== m.snippet) {
        errors.push({
          kind: "marker-drift",
          text: `${bookId}/${code}: marker ${m.clueId} drifted at index ${m.index}\n    expected: ${JSON.stringify(m.snippet)}\n    found:    ${JSON.stringify(actual)}`,
        });
      }
    }
  }

  for (const [id, clue] of Object.entries(clues)) {
    const body = readBody(bookDir, clue.chapterSlug);
    if (body == null) {
      errors.push({
        kind: "missing-file",
        text: `${bookId}: clue ${id}: chapter file ${clue.chapterSlug}.md is missing (is chapterSlug right in the clue map?)`,
      });
      continue;
    }
    for (const passage of clue.passages) {
      if (!body.includes(passage)) {
        errors.push({
          kind: "passage-drift",
          text: [
            `${bookId}: clue ${id}: passage no longer in ${clue.chapterSlug}.md:`,
            `    ${JSON.stringify(passage)}`,
            ...diagnosePassage(body, passage),
          ].join("\n"),
        });
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
    console.error(`check-xrefs: ${errors.length} problem(s).\n`);
    for (const e of errors) console.error(`  - ${e.text}`);

    // The right remedy depends on the failure kind, and they are not the same. Saying "just
    // regenerate" for a drifted clue passage is actively wrong — gen-xrefs re-reads the same stale
    // quote and fails again, which is how a two-minute fix becomes a debugging loop.
    const kinds = new Set(errors.map((e) => e.kind));
    console.error("\n  What to do:");
    if (kinds.has("marker-drift")) {
      console.error("  * marker drifted        -> offsets are stale; re-run: node scripts/gen-xrefs.cjs <bookId>");
    }
    if (kinds.has("passage-drift")) {
      console.error("  * passage no longer in  -> the QUOTE is stale, not the prose. Fix the quote in");
      console.error("                             docs/<bookId>/EndingClueMap.md, then re-run gen-xrefs.cjs.");
      console.error("                             Regenerating alone will not help. Never edit the manuscript to");
      console.error("                             match a quote — see the per-error DIAGNOSIS above.");
    }
    if (kinds.has("unknown-clue")) {
      console.error("  * unknown clue          -> add it to the '## Clue Library' section of the clue map (the id");
      console.error("                             must match the [BRACKETED-ID] used in the marker excerpt), then regenerate.");
    }
    if (kinds.has("missing-file")) {
      console.error("  * missing file          -> a slug in the clue map or endings.json points at a file that isn't there.");
    }
    console.error("\n  Format contract: create_new_book.md -> Phase 5. You should not need to read gen-xrefs.cjs.");
    process.exit(1);
  }
  console.log(`check-xrefs: OK (${summaries.join("; ")}).`);
}

main();
