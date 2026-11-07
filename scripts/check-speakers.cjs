// Lint a book's dialogue speaker tags (`{{say:<speaker-id>}}`, multi-voice read-aloud) against its
// `voices.cast` in meta.json. Run from the repo root:
//
//   node scripts/check-speakers.cjs <bookId>              # one book
//   node scripts/check-speakers.cjs <bookId> --content <dir>   # a Content folder other than the default
//
// Fails (exit 1) on:
//   * a malformed token (`{{say: Ann}}`, `{{say:}}`, `{say:ann}}`, ...)
//   * a tag whose speaker id isn't in voices.cast (or any tag in a book with no cast)
//   * a tag with no quote after it in its paragraph (it would voice nothing)
//   * a tag placed before Markdown line syntax (`#`, `>`, `- `, `1. `) — put it after, right
//     before the quote, or the read-aloud text stops matching the page
// Warns on quoted dialogue left untagged in a book that has a cast (it is read by the narrator).
// A book without a cast and without tags passes: it simply has a single narrator.
//
// verify-book.cjs runs this too. The API applies the same rules when it loads a book, so a book
// that fails here also fails to seed.

const fs = require("fs");
const path = require("path");
const { VALID_ID } = require("./lib/speaker-tags.cjs");

const DEFAULT_CONTENT = path.join(__dirname, "..", "ai-mysteries-api", "Content");

// Anything that looks like an attempt at a say-token, well-formed or not.
const CANDIDATE = /\{+\s*say\s*:[^}\n]*\}*/g;
const WELL_FORMED = /^\{\{say:([^}]*)\}\}$/;
const QUOTE = /["“]/;
const LINE_SYNTAX = /^(#{1,6}\s|>|[-*+]\s|\d+\.\s)/;

function checkSpeakers(bookId, { content = DEFAULT_CONTENT } = {}) {
  const dir = path.join(content, bookId);
  const errors = [];
  const warnings = [];
  if (!fs.existsSync(dir)) {
    errors.push(`no such book: ${bookId} (looked in ${dir})`);
    return { errors, warnings, cast: null };
  }

  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const meta = fs.existsSync(path.join(dir, "meta.json")) ? read("meta.json") : {};
  const cast = meta.voices && meta.voices.cast ? meta.voices.cast : null;

  const files = [
    ...(fs.existsSync(path.join(dir, "book.json")) ? read("book.json") : []).map((c) => path.join("book", `${c.slug}.md`)),
    ...(fs.existsSync(path.join(dir, "endings.json")) ? read("endings.json") : []).map((e) => path.join("endings", `${e.slug}.md`)),
  ];

  let untagged = 0;
  for (const rel of files) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");

    // Walk paragraphs, keeping each one's starting line for the messages.
    let offset = 0;
    for (const para of text.split(/(\n\s*\n)/)) {
      const start = offset;
      offset += para.length;
      if (/^\n\s*\n$/.test(para) || !para.trim()) continue;
      const lineOf = (i) => text.slice(0, start + i).split("\n").length;

      let tags = 0;
      for (const m of para.matchAll(CANDIDATE)) {
        const where = `${rel}:${lineOf(m.index)}`;
        const ok = WELL_FORMED.exec(m[0]);
        if (!ok || !VALID_ID.test(ok[1])) {
          errors.push(`${where}: malformed speaker tag ${m[0]} — write {{say:<kebab-id>}}`);
          continue;
        }
        tags++;
        const id = ok[1];
        if (!cast) errors.push(`${where}: tags speaker "${id}", but meta.json has no voices.cast`);
        else if (!Object.prototype.hasOwnProperty.call(cast, id))
          errors.push(`${where}: tags speaker "${id}", which is not in voices.cast (${Object.keys(cast).join(", ")})`);

        const after = para.slice(m.index + m[0].length);
        if (!QUOTE.test(after)) errors.push(`${where}: {{say:${id}}} has no quote after it in its paragraph`);
        if (LINE_SYNTAX.test(after.replace(/^[ \t]+/, "")))
          errors.push(`${where}: {{say:${id}}} sits before Markdown line syntax — move it after, right before the quote`);
      }
      if (cast && !tags && QUOTE.test(para)) {
        untagged++;
        if (untagged <= 5) warnings.push(`${rel}:${lineOf(0)}: quoted dialogue with no speaker tag (the narrator reads it)`);
      }
    }
  }
  if (untagged > 5) warnings.push(`...and ${untagged - 5} more untagged dialogue paragraph(s)`);
  return { errors, warnings, cast };
}

module.exports = { checkSpeakers };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const ci = argv.indexOf("--content");
  const content = ci >= 0 ? argv[ci + 1] : undefined;
  const bookId = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--content");
  if (!bookId) {
    console.error("usage: node scripts/check-speakers.cjs <bookId> [--content <dir>]");
    process.exit(2);
  }
  const { errors, warnings, cast } = checkSpeakers(bookId, { content });
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.log(`  FAIL  ${e}`);
  if (errors.length) {
    console.log(`check-speakers: ${bookId}: ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log(
    `check-speakers: ${bookId}: OK${cast ? ` (${Object.keys(cast).length} cast voice(s))` : " (no voice cast — single narrator)"}`,
  );
}
