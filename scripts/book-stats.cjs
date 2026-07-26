// Word counts and reading time for a book — the one call that answers "is this the right length?"
//
//   node scripts/book-stats.cjs <bookId> [--target <minutes>] [--json]
//   node scripts/book-stats.cjs                       # every book, one line each
//
// Why this exists: authoring used to measure length with ad-hoc `wc -w` and throwaway inline
// node snippets, then trim/expand in a write -> count -> edit loop that cost dozens of file edits
// per book and still missed the target. Measure once, here, and accept the result.
//
// Two numbers matter and they are NOT the same:
//
//   * DISPLAYED time — what the catalog shows. The API derives it from meta.json `wordCount` at a
//     flat 250 wpm (Services/ReadingTime.cs), with the same rounding mirrored below. This is the
//     number a reader sees, so it's the one a brief's "~20 min" should be measured against.
//   * TRUE-PACE time — how long the intended audience actually takes (~230 wpm adult, ~160 wpm
//     middle-grade). Useful sanity context; nothing displays it.
//
// `wordCount` counts CHAPTER BODIES ONLY (endings are excluded — a reader sees one ending, not all
// of them), whitespace-delimited, matching `wc -w`. Verified against all shipped books.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content");

// Keep in step with ai-mysteries-api/Services/ReadingTime.cs. If that constant or its rounding
// changes, change it here too — a drift here quietly sends authoring after the wrong target.
const DISPLAY_WPM = 250;
const TRUE_WPM = { adult: 230, kid: 160 };
// How far from the brief is fine. Prose that lands inside this is DONE — do not start trimming.
const TOLERANCE = 0.15;

const countWords = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

function displayedReadingTime(words) {
  if (words <= 0) return "";
  const minutes = Math.max(1, Math.round(words / DISPLAY_WPM));
  if (minutes < 60) {
    const rounded = minutes < 10 ? minutes : Math.round(minutes / 5) * 5;
    return `~${rounded} min read`;
  }
  let hours = Math.floor(minutes / 60);
  let remainder = Math.round((minutes % 60) / 5) * 5;
  if (remainder === 60) {
    hours++;
    remainder = 0;
  }
  return remainder === 0 ? `~${hours} hr read` : `~${hours} hr ${remainder} min read`;
}

// Displayed minutes as a number, for comparing against a --target.
const displayedMinutes = (words) => (words <= 0 ? 0 : Math.max(1, Math.round(words / DISPLAY_WPM)));

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function collect(bookId) {
  const dir = path.join(CONTENT, bookId);
  if (!fs.existsSync(dir)) throw new Error(`no such book: ${bookId} (looked in ${dir})`);

  const meta = readJson(path.join(dir, "meta.json"));
  const order = readJson(path.join(dir, "book.json"));

  const chapters = order.map((entry) => {
    const file = path.join(dir, "book", `${entry.slug}.md`);
    if (!fs.existsSync(file)) throw new Error(`book.json lists "${entry.slug}" but ${file} is missing`);
    return { slug: entry.slug, title: entry.title, words: countWords(fs.readFileSync(file, "utf8")) };
  });

  // Endings are reported for balance (one runaway ending is worth seeing) but never counted into
  // wordCount — a reader is shown exactly one.
  const endingsPath = path.join(dir, "endings.json");
  let endings = [];
  if (fs.existsSync(endingsPath)) {
    endings = readJson(endingsPath).map((e) => {
      const file = path.join(dir, "endings", `${e.slug}.md`);
      return {
        code: e.code,
        slug: e.slug,
        words: fs.existsSync(file) ? countWords(fs.readFileSync(file, "utf8")) : null,
      };
    });
  }

  const manuscript = chapters.reduce((n, c) => n + c.words, 0);
  const kid = (meta.tags || []).includes("Kid Friendly");

  return { bookId, meta, chapters, endings, manuscript, kid };
}

function report(book, target) {
  const { bookId, meta, chapters, endings, manuscript, kid } = book;
  const out = [];
  const pad = Math.max(...chapters.map((c) => c.slug.length), 12);

  out.push(`${meta.title}  (${bookId})`);
  out.push("");
  out.push("  chapters");
  for (const c of chapters) {
    out.push(`    ${c.slug.padEnd(pad)}  ${String(c.words).padStart(6)}w`);
  }
  out.push(`    ${"TOTAL".padEnd(pad)}  ${String(manuscript).padStart(6)}w   in ${chapters.length} chapters`);
  out.push("");

  const withWords = endings.filter((e) => e.words != null);
  if (endings.length) {
    const missing = endings.filter((e) => e.words == null);
    const sorted = withWords.map((e) => e.words).sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    out.push(
      `  endings    ${endings.length} total   ` +
        (sorted.length ? `min ${sorted[0]}w / median ${med}w / max ${sorted[sorted.length - 1]}w` : "(no bodies found)"),
    );
    if (missing.length) {
      out.push(`             MISSING BODIES: ${missing.map((e) => e.slug).join(", ")}`);
    }
    out.push("");
  }

  // meta.wordCount is what the catalog actually reads. A stale value silently mislabels the book,
  // and nothing else in the pipeline catches it.
  const declared = meta.wordCount;
  const mismatch = declared !== manuscript;
  out.push(`  meta.wordCount   ${declared == null ? "(absent)" : declared}${mismatch ? `   <-- MISMATCH, actual is ${manuscript}` : "   (matches)"}`);
  out.push(`  displayed        ${displayedReadingTime(manuscript)}   (${DISPLAY_WPM} wpm, what the catalog shows)`);
  out.push(
    `  true pace        ~${Math.round(manuscript / (kid ? TRUE_WPM.kid : TRUE_WPM.adult))} min ` +
      `for ${kid ? "a middle-grade" : "an adult"} reader (${kid ? TRUE_WPM.kid : TRUE_WPM.adult} wpm; not displayed anywhere)`,
  );

  let verdict = null;
  if (target != null) {
    const actual = displayedMinutes(manuscript);
    const delta = (actual - target) / target;
    const lo = Math.round(target * (1 - TOLERANCE) * DISPLAY_WPM);
    const hi = Math.round(target * (1 + TOLERANCE) * DISPLAY_WPM);
    const pct = `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`;
    const ok = Math.abs(delta) <= TOLERANCE;
    verdict = ok ? "ON TARGET" : delta > 0 ? "LONG" : "SHORT";
    out.push("");
    out.push(`  target           ~${target} min  =>  ${lo}-${hi}w acceptable (+/-${TOLERANCE * 100}%)`);
    out.push(`  verdict          ${verdict}  (${displayedMinutes(manuscript)} min, ${pct})`);
    out.push(
      ok
        ? "                   Length is settled. Do not trim or pad — record the actual and move on."
        : `                   ${delta > 0 ? "Over" : "Under"} by ~${Math.abs(manuscript - Math.round(target * DISPLAY_WPM))}w. ` +
          "Worth one adjustment pass, not a loop; if a second pass doesn't land it, keep the prose and record the actual.",
    );
  }

  if (mismatch) {
    out.push("");
    out.push(`  ACTION: set "wordCount": ${manuscript} in ${bookId}/meta.json — the catalog reads this field, not the files.`);
  }

  return { text: out.join("\n"), mismatch, verdict };
}

function summaryLine(book) {
  const declared = book.meta.wordCount;
  const flag = declared !== book.manuscript ? ` !! meta says ${declared == null ? "(absent)" : declared}` : "";
  return (
    `${book.bookId.padEnd(24)} ${String(book.manuscript).padStart(6)}w  ` +
    `${displayedReadingTime(book.manuscript).padEnd(18)} ${String(book.endings.length).padStart(3)} endings${flag}`
  );
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const ti = args.indexOf("--target");
  const target = ti !== -1 && args[ti + 1] != null ? Number(args[ti + 1]) : null;
  if (ti !== -1 && (!Number.isFinite(target) || target <= 0)) {
    console.error("--target needs a positive number of minutes");
    process.exit(2);
  }
  const bookId = args.find((a) => !a.startsWith("--") && a !== String(target));

  if (!bookId) {
    // No book named: one line per book. Doubles as a drift check across the whole catalog.
    const ids = fs
      .readdirSync(CONTENT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT, d.name, "meta.json")))
      .map((d) => d.name)
      .sort();
    let bad = 0;
    for (const id of ids) {
      try {
        const book = collect(id);
        if (book.meta.wordCount !== book.manuscript) bad++;
        console.log(summaryLine(book));
      } catch (err) {
        bad++;
        console.log(`${id.padEnd(24)} ERROR: ${err.message}`);
      }
    }
    console.log(`\n${ids.length} books` + (bad ? `, ${bad} with a wordCount mismatch or error` : ", all wordCounts match"));
    process.exit(bad ? 1 : 0);
  }

  const book = collect(bookId);
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          bookId,
          manuscriptWords: book.manuscript,
          declaredWordCount: book.meta.wordCount,
          wordCountMatches: book.meta.wordCount === book.manuscript,
          displayedReadingTime: displayedReadingTime(book.manuscript),
          displayedMinutes: displayedMinutes(book.manuscript),
          chapters: book.chapters,
          endings: book.endings,
          target,
        },
        null,
        2,
      ),
    );
    process.exit(book.meta.wordCount === book.manuscript ? 0 : 1);
  }

  const { text, mismatch } = report(book, target);
  console.log(text);
  // Exit non-zero only on a wordCount mismatch — that's a real defect. Being off-target is a
  // judgement call the report describes; it must not fail a build.
  process.exit(mismatch ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`book-stats: ${err.message}`);
  process.exit(2);
}
