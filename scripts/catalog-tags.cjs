// The live tag list — the source of truth for "does this tag already exist?".
//
//   node scripts/catalog-tags.cjs --api <baseUrl>     # the live catalog (what actually matters)
//   node scripts/catalog-tags.cjs --local             # local files under Content/, no API needed
//
// Tags are book data (BookMeta.tags in Cosmos), not code, so CLAUDE.md's table is only a glossary
// of meanings and can lag reality. Before tagging a book you need the union of tags across every
// book the catalog is serving, which used to mean hand-rolling a curl-plus-json-parse pipeline —
// several attempts, a stray books.tmp.json left in the working tree, and a `git clean` to undo it.
//
// The prod API host deliberately does not live in this repo (committed files describe prod
// abstractly; the host is in the local runbook), so pass it with --api or set AI_MYSTERIES_API.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content");
const DEFAULT_API = process.env.AI_MYSTERIES_API || "http://localhost:5180";

function fromLocalFiles() {
  return fs
    .readdirSync(CONTENT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT, d.name, "meta.json")))
    .map((d) => {
      const meta = JSON.parse(fs.readFileSync(path.join(CONTENT, d.name, "meta.json"), "utf8"));
      return { title: meta.title || d.name, tags: meta.tags || [] };
    });
}

async function fromApi(base) {
  const url = `${base.replace(/\/$/, "")}/api/books`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  const books = await res.json();
  if (!Array.isArray(books)) throw new Error(`${url} did not return an array of books`);
  return books.map((b) => ({ title: b.title, tags: b.tags || [] }));
}

async function main() {
  const args = process.argv.slice(2);
  const local = args.includes("--local");
  const ai = args.indexOf("--api");
  const base = ai !== -1 ? args[ai + 1] : DEFAULT_API;

  let books;
  let source;
  if (local) {
    books = fromLocalFiles();
    source = `local files (${path.relative(ROOT, CONTENT)})`;
  } else {
    books = await fromApi(base);
    source = base;
  }

  const counts = new Map();
  for (const b of books) {
    for (const t of b.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const untagged = books.filter((b) => !b.tags.length).map((b) => b.title);

  // Sort by frequency, then alphabetically. The frequency is useful signal on its own: a tag on one
  // book is narrow-but-real, and a tag on thirty is doing no filtering work.
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const width = Math.max(...rows.map(([t]) => t.length), 4);

  console.log(`${books.length} books, ${rows.length} distinct tags   [source: ${source}]\n`);
  for (const [tag, n] of rows) {
    console.log(`  ${tag.padEnd(width)}  ${String(n).padStart(3)} book${n === 1 ? "" : "s"}`);
  }
  console.log(`\n  reuse-first: ${rows.map(([t]) => t).join(", ")}`);
  if (untagged.length) console.log(`\n  NOTE: untagged books: ${untagged.join(", ")}`);
  console.log(
    "\n  Add a new tag only when nothing above covers the concept — two tags for one idea just\n" +
      "  split the same filter. Narrow-but-real is fine (see the glossary in CLAUDE.md for meanings).",
  );
}

main().catch((err) => {
  console.error(`catalog-tags: ${err.message}`);
  if (!process.argv.includes("--local")) {
    console.error("  (pass --api <baseUrl>, set AI_MYSTERIES_API, or use --local to read Content/ instead)");
  }
  process.exit(1);
});
