// Queue bookkeeping check — catches a built book that never left the idea queue.
//
//   node scripts/queue-check.cjs          # start of a build: stale rows fail, an in-progress row warns
//   node scripts/queue-check.cjs --end    # end of a build: any in-progress row fails too
//
// Why this exists: "move the queue row" is two operations (delete from docs/book-ideas.md, append to
// docs/book-ideas-archive.md). A build on 2026-09-14 did only the append, reported "row removed"
// anyway, and nothing noticed — docs/ is gitignored, so `git status` can't see it, and the next build
// skips non-queued rows, so a stale `🛠 in progress` row would sit there forever. A leftover
// in-progress marker also means "a build was interrupted", which could one day trigger a rebuild.
//
// A queue row is STALE when its idea number is already in the archive, or its working title matches
// a shipped book's title. Idea numbers are never reused (add-todays-book), so a number match is proof.
// Exit 0 = clean, 1 = problems found, 2 = the files couldn't be read.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const QUEUE = path.join(ROOT, "docs", "book-ideas.md");
const ARCHIVE = path.join(ROOT, "docs", "book-ideas-archive.md");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content");

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/\*\*|`/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Numbered table rows only: "| 92 | ⬜ queued | Title | …".
function rows(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^\|\s*\d+\s*\|/.test(l))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .map((c) => ({ n: Number(c[0]), status: c[1] || "", title: c[2] || "", cells: c }));
}

function main() {
  const end = process.argv.includes("--end");
  for (const f of [QUEUE, ARCHIVE]) {
    if (!fs.existsSync(f)) throw new Error(`missing ${path.relative(ROOT, f)} (gitignored — run in a working copy that has it)`);
  }

  const queue = rows(QUEUE);
  const archive = new Map(rows(ARCHIVE).map((r) => [r.n, r]));
  const shipped = new Map();
  if (fs.existsSync(CONTENT)) {
    for (const d of fs.readdirSync(CONTENT, { withFileTypes: true })) {
      const meta = path.join(CONTENT, d.name, "meta.json");
      if (!d.isDirectory() || !fs.existsSync(meta)) continue;
      try {
        shipped.set(norm(JSON.parse(fs.readFileSync(meta, "utf8")).title || d.name), d.name);
      } catch {}
    }
  }

  const errors = [];
  const warnings = [];
  for (const r of queue) {
    const label = `#${r.n} "${r.title}" (${r.status})`;
    const built = archive.get(r.n);
    const bookId = shipped.get(norm(r.title));
    if (built) {
      const id = (built.cells.find((c) => /^`[^`]+`$/.test(c)) || "").replace(/`/g, "");
      errors.push(`${label} is already in the archive as built${id ? ` (${id})` : ""} — delete this row from book-ideas.md`);
    } else if (bookId) {
      errors.push(`${label} matches shipped book ${bookId} — move it to the archive (✅ built) and delete it from book-ideas.md`);
    } else if (/in progress/i.test(r.status)) {
      const msg = `${label} is still marked in progress`;
      if (end) errors.push(`${msg} — the build must finish its bookkeeping (archive it and delete the row) or reset it to ⬜ queued`);
      else warnings.push(`${msg} — an earlier build was interrupted: resume that book, or reset the row to ⬜ queued`);
    }
  }

  const queued = queue.filter((r) => /queued/i.test(r.status)).length;
  for (const w of warnings) console.log(`warn: ${w}`);
  for (const e of errors) console.log(`FAIL: ${e}`);
  if (!errors.length) console.log(`queue OK — ${queue.length} row(s), ${queued} queued${end ? ", none in progress" : ""}, nothing already built`);
  process.exit(errors.length ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`queue-check: ${err.message}`);
  process.exit(2);
}
