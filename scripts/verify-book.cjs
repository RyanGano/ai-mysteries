// End-to-end check that a book is actually playable, against a running API.
//
//   node scripts/verify-book.cjs <bookId>                        # local (http://localhost:5180)
//   node scripts/verify-book.cjs <bookId> --api <baseUrl>        # any host
//   node scripts/verify-book.cjs <bookId> --api <prod> --wait 90 # poll until prod serves it
//
// Replaces the Phase 6 / Phase 7 checklist walk, which used to be done with throwaway inline
// `node -e` snippets rewritten from scratch on every build. Same assertions, one call, and the
// failures name themselves.
//
// Two things worth knowing before pointing this at prod:
//
//   * `endings/*` is rate-limited to 30 requests/min per IP. The draw count is deliberately small
//     and --draws is capped so a verification run can't trip it. A 429 is reported as a rate limit,
//     not as a broken book.
//   * every random draw increments the book's readCount, which is what drives the 1-in-1000 special
//     ending cadence. A handful of draws is noise, but this is not something to run in a loop.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content");
const DEFAULT_API = process.env.AI_MYSTERIES_API || "http://localhost:5180";
const MAX_DRAWS = 10;
const BOGUS_CODE = "ZZQ9"; // canonical shape, deliberately not a real code

let pass = 0;
const failures = [];
const notes = [];

function ok(label, extra) {
  pass++;
  console.log(`  PASS  ${label}${extra ? `  — ${extra}` : ""}`);
}
function fail(label, why) {
  failures.push(`${label}: ${why}`);
  console.log(`  FAIL  ${label}\n          ${why}`);
}
function note(text) {
  notes.push(text);
  console.log(`  note  ${text}`);
}

async function get(base, route, { raw = false } = {}) {
  const url = `${base.replace(/\/$/, "")}${route}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error(`RATE_LIMITED on ${route} — endings/* allows 30/min per IP; wait a minute and re-run`);
  return { res, body: raw ? null : res.ok ? await res.json().catch(() => null) : null, url };
}

async function postJson(base, route, payload) {
  const url = `${base.replace(/\/$/, "")}${route}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) throw new Error(`RATE_LIMITED on ${route} — endings/* allows 30/min per IP; wait a minute and re-run`);
  return { res, body: res.ok ? await res.json().catch(() => null) : null, url };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// After a seed, the prod API only picks the book up on its next refresh poll (~60s), so "not there
// yet" is expected rather than a failure. Poll instead of guessing a sleep length.
async function waitForBook(base, bookId, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      const { body } = await get(base, "/api/books");
      if (Array.isArray(body) && body.some((b) => b.id === bookId || b.bookId === bookId)) {
        if (attempt > 1) note(`book appeared after ${attempt} poll(s)`);
        return true;
      }
    } catch (err) {
      if (String(err.message).startsWith("RATE_LIMITED")) throw err;
    }
    if (Date.now() >= deadline) return false;
    await sleep(5000);
  }
}

async function main() {
  // Single pass: `--name value` pairs into flags, the first bare token is the bookId.
  const argv = process.argv.slice(2);
  const flags = {};
  let bookId = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      flags[argv[i].slice(2)] = argv[i + 1] != null && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else if (bookId == null) {
      bookId = argv[i];
    }
  }
  const base = typeof flags.api === "string" ? flags.api : DEFAULT_API;
  const wait = Number(flags.wait) || 0;
  let draws = Number(flags.draws) || 6;

  if (!bookId) {
    console.error("usage: node scripts/verify-book.cjs <bookId> [--api <baseUrl>] [--wait <seconds>] [--draws <n>]");
    process.exit(2);
  }
  if (!Number.isFinite(draws) || draws < 1) draws = 6;
  if (draws > MAX_DRAWS) {
    draws = MAX_DRAWS;
    note(`--draws capped at ${MAX_DRAWS} to stay inside the endings rate limit`);
  }

  console.log(`verify-book: ${bookId}\n  api: ${base}\n`);

  // --- catalog -------------------------------------------------------------
  if (wait > 0) {
    const appeared = await waitForBook(base, bookId, wait);
    if (!appeared) {
      fail("book appears in /api/books", `still absent after ${wait}s (a seed reaches prod within ~60s; did the seed run?)`);
      return finish();
    }
  }

  const catalog = await get(base, "/api/books");
  if (!catalog.res.ok || !Array.isArray(catalog.body)) {
    fail("GET /api/books", `${catalog.res.status} ${catalog.res.statusText} at ${catalog.url}`);
    return finish();
  }
  const entry = catalog.body.find((b) => b.id === bookId || b.bookId === bookId);
  if (!entry) {
    fail("book appears in /api/books", `catalog has ${catalog.body.length} books, none with id "${bookId}"`);
    return finish();
  }
  ok("book appears in /api/books", `${catalog.body.length} books total`);
  ok("catalog metadata", `"${entry.title}" · ${entry.readingTime || "(no reading time)"} · [${(entry.tags || []).join(", ")}]`);

  if (!entry.readingTime) fail("readingTime is present", "empty — meta.json wordCount is probably 0 or absent");
  if (!(entry.tags || []).length) fail("tags are present", "the catalog card would render with no tags");
  if (!entry.coverImage) fail("coverImage is set", "no cover URL in the catalog payload");

  // --- chapters ------------------------------------------------------------
  const toc = await get(base, `/api/books/${bookId}/chapters`);
  if (!toc.res.ok || !Array.isArray(toc.body) || !toc.body.length) {
    fail("GET chapters", `${toc.res.status} — expected a non-empty table of contents`);
  } else {
    ok("chapter list", `${toc.body.length} chapters`);
    // The route returns a ChapterNavDto: { chapter: {slug,title,body}, prev, next, isFirst, isLast }
    // — the prose is at chapter.body, not body.
    let broken = 0;
    let lastPayload = null;
    for (const c of toc.body) {
      const r = await get(base, `/api/books/${bookId}/chapters/${c.slug}`);
      const prose = r.body && r.body.chapter && r.body.chapter.body;
      if (!r.res.ok || !prose || !prose.trim()) {
        broken++;
        fail(`chapter "${c.slug}" resolves`, `${r.res.status}${r.res.ok ? " but chapter.body was empty" : ""}`);
      }
      lastPayload = r.body;
    }
    if (!broken) ok("every chapter body resolves", `${toc.body.length}/${toc.body.length}, all non-empty`);

    if (lastPayload) {
      if (lastPayload.isLast && !lastPayload.next) {
        ok("last chapter ends the book", "isLast + no `next`, so the payoff copy and reveal CTA render");
      } else {
        fail("last chapter ends the book", `isLast=${lastPayload.isLast}, next=${JSON.stringify(lastPayload.next)}`);
      }
    }
  }

  // --- random draws --------------------------------------------------------
  // Mirrors the reader's session: accumulate `seen` and pass the current code as excludeCode, then
  // assert the API never repeats an ending and never repeats a culprit combination back to back.
  const seen = [];
  const drawn = [];
  let exhaustedEarly = false;
  let prevCulprits = null;
  let excludeCode = null;

  for (let i = 0; i < draws; i++) {
    const r = await postJson(base, `/api/books/${bookId}/endings/random`, { excludeCode, seen });
    if (!r.res.ok || !r.body) {
      fail("POST endings/random", `${r.res.status} on draw ${i + 1}`);
      break;
    }
    if (r.body.exhausted) {
      exhaustedEarly = true;
      note(`pool exhausted after ${i} draw(s) — expected only if the book has ${i} ordinary endings`);
      break;
    }
    const code = r.body.code;
    if (!code) {
      fail("POST endings/random", `draw ${i + 1} returned no code and no exhausted flag`);
      break;
    }
    if (seen.includes(code)) fail("draws never repeat", `code ${code} came back twice despite being in \`seen\``);
    seen.push(code);
    excludeCode = code;

    const e = await get(base, `/api/books/${bookId}/endings/${code}`);
    if (!e.res.ok || !e.body) {
      fail(`ending ${code} resolves`, `${e.res.status}`);
      continue;
    }
    drawn.push(e.body);
    const combo = [...(e.body.culprits || [])].sort().join(" & ");
    if (prevCulprits && combo === prevCulprits) {
      fail("no back-to-back culprit combo", `"${combo}" drawn twice in a row despite excludeCode`);
    }
    prevCulprits = combo;
    if (e.body.special) note(`draw ${i + 1} hit the SPECIAL ending (${code}) — a 1-in-1000 coincidence, or specialEnding is misconfigured`);
  }

  if (drawn.length) {
    ok("random draws vary", `${drawn.length} distinct endings, no repeated combination`);
    const titles = new Set(drawn.map((d) => d.title));
    if (titles.size > 1) {
      fail("shared ending title", `endings must all share one title, found ${titles.size}: ${[...titles].join(" | ")}`);
    } else {
      ok("all endings share one title", `"${[...titles][0]}"`);
    }
  } else if (!exhaustedEarly) {
    fail("random draws", "no ending could be drawn at all");
  }

  // --- code round-trip -----------------------------------------------------
  if (drawn.length) {
    const code = drawn[0].code;
    const again = await get(base, `/api/books/${bookId}/endings/${code}`);
    if (again.res.ok && again.body && again.body.code === code) {
      ok("code round-trips", `${code} returns the same ending on a direct fetch`);
    } else {
      fail("code round-trips", `re-fetching ${code} gave ${again.res.status}`);
    }
    const exists = await get(base, `/api/books/${bookId}/endings/${code}/exists`);
    if (exists.body && exists.body.exists === true) ok("exists check says yes for a real code");
    else fail("exists check", `expected {exists:true} for ${code}, got ${JSON.stringify(exists.body)}`);
  }

  const bogus = await get(base, `/api/books/${bookId}/endings/${BOGUS_CODE}`);
  if (bogus.res.status === 404) ok("bogus code is rejected", `${BOGUS_CODE} -> 404`);
  else fail("bogus code is rejected", `${BOGUS_CODE} returned ${bogus.res.status}, expected 404`);

  // --- cross-references ----------------------------------------------------
  // Xrefs are optional per the playbook, so absence is a note; a marker pointing at a clue the
  // payload doesn't carry is a real defect.
  if (drawn.length) {
    const withMarkers = drawn.filter((d) => (d.markers || []).length);
    if (!withMarkers.length) {
      note("no xref markers on any drawn ending — fine if this book skipped Phase 5, otherwise gen-xrefs didn't run");
    } else {
      let dangling = 0;
      for (const d of withMarkers) {
        for (const m of d.markers) {
          if (!d.clues || !d.clues[m.clueId]) dangling++;
        }
      }
      if (dangling) fail("markers resolve to clues", `${dangling} marker(s) reference a clue absent from the payload`);
      else ok("xref markers resolve", `${withMarkers.length}/${drawn.length} drawn endings carry markers`);
    }
  }

  // --- glossary ------------------------------------------------------------
  const glossary = await get(base, `/api/books/${bookId}/glossary`);
  if (!glossary.res.ok || !Array.isArray(glossary.body)) {
    fail("GET glossary", `${glossary.res.status} — expected an array (empty is fine)`);
  } else {
    ok("glossary endpoint", glossary.body.length ? `${glossary.body.length} terms` : "empty (fine — many books need none)");
  }

  // --- cover ---------------------------------------------------------------
  if (entry.coverImage) {
    const url = entry.coverImage.startsWith("http")
      ? entry.coverImage
      : `${base.replace(/\/$/, "")}${entry.coverImage}`;
    try {
      const res = await fetch(url);
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("image/")) ok("cover loads", `${res.status} ${type}`);
      else fail("cover loads", `${url} -> ${res.status} ${type || "(no content-type)"}`);
    } catch (err) {
      fail("cover loads", `${url} -> ${err.message}`);
    }
    if (!entry.coverImage.startsWith("http")) {
      note("coverImage is root-relative — fine locally, but shipping needs the absolute blob URL");
    }
  }

  // --- local hygiene -------------------------------------------------------
  // Cheap to check here and easy to forget: the catalog's reading time comes from meta.json.
  const metaPath = path.join(CONTENT, bookId, "meta.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (meta.selection && meta.selection.specialEnding === 0) {
      note("selection.specialEnding is 0 — the special ending is reachable only by typing its code");
    }
    if (entry.readingTime && meta.wordCount) {
      ok("meta.json is the source of the label", `wordCount ${meta.wordCount} -> ${entry.readingTime}`);
    }
  }

  return finish();
}

function finish() {
  console.log("");
  if (failures.length) {
    console.log(`verify-book: ${failures.length} FAILED, ${pass} passed${notes.length ? `, ${notes.length} note(s)` : ""}`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`verify-book: OK — ${pass} checks passed${notes.length ? `, ${notes.length} note(s) above` : ""}`);
  process.exit(0);
}

main().catch((err) => {
  const msg = String(err.message || err);
  console.error(`\nverify-book: ${msg}`);
  if (msg.includes("fetch failed")) {
    console.error("  Is the API running? Local: `dotnet run` in ai-mysteries-api/ (defaults to http://localhost:5180).");
    console.error("  For prod, pass --api <baseUrl> (the host is in the local runbook, not this repo).");
  }
  process.exit(2);
});
